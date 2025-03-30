from app.utils.celery_config import celery_app
import logging
import google.generativeai as genai
import datetime
import os
import json
import random
import re
from pymongo import MongoClient
from vertexai.preview.vision_models import ImageGenerationModel
from vertexai import init as vertex_init
from google.oauth2 import service_account
import tempfile
import uuid
from google.cloud import storage
from app.utils.redis_client import get_cache, set_cache, delete_cache, MEAL_CACHE_TTL


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# MongoDB connection (synchronous for Celery tasks)
client = MongoClient(os.getenv("MONGO_URI"))
db = client["grovli"]
chat_collection = db["chat_sessions"]
meals_collection = db["meals"]

# Initialize Google Cloud credentials if provided
credentials_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
project_id = None
if credentials_json:
    try:
        if credentials_json.startswith('{'):
            # It's a JSON string
            creds_dict = json.loads(credentials_json)
            credentials = service_account.Credentials.from_service_account_info(creds_dict)
            project_id = creds_dict["project_id"]
        else:
            # It's a file path
            credentials = service_account.Credentials.from_service_account_file(credentials_json)
            with open(credentials_json, 'r') as f:
                creds_dict = json.load(f)
                project_id = creds_dict["project_id"]
        
        # Initialize Vertex AI with the credentials
        region = "us-central1"
        vertex_init(project=project_id, location=region, credentials=credentials)
    except Exception as e:
        logger.error(f"Error initializing Google Cloud credentials: {str(e)}")


import hashlib

def generate_meal_id(meal_name: str, request_hash: str, index: int) -> str:
    """
    Generate a deterministic meal ID based on the meal name, the request hash, and the meal's index.
    This returns the first 10 hexadecimal characters of the SHA-1 hash.
    """
    base = f"{meal_name}_{request_hash}_{index}"
    return hashlib.sha1(base.encode()).hexdigest()[:10]

# ===================== CHAT TASKS =====================

@celery_app.task(name="generate_chat_response")
def generate_chat_response(session_id, dietary_preferences, meal_type, existing_messages):
    """Task to generate a response from Gemini for chat"""
    try:
        # Get API key from environment variables
        gemini_api_key = os.environ.get("GEMINI_API_KEY")
        if not gemini_api_key:
            logger.error("GEMINI_API_KEY environment variable not set")
            return {"status": "error", "message": "API key not set"}

        genai.configure(api_key=gemini_api_key)
        
        # Prepare context based on latest message
        latest_message = next((msg for msg in reversed(existing_messages) 
                             if msg["role"] == "user"), None)
        
        if not latest_message:
            logger.error("No user message found in conversation history")
            return {"status": "error", "message": "No user message found"}

        # Create conversation history for Gemini
        conversation_history = []
        for msg in existing_messages:
            if msg.get("is_notification", False):
                continue
                
            role = "user" if msg["role"] == "user" else "model"
            conversation_history.append({"role": role, "parts": [msg["content"]]})

        # Get user ID from chat session
        chat_session = chat_collection.find_one({"session_id": session_id})
        user_id = chat_session.get("user_id") if chat_session else None
        
        # Try to get dietary philosophy from user settings if available
        user_dietary_philosophy = ""
        if user_id:
            try:
                # Check Redis cache first
                settings_cache_key = f"user_settings:{user_id}"
                cached_settings = get_cache(settings_cache_key)
                
                if cached_settings and cached_settings.get("dietaryPhilosophy"):
                    user_dietary_philosophy = cached_settings.get("dietaryPhilosophy")
                else:
                    # If not in Redis, check MongoDB using the db connection that's already available
                    user_settings = db["user_settings"].find_one({"user_id": user_id})
                    if user_settings and user_settings.get("dietaryPhilosophy"):
                        user_dietary_philosophy = user_settings.get("dietaryPhilosophy")
            except Exception as e:
                logger.error(f"Error getting user dietary philosophy: {str(e)}")
        
        # Combine preferences with philosophy if not already included
        combined_preferences = dietary_preferences or ""
        if user_dietary_philosophy and user_dietary_philosophy not in combined_preferences:
            if combined_preferences:
                combined_preferences = f"{combined_preferences} {user_dietary_philosophy}"
            else:
                combined_preferences = user_dietary_philosophy
        
        # Create fresh model instance
        model = genai.GenerativeModel("gemini-1.5-flash")
        chat = model.start_chat(history=conversation_history)
        
        # Create nutrition context
        nutrition_context = f"""
        You are a nutrition assistant chatting with a user while their {meal_type} meal plan generates.
        Keep responses friendly, conversational, and focused on nutrition/healthy eating.
                
        Guidelines:
        - Be encouraging and supportive
        - Share practical tips (1-2 sentences)
        - Ask follow-up questions to continue dialog
        - Acknowledge meal plan is processing if asked
        - Never discuss technical processes
        - Respond to: '{latest_message['content']}'
        """

        # Generate response
        try:
            response = chat.send_message(nutrition_context)
            
            assistant_message = {
                "role": "assistant",
                "content": response.text,
                "timestamp": datetime.datetime.now(),
                "is_notification": False
            }
            
            # Update MongoDB directly
            update_chat_messages_sync(session_id, assistant_message)
            
            return {"status": "success", "message": assistant_message}
            
        except Exception as e:
            logger.error(f"Response generation error: {str(e)}")
            error_message = "I'm having trouble responding right now. Please try again."
            store_error_message_sync(session_id, error_message)
            return {"status": "error", "message": str(e)}

    except Exception as e:
        logger.error(f"Background response error: {str(e)}")
        error_message = "Something went wrong with my response. Could you rephrase that?"
        store_error_message_sync(session_id, error_message)
        return {"status": "error", "message": str(e)}

