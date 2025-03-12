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

        # Create fresh model instance
        model = genai.GenerativeModel("gemini-1.5-flash")
        chat = model.start_chat(history=conversation_history)
        
        # Create nutrition context
        nutrition_context = f"""
        You are a nutrition assistant chatting with a user while their {meal_type} meal plan generates.
        Keep responses friendly, conversational, and focused on nutrition/healthy eating.
        Current dietary focus: {dietary_preferences or 'balanced nutrition'}
        
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
        
        # Convert the dictionary back to required values
        dietary_preferences = request_dict.get("dietary_preferences", "")
        meal_type = request_dict.get("meal_type", "")
        calories = request_dict.get("calories", 0)
        protein = request_dict.get("protein", 0)
        carbs = request_dict.get("carbs", 0)
        fat = request_dict.get("fat", 0)
        fiber = request_dict.get("fiber", 0)
        sugar = request_dict.get("sugar", 0)
        
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
                recent_chat = chat_collection.find_one(
                    {"user_id": user_id},
                    sort=[("created_at", -1)]
                )
                if recent_chat:
                    session_id = recent_chat.get("session_id")
        except Exception as e:
            logger.error(f"Error getting session_id: {str(e)}")
        
        # Calculate the macronutrient distribution per meal type
        meal_type_calorie_ratio = {
            "Breakfast": 0.25,  # 25% of daily calories
            "Lunch": 0.30,      # 30% of daily calories
            "Dinner": 0.35,     # 35% of daily calories
            "Snack": 0.10       # 10% of daily calories per snack
        }

        # For single meal type requests, use all macros
        if meal_type != "Full Day":
            ratio = meal_type_calorie_ratio.get(meal_type, 0)
            num_meals = meal_counts.get(meal_type, 1)  # Get the number of meals for this type
            
            # For snacks, ensure each snack gets 10% of the daily calories
            if meal_type == "Snack":
                # Each snack gets 10% of the daily calories, regardless of the number of snacks
                meal_macros = {
                    meal_type: {
                        "calories": int(calories * ratio),  # 10% of daily calories
                        "protein": int(protein * ratio),
                        "carbs": int(carbs * ratio),
                        "fat": int(fat * ratio),
                        "fiber": int(fiber * ratio),
                        "sugar": int(sugar * ratio)
                    }
                }
            else:
                # For non-snack meal types, use the ratio as is
                meal_macros = {
                    meal_type: {
                        "calories": int(calories * ratio),
                        "protein": int(protein * ratio),
                        "carbs": int(carbs * ratio),
                        "fat": int(fat * ratio),
                        "fiber": int(fiber * ratio),
                        "sugar": int(sugar * ratio)
                    }
                }
        else:
            # For "Full Day" meal type, distribute macros proportionally
            meal_macros = {}
            for meal_type, ratio in meal_type_calorie_ratio.items():
                count = meal_counts.get(meal_type, 0)
                if count > 0:
                    # For snacks, ensure each snack gets 10% of the daily calories
                    if meal_type == "Snack":
                        meal_macros[meal_type] = {
                            "calories": int(calories * ratio),  # 10% of daily calories per snack
                            "protein": int(protein * ratio),
                            "carbs": int(carbs * ratio),
                            "fat": int(fat * ratio),
                            "fiber": int(fiber * ratio),
                            "sugar": int(sugar * ratio)
                        }
                    else:
                        # For non-snack meal types, distribute macros proportionally
                        type_ratio = ratio * count
                        meal_macros[meal_type] = {
                            "calories": int(calories * type_ratio),
                            "protein": int(protein * type_ratio),
                            "carbs": int(carbs * type_ratio),
                            "fat": int(fat * type_ratio),
                            "fiber": int(fiber * type_ratio),
                            "sugar": int(sugar * type_ratio)
                        }
        
        # Generate meals for each meal type using Google Gemini
        all_generated_meals = []
        for meal_type, macros in meal_macros.items():
            num_meals = meal_counts.get(meal_type, 1)
            prompt = f"""
            Generate EXACTLY {num_meals} {'meal' if num_meals == 1 else 'meals'} - no more, no less. Each must be a complete, **single-serving** {meal_type.lower()} meal for a {dietary_preferences} diet.
            The total combined calories of these {meal_type} meals **must equal exactly** {macros['calories']} kcal.
            Prioritize recipes inspired by **Food & Wine, Bon Appétit, and Serious Eats**. Create authentic, realistic recipes
            that could appear in these publications, with proper culinary techniques and flavor combinations.
            Each meal must be individually balanced and the sum of all {meal_type} meals should meet these targets:
            - Be **a single-serving portion**, accurately scaled
            - Include **all** ingredients needed for **one serving** (oils, spices, pantry staples)
            - Match **combined meal macros** (±1% of target values):
            • Calories: {macros['calories']} kcal
            • Protein: {macros['protein']} g
            • Carbs: {macros['carbs']} g
            • Fat: {macros['fat']} g
            • Fiber: {macros['fiber']} g
            • Sugar: {macros['sugar']} g
            ### **Mandatory Requirements**:
            1. **All {num_meals} meals must be {meal_type} meals**
            2. **All portions must be for a single serving** (e.g., "6 oz chicken," not "2 lbs chicken")
            3. **Each ingredient must list exact quantities** (e.g., "1 tbsp olive oil," not "olive oil")
            4. **Calculate macros per ingredient and ensure total macros match per serving**
            5. **List all essential ingredients** (cooking fats, seasonings, and garnishes)
            6. **Validate meal totals against individual ingredient macros**
            7. **All meals must share** meal_plan_id: `{meal_plan_id}`
            8. **Each recipe must feel like an authentic recipe from Food & Wine, Bon Appétit, or Serious Eats**
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
            "meal_type": "{meal_type}",
            "meal_plan_id": "{meal_plan_id}",
            "nutrition": {{
            "calories": 625,
            "protein": 42,
            "carbs": 38,
            "fat": 22,
            "fiber": 8,
            "sugar": 9
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
                # Use Google Gemini to generate the meal plan
                model = genai.GenerativeModel("gemini-1.5-flash")
                response = model.generate_content(prompt)
                response_text = response.text.strip()
                
                # Improved JSON extraction with robust regex
                json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL | re.IGNORECASE)
                if json_match:
                    cleaned_response_text = json_match.group(1).strip()
                else:
                    cleaned_response_text = response_text.strip()
                
                meals_for_type = json.loads(cleaned_response_text)
                if not isinstance(meals_for_type, list):
                    raise ValueError(f"AI response for {meal_type} is not a valid list of meals.")
                
                # Ensure each meal has the correct meal_type
                for meal in meals_for_type:
                    meal["meal_type"] = meal_type
                
                # Add these meals to our collection
                all_generated_meals.extend(meals_for_type)
            except Exception as e:
                logger.error(f"⚠️ Error generating {meal_type} meals: {str(e)}")
                continue  # Continue with other meal types rather than failing completely
        
        # Verify we have the correct number of meals
        if len(all_generated_meals) != total_meals_needed:
            logger.warning(f"⚠️ Warning: Generated {len(all_generated_meals)} meals but needed {total_meals_needed}")
        
        # Format generated meals and save to DB
        formatted_meals = []
        for meal in all_generated_meals:
            unique_id = f"{random.randint(10000, 99999)}"
            
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
                "imageUrl": image_url
            })

        # Try to send notification that meal plan is ready
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
        
        logger.info(f"✅ Successfully completed meal plan generation for user: {user_id}")
        return {"status": "success", "meals": formatted_meals, "meal_plan_id": meal_plan_id}
        
    except Exception as e:
        logger.error(f"❌ Error in background meal plan generation: {str(e)}")
        
        # Even on error, try to update chat session status
        try:
            if user_id:
                recent_chat = chat_collection.find_one(
                    {"user_id": user_id},
                    sort=[("created_at", -1)]
                )
                
                if recent_chat:
                    session_id = recent_chat.get("session_id")
                    if session_id:
                        # Mark processing as failed but don't set ready to true
                        chat_collection.update_one(
                            {"session_id": session_id},
                            {
                                "$set": {
                                    "meal_plan_processing": False,
                                    "meal_plan_error": True,
                                    "error_message": str(e),
                                    "updated_at": datetime.datetime.now()
                                }
                            }
                        )
        except Exception as update_error:
            logger.error(f"Failed to update chat session after error: {str(update_error)}")
        
        return {"status": "error", "message": str(e)}