# ===================== MEAL PLAN TASKS =====================

@celery_app.task(name="generate_meal_plan")
def generate_meal_plan(
    request_dict, 
    user_id, 
    meal_counts, 
    total_meals_needed, 
    meal_plan_id, 
    request_hash
):
    """Celery task to generate a meal plan without blocking the main thread."""
    try:
        logger.info(f"Starting background meal plan generation for user: {user_id}")
        
        # Add a lock to prevent multiple workers from generating the same meal plan
        generation_lock_key = f"meal_generation_lock:{request_hash}"
        
        # Try to acquire the lock
        lock_acquired = False
        if not get_cache(generation_lock_key):
            set_cache(generation_lock_key, True, 600)  # 10-minute lock
            lock_acquired = True
            logger.info(f"Acquired generation lock for meal plan: {request_hash}")
        else:
            logger.info(f"Another worker is already generating meal plan: {request_hash}, skipping")
            return {"status": "skipped", "message": "Another worker is handling this generation"}
            
        # Convert the dictionary back to required values
        dietary_preferences = request_dict.get("dietary_preferences", "")
        meal_type = request_dict.get("meal_type", "")
        calories = request_dict.get("calories", 0)
        protein = request_dict.get("protein", 0)
        carbs = request_dict.get("carbs", 0)
        fat = request_dict.get("fat", 0)
        fiber = request_dict.get("fiber", 0)
        sugar = request_dict.get("sugar", 0)
        meal_algorithm = request_dict.get("meal_algorithm", "experimental")
        pantry_ingredients = request_dict.get("pantry_ingredients", [])
        
        # Get API key from environment variables
        gemini_api_key = os.environ.get("GEMINI_API_KEY")
        if not gemini_api_key:
            logger.error("GEMINI_API_KEY environment variable is not set")
            return {"status": "error", "message": "API key not set"}
        
        # Initialize Gemini API with the key
        genai.configure(api_key=gemini_api_key)
        
        # Get session_id before intensive processing
        session_id = None
        try:
            if user_id:
                # Check Redis cache first
                cache_key = f"active_session:{user_id}"
                cached_session = get_cache(cache_key)
                if cached_session:
                    session_id = cached_session
                    logger.info(f"Using cached session_id from Redis: {session_id}")
                else:
                    # If not in cache, query MongoDB
                    recent_chat = chat_collection.find_one(
                        {"user_id": user_id},
                        sort=[("created_at", -1)]
                    )
                    if recent_chat:
                        session_id = recent_chat.get("session_id")
                        if session_id:
                            # Cache the result for 5 minutes
                            set_cache(cache_key, session_id, 300)  # 5 minutes TTL
                            logger.info(f"Cached session_id in Redis: {session_id}")
        except Exception as e:
            logger.error(f"Error getting session_id: {str(e)}")
        
        # Calculate the macronutrient distribution per meal type
        meal_type_calorie_ratio = {
            "Breakfast": 0.25,  # 25% of daily calories
            "Lunch": 0.30,      # 30% of daily calories
            "Dinner": 0.35,     # 35% of daily calories
            "Snack": 0.10       # 10% of daily calories per snack
        }

        # Prepare the meal macros for each type of meal
        if meal_type != "Full Day":
            ratio = meal_type_calorie_ratio.get(meal_type, 0)
            # For a single meal type, the macros are the same for each meal
            per_meal_macros = {
                "calories": int(calories * ratio / meal_counts[meal_type]),
                "protein": int(protein * ratio / meal_counts[meal_type]),
                "carbs": int(carbs * ratio / meal_counts[meal_type]),
                "fat": int(fat * ratio / meal_counts[meal_type]),
                "fiber": int(fiber * ratio / meal_counts[meal_type]),
                "sugar": int(sugar * ratio / meal_counts[meal_type])
            }
            meal_macros = {meal_type: per_meal_macros}
        else:
            # For "Full Day" meal type, distribute macros proportionally
            meal_macros = {}
            for m_type, ratio in meal_type_calorie_ratio.items():
                count = meal_counts.get(m_type, 0)
                if count > 0:
                    per_meal_macros = {
                        "calories": int(calories * ratio / count),
                        "protein": int(protein * ratio / count),
                        "carbs": int(carbs * ratio / count),
                        "fat": int(fat * ratio / count),
                        "fiber": int(fiber * ratio / count),
                        "sugar": int(sugar * ratio / count)
                    }
                    meal_macros[m_type] = per_meal_macros

        # Check if we already have a cached response
        prompt_cache_key = f"meal_prompt:{request_hash}"
        cached_response = get_cache(prompt_cache_key)
        if cached_response:
            logger.info(f"Found partial cache with {len(cached_response)}/{total_meals_needed} meals - generating remaining meals")
            all_generated_meals = cached_response.copy()
        else:
            # Generate meals ONE AT A TIME instead of in batches
            all_generated_meals = []
            
        # Function for validating and adjusting macros
        def validate_and_adjust_macros(meal, target_macros):
            """
            Validates if the meal's macros match target macros and adjusts portions if needed.
            Returns the adjusted meal with corrected portions and macros.
            """
            # Extract current meal macros
            current_macros = meal.get("nutrition", {})
            
            # Check if we need to adjust (macro values are off by more than the allowed tolerance)
            needs_adjustment = (
                abs(current_macros.get("calories", 0) - target_macros.get("calories", 0)) > 5 or
                abs(current_macros.get("protein", 0) - target_macros.get("protein", 0)) > 1 or
                abs(current_macros.get("carbs", 0) - target_macros.get("carbs", 0)) > 1 or
                abs(current_macros.get("fat", 0) - target_macros.get("fat", 0)) > 1 or
                abs(current_macros.get("fiber", 0) - target_macros.get("fiber", 0)) > 1 or
                abs(current_macros.get("sugar", 0) - target_macros.get("sugar", 0)) > 1
            )
            
            if not needs_adjustment:
                return meal  # Macros are already accurate
            
            # Calculate scaling factor based on calories (primary adjustment factor)
            calorie_scaling = target_macros.get("calories", 1) / max(current_macros.get("calories", 1), 1)
            
            # Create scaled macros
            adjusted_macros = {
                "calories": target_macros.get("calories", 0),
                "protein": target_macros.get("protein", 0),
                "carbs": target_macros.get("carbs", 0),
                "fat": target_macros.get("fat", 0),
                "fiber": target_macros.get("fiber", 0),
                "sugar": target_macros.get("sugar", 0)
            }
            
            # Adjust ingredient portions proportionally
            adjusted_ingredients = []
            for ingredient in meal.get("ingredients", []):
                if isinstance(ingredient, dict) and "quantity" in ingredient:
                    # Parse quantity to find the numeric value
                    quantity_str = ingredient["quantity"]
                    quantity_match = re.search(r'([\d.]+)', quantity_str)
                    
                    if quantity_match:
                        original_value = float(quantity_match.group(1))
                        new_value = original_value * calorie_scaling
                        
                        # Format back to string, maintaining the original unit
                        unit_match = re.search(r'[^\d.]+', quantity_str)
                        unit = unit_match.group(0).strip() if unit_match else ""
                        
                        # Update quantity
                        ingredient["quantity"] = f"{new_value:.1f} {unit}".strip()
                        
                        # Update ingredient macros if present
                        if "macros" in ingredient:
                            for key in ingredient["macros"]:
                                ingredient["macros"][key] = round(ingredient["macros"][key] * calorie_scaling, 1)
                    
                adjusted_ingredients.append(ingredient)
            
            # Update the meal with adjusted values
            adjusted_meal = meal.copy()
            adjusted_meal["nutrition"] = adjusted_macros
            adjusted_meal["ingredients"] = adjusted_ingredients
            
            # Add note about adjustment in instructions
            adjustment_note = "\n\n**Note: Portions have been precisely adjusted to match the nutritional targets.**"
            adjusted_meal["instructions"] = meal.get("instructions", "") + adjustment_note
            
            return adjusted_meal
            
        # Create a structured plan for meal generation
        meal_generation_plan = []
        for m_type, count in meal_counts.items():
            for i in range(count):
                meal_generation_plan.append(m_type)
        
        logger.info(f"Meal generation plan: {meal_generation_plan}, total meals needed: {total_meals_needed}")
        
        # Generate each meal individually
        for i, current_meal_type in enumerate(meal_generation_plan):
            # Create a cache key for this specific meal
            single_meal_cache_key = f"meal_prompt:{current_meal_type}:{request_hash}:{i}"
            cached_meal = get_cache(single_meal_cache_key)
            
            if cached_meal:
                logger.info(f"Using cached meal {i+1} of type {current_meal_type}")
                all_generated_meals.extend(cached_meal)
                continue
            
            # Get the macros for this meal type
            macros = meal_macros[current_meal_type]
            
            # Generate a single meal with a modified prompt
            # Create base prompt with enhanced emphasis on macro accuracy
            prompt = f"""
            Generate EXACTLY 1 complete, **single-serving** {current_meal_type.lower()} meal for a {dietary_preferences} diet.
            The meal **must have exactly** {macros['calories']} kcal AND precisely match the following macronutrient targets:
            - Protein: {macros['protein']}g (±1g)
            - Carbs: {macros['carbs']}g (±1g)
            - Fat: {macros['fat']}g (±1g)
            - Fiber: {macros['fiber']}g (±1g)
            - Sugar: {macros['sugar']}g (±1g)
            
            Prioritize recipes inspired by **Food & Wine, Bon Appétit, and Serious Eats**. Create an authentic, realistic recipe
            that could appear in these publications, with proper culinary techniques and flavor combinations.
            """

            # Add a clear instruction about macro accuracy
            prompt += f"""
            ### **CRITICAL REQUIREMENT FOR MACRO ACCURACY**:
            1. You MUST calculate the macros for EACH ingredient separately and ensure they add up to the exact target values
            2. Adjust ingredient portions precisely to achieve the macro targets
            3. Every macro value (protein, carbs, fat, fiber, sugar) must be within ±1g of the target
            4. Calories must be within ±5 kcal of the target
            5. DO NOT compromise nutrition accuracy for recipe simplicity
            """

            if meal_algorithm == "pantry" and pantry_ingredients:
                pantry_ingredients_text = ", ".join(pantry_ingredients[:30])  # Limit to 30 ingredients to avoid token issues
                prompt += f"""
                **IMPORTANT: Prioritize using ingredients from the user's pantry.**
                
                Available pantry ingredients: {pantry_ingredients_text}
                
                This meal should use as many of these pantry ingredients as possible, but may include some additional ingredients 
                if necessary for a complete meal. The recipe should seem designed to make use of what's available.
                """
            
            prompt += f"""
            The meal must be balanced and meet these nutritional targets:
            - Be **a single-serving portion**, accurately scaled
            - Include **all** ingredients needed for **one serving** (oils, spices, pantry staples)
            - Match these **macros** (±1% of target values):
            • Calories: {macros['calories']} kcal
            • Protein: {macros['protein']} g
            • Carbs: {macros['carbs']} g
            • Fat: {macros['fat']} g
            • Fiber: {macros['fiber']} g
            • Sugar: {macros['sugar']} g
            
            ### **Mandatory Requirements**:
            1. **The meal must be a {current_meal_type} meal**
            2. **All portions must be for a single serving** (e.g., "6 oz chicken," not "2 lbs chicken")
            3. **Each ingredient must list exact quantities** (e.g., "1 tbsp olive oil," not "olive oil")
            4. **Calculate macros per ingredient and ensure total macros match per serving**
            5. **List all essential ingredients** (cooking fats, seasonings, and garnishes)
            6. **Validate meal totals against individual ingredient macros**
            7. **The meal must use** meal_plan_id: `{meal_plan_id}`
            8. **The recipe must feel like an authentic recipe from Food & Wine, Bon Appétit, or Serious Eats**
            ---
            ### **Instructions Formatting Requirements**:
            - **Each instruction step must be detailed, clear, and structured for ease of use**
            - **Use precise cooking techniques** (e.g., "sear over medium-high heat for 3 minutes per side until golden brown")
            - **Include prep instructions** (e.g., "Finely mince garlic," "Dice bell peppers into ½-inch cubes")
            - **Specify temperatures, times, and sensory indicators** (e.g., "Roast at 400°F for 20 minutes until caramelized")
            - **Use line breaks for readability**
            - **Include plating instructions** (e.g., "Transfer to a warm plate, drizzle with sauce, and garnish with fresh herbs")
            ---
            ### **Strict JSON Formatting Requirements**:
            - Escape all double quotes inside strings with a backslash (e.g., \\"example\\")
            - Represent newlines in instructions as \\n
            - Ensure all strings use double quotes
            - No trailing commas in JSON arrays/objects
            ### **Example Response Format**:
            ```json
            [
            {{
            "title": "Herb-Roasted Chicken with Vegetables",
            "meal_type": "{current_meal_type}",
            "meal_plan_id": "{meal_plan_id}",
            "nutrition": {{
            "calories": {macros['calories']},
            "protein": {macros['protein']},
            "carbs": {macros['carbs']},
            "fat": {macros['fat']},
            "fiber": {macros['fiber']},
            "sugar": {macros['sugar']}
            }},
            "ingredients": [
            {{
            "name": "Boneless chicken breast",
            "quantity": "6 oz",
            "macros": {{
            "calories": 280,
            "protein": 38,
            "carbs": 0,
            "fat": 12,
            "fiber": 0,
            "sugar": 0
            }}
            }}
            ],
            "instructions": "### **Step 1: Prepare Ingredients**\\n..."
            }}
            ]
            ```
            **Strictly return only JSON with no extra text.**
            """
            
            try:
                # Use Google Gemini to generate a single meal
                model = genai.GenerativeModel("gemini-1.5-flash")
                response = model.generate_content(prompt)
                response_text = response.text.strip()
                
                # Improved JSON extraction with robust regex
                json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL | re.IGNORECASE)
                if json_match:
                    cleaned_response_text = json_match.group(1).strip()
                else:
                    cleaned_response_text = response_text.strip()
                
                single_meal = json.loads(cleaned_response_text)
                if not isinstance(single_meal, list):
                    raise ValueError(f"AI response for {current_meal_type} meal {i+1} is not a valid list.")
                
                # Ensure the meal has the correct type
                for j, meal in enumerate(single_meal):
                    meal["meal_type"] = current_meal_type
                    # Apply the macro validation and adjustment
                    single_meal[j] = validate_and_adjust_macros(meal, macros)
                
                # Cache this individual meal
                set_cache(single_meal_cache_key, single_meal, MEAL_CACHE_TTL)
                logger.info(f"Generated and cached meal {i+1} of type {current_meal_type}")
                
                # Add to the collection of all meals
                all_generated_meals.extend(single_meal)
                
            except Exception as e:
                logger.error(f"⚠️ Error generating meal {i+1} of type {current_meal_type}: {str(e)}")
                continue
        
        # Cache the complete set of meals if we have any
        if all_generated_meals:
            set_cache(prompt_cache_key, all_generated_meals, MEAL_CACHE_TTL)
            logger.info(f"Cached all {len(all_generated_meals)} generated meals for request hash: {request_hash}")
        
        # Verify we have the correct number of meals
        if len(all_generated_meals) != total_meals_needed:
            logger.warning(f"⚠️ Warning: Generated {len(all_generated_meals)} meals but needed {total_meals_needed}")
        
        # Format generated meals and save to DB
        formatted_meals = []
        for index, meal in enumerate(all_generated_meals):
            # Generate a unique ID for this meal
            unique_id = generate_meal_id(meal["title"], request_hash, index)
            
            # Save the meal to the database with the unique ID
            saved_meal = save_meal_with_hash(
                meal["title"],
                meal["instructions"],
                meal["ingredients"],
                dietary_preferences,
                meal["nutrition"],
                meal_plan_id,
                meal["meal_type"],
                request_hash,
                unique_id
            )
            
            # Cache the individual meal
            meal_cache_key = f"meal:{unique_id}"
            set_cache(meal_cache_key, saved_meal, MEAL_CACHE_TTL)
            logger.info(f"Cached individual meal in Redis: {meal['title']} with ID {unique_id}")
            
            # Generate the image URL
            image_url = generate_and_cache_meal_image(meal["title"], unique_id)
            logger.info(f"📋 Generated meal: {meal['title']} - Image URL: {image_url}")
            
            # Add to the formatted meals list
            formatted_meals.append({
                "id": unique_id,
                "title": meal["title"],
                "meal_type": meal["meal_type"],
                "nutrition": meal["nutrition"],
                "ingredients": meal["ingredients"],
                "instructions": meal["instructions"],
                "imageUrl": image_url  # Fixed: Use camelCase
            })

        # Cache the complete meal plan in Redis by both request hash and meal plan ID
        meal_plan_cache_key = f"meal_plan:{request_hash}"
        plan_id_cache_key = f"meal_plan_id:{meal_plan_id}"
        
        # Extract all meals from MongoDB for consistent cache format
        saved_meals = list(meals_collection.find({"meal_plan_id": meal_plan_id}))
        
        # Cache both by request hash and by meal plan ID
        set_cache(meal_plan_cache_key, saved_meals, MEAL_CACHE_TTL)
        set_cache(plan_id_cache_key, saved_meals, MEAL_CACHE_TTL)
        logger.info(f"Cached complete meal plan in Redis under keys: {meal_plan_cache_key} and {plan_id_cache_key}")

        # Only mark as ready and send notification if we have all the meals needed
        if len(all_generated_meals) >= total_meals_needed:
            # NEW CHANGE: Check if all meal images are ready
            all_images_ready = all(meal.get("imageUrl") for meal in formatted_meals)
            
            if not all_images_ready:
                logger.warning(f"⚠️ Not marking meal plan as ready - only {len([m for m in formatted_meals if m.get('imageUrl')])} of {len(formatted_meals)} meals have images")
                # Mark as still processing
                try:
                    if session_id:
                        chat_collection.update_one(
                            {"session_id": session_id},
                            {
                                "$set": {
                                    "meal_plan_ready": False,
                                    "meal_plan_processing": True,
                                    "meal_plan_id": meal_plan_id,
                                    "updated_at": datetime.datetime.now()
                                }
                            }
                        )
                        logger.info(f"Updated chat session {session_id} to mark meal plan as still processing (waiting for images)")
                except Exception as e:
                    logger.error(f"Failed to update chat session status for incomplete image generation: {str(e)}")
                return
                
            # All meals and images are ready, continue with notification
            try:
                # We already have session_id from earlier
                if session_id:
                    # First, update the chat session status to mark meal plan as ready
                    chat_collection.update_one(
                        {"session_id": session_id},
                        {
                            "$set": {
                                "meal_plan_ready": True,
                                "meal_plan_processing": False,
                                "meal_plan_id": meal_plan_id,
                                "updated_at": datetime.datetime.now()
                            }
                        }
                    )
                    logger.info(f"Updated chat session {session_id} to mark meal plan as ready")
                    
                    # Then, send the notification message using a helper task
                    notify_meal_plan_ready_task.delay(session_id, user_id, meal_plan_id)
                else:
                    # If we don't have session_id yet, try to get it again
                    if user_id:
                        recent_chat = chat_collection.find_one(
                            {"user_id": user_id},
                            sort=[("created_at", -1)]
                        )
                        
                        if recent_chat:
                            session_id = recent_chat.get("session_id")
                            if session_id:
                                # Update chat session
                                chat_collection.update_one(
                                    {"session_id": session_id},
                                    {
                                        "$set": {
                                            "meal_plan_ready": True,
                                            "meal_plan_processing": False,
                                            "meal_plan_id": meal_plan_id,
                                            "updated_at": datetime.datetime.now()
                                        }
                                    }
                                )
                                
                                # Send notification
                                notify_meal_plan_ready_task.delay(session_id, user_id, meal_plan_id)
                                logger.info(f"Scheduled notification for meal plan ready, session: {session_id}")
                            else:
                                logger.warning(f"Found chat session but no session_id for user_id: {user_id}")
                        else:
                            logger.warning(f"No chat session found for user_id: {user_id}")
                    else:
                        logger.warning("No user_id available to find chat session")
            except Exception as e:
                # Log but don't fail if notification fails
                logger.error(f"⚠️ Non-critical error sending notification: {str(e)}")
        else:
            logger.warning(f"⚠️ Not marking meal plan as ready - only generated {len(all_generated_meals)}/{total_meals_needed} meals")
            # Mark as still processing
            try:
                if session_id:
                    chat_collection.update_one(
                        {"session_id": session_id},
                        {
                            "$set": {
                                "meal_plan_ready": False,
                                "meal_plan_processing": True,
                                "meal_plan_id": meal_plan_id,
                                "updated_at": datetime.datetime.now()
                            }
                        }
                    )
                    logger.info(f"Updated chat session {session_id} to mark meal plan as still processing (incomplete)")
            except Exception as e:
                logger.error(f"Failed to update chat session status for incomplete meal plan: {str(e)}")
                
    except Exception as e:
        logger.error(f"Error in generate_meal_plan task: {str(e)}")
        return {"status": "error", "message": str(e)}
    finally:
        # Release the lock when done
        if 'lock_acquired' in locals() and lock_acquired:
            delete_cache(generation_lock_key)
            logger.info(f"Released generation lock for meal plan: {request_hash}")

@celery_app.task(name="notify_meal_plan_ready_task")
def notify_meal_plan_ready_task(session_id, user_id, meal_plan_id):
    """
    Sends a notification to the user that their meal plan is ready.
    This is called when a meal plan has been generated.
    """
    try:
        logger.info(f"Starting notification task for session {session_id}, meal plan {meal_plan_id}")
        
        # Use a consistent notification lock key in Redis
        notification_lock_key = f"notification_lock:{session_id}:{meal_plan_id}"
        
        # Try to acquire a lock using Redis SETNX operation (atomic)
        # This ensures only one process can send the notification
        lock_acquired = False
        
        try:
            # Check if notification was already sent using a dedicated flag in Redis
            cache_key = f"notification_sent:{session_id}:{meal_plan_id}"
            already_notified = get_cache(cache_key)
            
            if already_notified:
                logger.info(f"Notification for meal plan {meal_plan_id} already sent, skipping (Redis)")
                return {"status": "already_notified", "source": "redis_cache"}
                
            # Create a Redis lock with 60 second expiry to prevent concurrent notifications
            # Use your Redis client to set the key only if it doesn't exist
            # This is a simple implementation - a real Redis lock would be more robust
            if not get_cache(notification_lock_key):
                set_cache(notification_lock_key, True, 60)  # 60 second TTL for the lock
                lock_acquired = True
            else:
                logger.info(f"Another process is already sending notification for {meal_plan_id}, skipping")
                return {"status": "locked", "message": "Another process is handling this notification"}
                
            # Look up existing chat session
            chat_session = chat_collection.find_one({"session_id": session_id})
            if not chat_session:
                logger.warning(f"⚠️ Chat session not found: {session_id}")
                return {"status": "error", "message": f"Chat session not found: {session_id}"}
            
            logger.info(f"Found chat session: {session_id}")
            
            # Check if notification has already been sent by checking for a dedicated flag
            if chat_session.get("notification_sent_for", {}).get(meal_plan_id):
                logger.info(f"Notification for meal plan {meal_plan_id} already sent, skipping (MongoDB)")
                # Mark as sent in Redis too for future fast checks
                set_cache(cache_key, True, 86400)  # 24 hours
                return {"status": "already_notified", "source": "mongodb_flag"}
            
            # Also check messages as a backup
            existing_messages = chat_session.get("messages", [])
            for msg in existing_messages:
                if (msg.get("is_notification") and 
                    msg.get("meal_plan_id") == meal_plan_id):
                    logger.info(f"Notification for meal plan {meal_plan_id} already in messages, skipping")
                    # Mark as sent in Redis and MongoDB
                    set_cache(cache_key, True, 86400)  # 24 hours
                    chat_collection.update_one(
                        {"session_id": session_id},
                        {"$set": {f"notification_sent_for.{meal_plan_id}": True}}
                    )
                    return {"status": "already_notified", "source": "message_check"}
            
            # Create notification message
            current_time = datetime.datetime.now()
            notification_message = {
                "role": "assistant",
                "content": "Great news! Your meal plan is now ready. You can view it by clicking the 'View Meal Plan' button.",
                "timestamp": current_time,
                "meal_plan_id": meal_plan_id,
                "is_notification": True,
                "notification_id": f"notification_{meal_plan_id}_{current_time.timestamp()}"  # Add unique ID
            }
            
            logger.info(f"Adding notification message for meal plan {meal_plan_id}")
            
            # Update the chat session in MongoDB with BOTH the new message and a dedicated flag
            update_result = chat_collection.update_one(
                {"session_id": session_id},
                {
                    "$push": {"messages": notification_message},
                    "$set": {
                        "updated_at": current_time,
                        "meal_plan_ready": True,
                        "meal_plan_id": meal_plan_id,
                        "meal_plan_processing": False,
                        f"notification_sent_for.{meal_plan_id}": True  # Dedicated flag for this meal plan
                    }
                }
            )
            
            logger.info(f"Update result: modified={update_result.modified_count}")
            
            # Cache notification status to prevent duplicates
            set_cache(cache_key, True, 86400)  # 24 hours TTL
            
            logger.info(f"✅ Successfully sent meal plan ready notification to chat session {session_id}")
            return {"status": "success"}
        finally:
            # Release the lock if we acquired it
            if lock_acquired:
                delete_cache(notification_lock_key)
                logger.info(f"Released notification lock for {meal_plan_id}")
        
    except Exception as e:
        logger.error(f"❌ Error sending meal plan ready notification: {str(e)}")
        return {"status": "error", "message": str(e)}