@celery_app.task(name="notify_meal_plan_ready")
def notify_meal_plan_ready_task(session_id, user_id, meal_plan_id):
    """
    Sends a notification to the user that their meal plan is ready.
    This is called when a meal plan has been generated.
    """
    try:
        # Look up existing chat session
        chat_session = chat_collection.find_one({"session_id": session_id})
        if not chat_session:
            logger.warning(f"⚠️ Chat session not found: {session_id}")
            return {"status": "error", "message": f"Chat session not found: {session_id}"}
        
        # Check if notification has already been sent
        existing_messages = chat_session.get("messages", [])
        for msg in existing_messages:
            if (msg.get("is_notification") and 
                msg.get("meal_plan_id") == meal_plan_id and
                "meal plan is now ready" in msg.get("content", "")):
                logger.info(f"Notification for meal plan {meal_plan_id} already sent, skipping")
                return {"status": "already_notified"}
        
        # Create notification message
        current_time = datetime.datetime.now()
        notification_message = {
            "role": "assistant",
            "content": "Great news! Your meal plan is now ready. You can view it by clicking the 'View Meal Plan' button. Let me know if you have any questions about your recipes or meal options!",
            "timestamp": current_time,
            "meal_plan_id": meal_plan_id,
            "is_notification": True
        }
        
        # Add to conversation history
        existing_messages.append(notification_message)
        
        # Update the chat session in MongoDB
        chat_collection.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "messages": existing_messages,
                    "updated_at": current_time,
                    "meal_plan_ready": True,
                    "meal_plan_id": meal_plan_id
                }
            }
        )
        
        logger.info(f"✅ Successfully sent meal plan ready notification to chat session {session_id}")
        return {"status": "success"}
        
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
        return existing_meal  # Return the existing meal instead of None
    
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
        "created_at": datetime.datetime.now()
    }

    # Save to database
    meals_collection.insert_one(meal_data)
    return meal_data