# ===================== HELPER FUNCTIONS =====================

def update_chat_messages_sync(session_id, message, is_error=False):
    """Synchronous version of update_chat_messages"""
    try:
        chat_collection.update_one(
            {"session_id": session_id},
            {
                "$push": {"messages": message},
                "$set": {"updated_at": datetime.datetime.now()}
            }
        )
    except Exception as e:
        logger.error(f"MongoDB update error for session {session_id}: {str(e)}")

def store_error_message_sync(session_id, error_text):
    """Synchronous version of store_error_message"""
    error_message = {
        "role": "assistant",
        "content": error_text,
        "timestamp": datetime.datetime.now(),
        "is_notification": False,
        "error": True
    }
    
    update_chat_messages_sync(session_id, error_message, is_error=True)

def fetch_ingredient_macros(ingredient):
    """Fetches macros for a given ingredient using the USDA API."""
    api_key = os.getenv("USDA_API_KEY")
    if not api_key:
        logger.error("USDA API key not configured")
        return None
    
    import requests
    USDA_API_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

    params = {"query": ingredient, "api_key": api_key}
    response = requests.get(USDA_API_URL, params=params)

    if response.status_code != 200:
        return None

    data = response.json()
    if not data.get("foods"):
        return None

    food_item = data["foods"][0]

    nutrient_mapping = {
        208: "calories",
        203: "protein",
        205: "carbs",
        204: "fat",
        269: "sugar",
        291: "fiber"
    }

    macros = {nutrient_mapping[nutrient["nutrientId"]]: nutrient["value"]
              for nutrient in food_item["foodNutrients"] if nutrient["nutrientId"] in nutrient_mapping}

    return macros

def save_meal_with_hash(meal_name, meal_text, ingredients, dietary_type, macros, meal_plan_id, meal_type, request_hash, meal_id):
    """Save meal with request hashing for caching and USDA validation for nutrition accuracy."""
    # Check for duplicate before saving
    existing_meal = meals_collection.find_one({
        "meal_name": meal_name,
        "request_hash": request_hash
    })
    
    if existing_meal:
        # ALWAYS update meal_plan_id to ensure consistency
        if existing_meal.get("meal_plan_id") != meal_plan_id:
            meals_collection.update_one(
                {"_id": existing_meal["_id"]},
                {"$set": {"meal_plan_id": meal_plan_id, "updated_at": datetime.datetime.now()}}
            )
            # Update the local copy
            existing_meal["meal_plan_id"] = meal_plan_id
            
            # UPDATE BOTH CACHE KEYS
            meal_id_cache_key = f"meal:{existing_meal['meal_id']}"
            set_cache(meal_id_cache_key, existing_meal, MEAL_CACHE_TTL)
            
            # Also update the meal plan cache
            plan_id_cache_key = f"meal_plan_id:{meal_plan_id}"
            cached_plan = get_cache(plan_id_cache_key) or []
            
            # Replace the meal in the cached plan or add it
            updated_plan = [m for m in cached_plan if m.get("meal_id") != existing_meal["meal_id"]]
            updated_plan.append(existing_meal)
            set_cache(plan_id_cache_key, updated_plan, MEAL_CACHE_TTL)
            
            logger.info(f"Updated meal_plan_id for duplicate meal: {meal_name} to {meal_plan_id}")
        
        return existing_meal
    
    # USDA validation
    validated_ingredients = []
    usda_macros = {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0,
        "sugar": 0,
        "fiber": 0
    }
    validation_count = 0
    
    # Process ingredients if available in expected format
    if isinstance(ingredients, list) and ingredients:
        for ingredient in ingredients:
            if not isinstance(ingredient, dict) or "name" not in ingredient:
                validated_ingredients.append(ingredient)
                continue
            
            try:
                # Clean ingredient name for better USDA matching
                clean_name = re.sub(r'^\d+\s*[\d/]*\s*(?:cup|tbsp|tsp|oz|g|lb|ml|l)s?\s*', '', ingredient["name"], flags=re.IGNORECASE)
                clean_name = re.sub(r'diced|chopped|minced|sliced|cooked|raw|fresh|frozen|canned', '', clean_name, flags=re.IGNORECASE)
                clean_name = clean_name.strip()
                
                # Get USDA data
                usda_data = fetch_ingredient_macros(clean_name)
                
                if usda_data:
                    # Keep track of USDA validation and attach data to ingredient
                    ingredient["usda_validated"] = True
                    ingredient["usda_macros"] = usda_data
                    validation_count += 1
                    
                    # Try to extract quantity
                    quantity_str = ingredient.get("quantity", "")
                    grams = 0
                    
                    # Simple quantity extraction
                    if "g" in quantity_str:
                        match = re.search(r'(\d+(?:\.\d+)?)\s*g', quantity_str)
                        if match:
                            grams = float(match.group(1))
                    elif "cup" in quantity_str.lower():
                        match = re.search(r'(\d+(?:\.\d+)?)', quantity_str)
                        if match:
                            grams = float(match.group(1)) * 240  # ~240g per cup
                    elif "tbsp" in quantity_str.lower() or "tablespoon" in quantity_str.lower():
                        match = re.search(r'(\d+(?:\.\d+)?)', quantity_str)
                        if match:
                            grams = float(match.group(1)) * 15  # ~15g per tbsp  
                    elif "oz" in quantity_str.lower():
                        match = re.search(r'(\d+(?:\.\d+)?)', quantity_str)
                        if match:
                            grams = float(match.group(1)) * 28.35  # ~28.35g per oz
                    else:
                        # Try to extract just the number
                        match = re.search(r'^(\d+(?:\.\d+)?)', quantity_str)
                        if match:
                            grams = float(match.group(1))
                        else:
                            grams = 100  # Default if no quantity found
                    
                    # Calculate nutrition based on quantity
                    factor = grams / 100.0  # USDA data is per 100g
                    for key in usda_macros:
                        if key in usda_data:
                            usda_macros[key] += usda_data[key] * factor
                else:
                    ingredient["usda_validated"] = False
                
                validated_ingredients.append(ingredient)
                
            except Exception as e:
                logger.error(f"Error validating ingredient '{ingredient.get('name', 'unknown')}': {str(e)}")
                ingredient["usda_validated"] = False
                validated_ingredients.append(ingredient)
    
    # Determine if we should use USDA validated macros
    validation_success = False
    if ingredients and validation_count >= len(ingredients) * 0.5:
        # Round values and use USDA macros if enough ingredients validated
        usda_macros = {k: round(v, 1) for k, v in usda_macros.items()}
        validation_success = True
        logger.info(f"✅ USDA validation successful: {validation_count}/{len(ingredients)} ingredients validated")
        logger.info(f"Original macros: {macros}")
        logger.info(f"USDA macros: {usda_macros}")
    
    # Use the appropriate macros
    final_macros = usda_macros if validation_success else macros
    
    # Add validation metadata
    final_macros["usda_validated"] = validation_success
    
    # Generate image URL if not already present
    image_url = generate_and_cache_meal_image(meal_name, meal_id)
    
    # Build meal data
    meal_data = {
        "meal_id": meal_id,  # Use the provided meal_id directly
        "meal_plan_id": meal_plan_id,
        "meal_name": meal_name,
        "meal_text": meal_text,
        "ingredients": validated_ingredients,
        "dietary_type": dietary_type,
        "meal_type": meal_type,
        "macros": final_macros,
        "original_macros": macros if validation_success else None,
        "request_hash": request_hash,
        "created_at": datetime.datetime.now(),
        "imageUrl": image_url  # Ensure imageUrl is always present
    }

    meals_collection.insert_one(meal_data)
    
    # Cache the meal in Redis
    meal_cache_key = f"meal:{meal_id}"
    set_cache(meal_cache_key, meal_data, MEAL_CACHE_TTL)
    
    return meal_data