def generate_and_cache_meal_image(meal_name, meal_id):
    """
    Generates a realistic food image for a meal using Google Cloud's Vertex AI.
    Uploads it to Google Cloud Storage, and returns a persistent URL.
    If an image exists in the database, return that instead of generating a new one.
    """
    fallback_image = "/fallback-meal-image.jpg"
    
    # Check if image already exists in MongoDB
    existing_meal = meals_collection.find_one({"meal_id": meal_id}, {"image_url": 1})
    if existing_meal and existing_meal.get("image_url"):
        return existing_meal["image_url"]
    
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
            return fallback_image
            
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
                        return fallback_image
                elif credentials_json:
                    # It's a path to a file
                    try:
                        credentials = service_account.Credentials.from_service_account_file(credentials_json)
                        storage_client = storage.Client(credentials=credentials)
                    except Exception as file_error:
                        logger.error(f"Error with credentials file: {str(file_error)}")
                        return fallback_image
                else:
                    # Try default credentials
                    try:
                        storage_client = storage.Client()
                    except Exception as default_error:
                        logger.error(f"Error with default credentials: {str(default_error)}")
                        return fallback_image
                
                if not storage_client:
                    logger.error("Failed to initialize storage client")
                    return fallback_image
                    
                bucket_name = os.getenv("GCS_BUCKET_NAME")
                if not bucket_name:
                    logger.error("No bucket name specified")
                    return fallback_image
                    
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
                            "image_url": gcs_image_url,
                            "image_updated_at": datetime.datetime.now(),
                            "image_source": "vertex_ai"
                        }},
                        upsert=True
                    )
                    
                    return gcs_image_url
                except Exception as storage_error:
                    logger.error(f"Error in storage operations: {str(storage_error)}")
                    return fallback_image
            else:
                logger.warning("No images were generated")
                return fallback_image
                
        except Exception as vertex_error:
            logger.error(f"Error with Vertex AI: {str(vertex_error)}")
            return fallback_image
            
    except Exception as e:
        logger.error(f"Error generating image: {str(e)}")
        return fallback_image