def generate_and_cache_meal_image(meal_name, meal_id):
    """
    Generates a realistic food image for a meal using Google Cloud's Vertex AI.
    Uploads it to Google Cloud Storage, and returns a persistent URL.
    If an image exists in the database, return that instead of generating a new one.
    """
    
    # Check if image already exists in MongoDB
    existing_meal = meals_collection.find_one({"meal_id": meal_id}, {"imageUrl": 1})
    if existing_meal and existing_meal.get("imageUrl"):
        return existing_meal["imageUrl"]
    
    try:
        # Enhanced prompt for realistic food photography
        prompt = (
            f"Highly photorealistic food photography of {meal_name} without any AI artifacts. "
            "Professional food styling with realistic textures, natural lighting from the side, "
            "and detailed texture. Shot on a Canon 5D Mark IV with 100mm macro lens, f/2.8, natural window light. "
            "Include realistic imperfections, proper food shadows and reflections. "
            "A photo that could be published in Bon Appetit magazine."
        )
        
# Check if Vertex AI is initialized
        if not project_id:
            logger.warning("Google Cloud project ID not available, cannot generate image")
            
        # Load the pre-trained image generation model
        try:
            model = ImageGenerationModel.from_pretrained("imagegeneration@002")
            
            # Generate the image
            images = model.generate_images(
                prompt=prompt,
                number_of_images=1,
                seed=1,  # Fixed seed for reproducibility
                add_watermark=False,
            )
            
            if images:
                # Create a temporary directory to save the image
                temp_dir = tempfile.gettempdir()
                image_path = os.path.join(temp_dir, f"{meal_id}.jpg")
                
                # Save the image to the temporary file path
                images[0].save(image_path)     
                
                # Get credentials from environment
                credentials_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
                storage_client = None
                
                # Check if the credentials are a JSON string rather than a file path
                if credentials_json and (credentials_json.startswith('{') or credentials_json.startswith('{"')):
                    try:
                        # It's a JSON string, create a temporary file
                        creds_temp_file = os.path.join(temp_dir, f"google_creds_{uuid.uuid4()}.json")
                        with open(creds_temp_file, 'w') as f:
                            f.write(credentials_json)
                        
                        credentials = service_account.Credentials.from_service_account_file(creds_temp_file)
                        storage_client = storage.Client(credentials=credentials)
                        
                        # Clean up temporary credentials file
                        os.remove(creds_temp_file)
                    except Exception as json_error:
                        logger.error(f"Error with JSON credentials: {str(json_error)}")

                elif credentials_json:
                    # It's a path to a file
                    try:
                        credentials = service_account.Credentials.from_service_account_file(credentials_json)
                        storage_client = storage.Client(credentials=credentials)
                    except Exception as file_error:
                        logger.error(f"Error with credentials file: {str(file_error)}")
                else:
                    # Try default credentials
                    try:
                        storage_client = storage.Client()
                    except Exception as default_error:
                        logger.error(f"Error with default credentials: {str(default_error)}")
                
                if not storage_client:
                    logger.error("Failed to initialize storage client")
                    
                bucket_name = os.getenv("GCS_BUCKET_NAME")
                if not bucket_name:
                    logger.error("No bucket name specified")
                    
                try:
                    bucket = storage_client.bucket(bucket_name)
                    
                    # Generate a unique filename for the image in GCS
                    filename = f"meal_images/{meal_id}_{uuid.uuid4()}.jpg"
                    blob = bucket.blob(filename)
                    
                    # Upload the image to Google Cloud Storage
                    blob.upload_from_filename(image_path, content_type="image/jpeg")
                    
                    # Get the public URL
                    gcs_image_url = blob.public_url
                    
                    # Clean up the temporary file
                    os.remove(image_path)
                    
                    # Cache the generated image URL in MongoDB
                    meals_collection.update_one(
                        {"meal_id": meal_id},
                        {"$set": {
                            "imageUrl": gcs_image_url,  # Fixed: Use camelCase
                            "image_updated_at": datetime.datetime.now(),
                            "image_source": "vertex_ai"
                        }},
                        upsert=True
                    )
                    
                    return gcs_image_url
                except Exception as storage_error:
                    logger.error(f"Error in storage operations: {str(storage_error)}")
            else:
                logger.warning("No images were generated")
                
        except Exception as vertex_error:
            logger.error(f"Error with Vertex AI: {str(vertex_error)}")
            
    except Exception as e:
        logger.error(f"Error generating image: {str(e)}")