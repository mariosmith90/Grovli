from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel, Field
import os, json, uuid
import requests
import re, random, json, datetime
from typing import List, Set
from pymongo import MongoClient
from google.cloud import aiplatform, storage
from google.oauth2 import service_account
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel
from io import BytesIO
import base64, logging
import google.generativeai as genai

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mealplan", tags=["Meal Plan"])

# USDA FoodData Central API URL
USDA_API_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

# Connect to MongoDB
client = MongoClient(os.getenv("MONGO_URI"))
db = client["grovli"]
meals_collection = db["meals"]
chat_collection = db["chat_sessions"]

class MealPlanText(BaseModel):
    meal_plan: str

# In-memory storage for tracking recipes within a session
class SessionRecipes:
    def __init__(self):
        self.recipes: Set[str] = set()
        
    def add_recipe(self, recipe: str) -> None:
        self.recipes.add(recipe.lower().strip())
        
    def is_duplicate(self, recipe: str) -> bool:
        return recipe.lower().strip() in self.recipes
        
    def clear(self) -> None:
        self.recipes.clear()

session_tracker = SessionRecipes()

class MealPlanRequest(BaseModel):
    dietary_preferences: str = Field(..., min_length=2, description="Dietary needs or restrictions")
    meal_type: str = Field(..., description="Type of meals to include")
    num_days: int = Field(..., gt=0, le=14, description="Number of days to plan (1-14)")
    carbs: int = Field(..., gt=0, description="Daily carbohydrate requirement in grams")
    calories: int = Field(..., gt=0, description="Required daily calorie intake")
    protein: int = Field(..., gt=0, description="Daily protein requirement in grams")
    sugar: int = Field(..., ge=0, description="Maximum daily sugar allowance in grams")
    fiber: int = Field(..., gt=0, description="Daily fiber requirement in grams")
    fat: int = Field(..., gt=0, description="Daily fat requirement in grams")

# Define the expected number of meals based on Meal Type
MEAL_TYPE_COUNTS = {
    "Full Day": 4,       
    "Breakfast": 1,
    "Lunch": 1,
    "Dinner": 1,
    "Snack": 1,    
}

def extract_recipe_titles(content: str) -> List[str]:
    """Extract recipe titles from the meal plan text."""
    return re.findall(r'### MEAL: (.+?)(?=\n|$)', content)

def fetch_ingredient_macros(ingredient: str):
    """Fetches macros for a given ingredient using the USDA API."""
    api_key = os.getenv("USDA_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="USDA API key not configured")

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

@router.post("/archive_meal_plan/")
async def archive_meal_plan(request: MealPlanText):
    """
    Saves each meal in a generated meal plan separately to the database for future reuse.
    """
    if not request.meal_plan.strip():
        raise HTTPException(status_code=400, detail="Meal plan cannot be empty")

    # Extract dietary type
    dietary_type_match = re.search(r"(?<=for a )([\w\s]+)(?= diet)", request.meal_plan)
    dietary_type = dietary_type_match.group(1) if dietary_type_match else "Unknown"

    # Generate a unique meal_plan_id for this archive
    archive_id = f"archive_{random.randint(10000, 99999)}"
    meal_type = "Mixed"  # Default meal type for archived meals

    # Extract individual meals
    meal_pattern = re.compile(r"### MEAL: (.+?)\n(.+?)(?=\n### MEAL:|\Z)", re.DOTALL)
    meal_matches = meal_pattern.findall(request.meal_plan)

    for meal_name, meal_text in meal_matches:
        # Extract macros for each meal
        macro_patterns = {
            "calories": r"Total calories:\s*(\d+)",
            "protein": r"Protein:\s*(\d+)g",
            "carbs": r"Carbohydrates:\s*(\d+)g",
            "fat": r"Fat:\s*(\d+)g",
            "fiber": r"Fiber:\s*(\d+)g",
            "sugar": r"Sugar:\s*≤?(\d+)g"
        }
        
        macros = {}
        for key, pattern in macro_patterns.items():
            match = re.search(pattern, meal_text)
            macros[key] = int(match.group(1)) if match else 0

        # Extract ingredients specific to this meal

    return {"status": "success", "message": "Meals archived successfully", "meal_plan_id": archive_id}


def find_meal_by_macros(meal_type: str, dietary_type: str, macros: dict, session_id: str, num_meals: int):
    """
    Searches MongoDB for meals that match the exact required macros and meal type.
    Returns stored meals if available, otherwise triggers new meal generation.
    """
    base_meal_id = f"{meal_type}_{dietary_type}_{macros['calories']}".lower()  

    # Enforce strict macro matching
    macro_filter = {
        "macros.calories": macros.get("calories", 0),
        "macros.protein": macros.get("protein", 0),
        "macros.carbs": macros.get("carbs", 0),
        "macros.fat": macros.get("fat", 0),
        "macros.fiber": macros.get("fiber", 0),
        "macros.sugar": macros.get("sugar", 0),
        "session_id": session_id  # Ensure meals from the same session are retrieved together
    }

    # Fetch meals that **exactly** match the required macros
    matching_meals = list(meals_collection.find({"base_meal_id": base_meal_id, **macro_filter}).limit(num_meals))

    if len(matching_meals) >= num_meals:
        print(f"✅ Found {len(matching_meals)} meals for {base_meal_id}. Returning stored results.")
        return matching_meals

    print(f"⚠️ Only found {len(matching_meals)} meals. Generating {num_meals - len(matching_meals)} more.")
    return matching_meals  

def find_meal_by_meal_plan_id(meal_plan_id: str):
    """
    Retrieves meals from MongoDB based on a shared `meal_plan_id`.
    This ensures meals are grouped and retrieved together.
    """
    matching_meals = list(meals_collection.find({"meal_plan_id": meal_plan_id}))

    if matching_meals:
        print(f"✅ Found {len(matching_meals)} meals for meal_plan_id: {meal_plan_id}")
    else:
        print(f"⚠️ No meals found for meal_plan_id: {meal_plan_id}")

    return [
        {
            "title": meal["meal_name"],
            "nutrition": meal["macros"],
            "ingredients": meal["ingredients"],
            "instructions": meal["meal_text"]
        }
        for meal in matching_meals
    ]

async def try_notify_meal_plan_ready(session_id, user_id, meal_plan_id):
    """
    Attempts to send a notification to the chat service that the meal plan is ready.
    This is a non-blocking function that won't raise exceptions to the main flow.
    """
    try:
        # Look up existing chat session
        chat_session = chat_collection.find_one({"session_id": session_id})
        if not chat_session:
            logger.warning(f"⚠️ Chat session not found: {session_id}")
            return False
        
        # Get existing messages
        existing_messages = chat_session.get("messages", [])
        
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
        return True
        
    except Exception as e:
        logger.error(f"❌ Error sending meal plan ready notification: {str(e)}")
        return False
    
@router.post("/")
async def generate_meal_plan(request: MealPlanRequest, request_obj: Request):
    """
    Generates a meal plan by retrieving stored meals from MongoDB first.
    If enough meals do not exist, it generates new meals with Google Gemini.
    """
    # Get API key from environment variables
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY environment variable is not set"
        )
    
    # Initialize Gemini API with the key
    genai.configure(api_key=gemini_api_key)
    
    # Extract user_id from headers
    user_id = request_obj.headers.get("user-id") or request_obj.headers.get("x-user-id")
    logger.info(f"Processing meal plan request for user_id: {user_id}")
    
    # Step 1: Determine the correct number and types of meals needed
    if request.meal_type == "Full Day":
        meal_counts = {
            "Breakfast": 1,
            "Lunch": 1,
            "Dinner": 1,
            "Snack": 1
        }
        total_meals_needed = sum(meal_counts.values())
    else:
        meal_counts = {request.meal_type: MEAL_TYPE_COUNTS.get(request.meal_type, 1)}
        total_meals_needed = meal_counts[request.meal_type]
    
    print(f"🍽️ Generating meal plan with {total_meals_needed} total meals: {meal_counts}")
    
    # Step 2: Create a deterministic hash key that identifies this exact request
    request_hash = f"{request.meal_type}_{request.dietary_preferences}_{request.calories}_{request.protein}_{request.carbs}_{request.fat}_{request.fiber}_{request.sugar}"
    print(f"🔑 Request hash: {request_hash}")
    
    # Step 3: Check if we already have a meal plan for this exact request
    existing_meal_plan = list(meals_collection.find({"request_hash": request_hash}).limit(total_meals_needed))
    if len(existing_meal_plan) >= total_meals_needed:
        print(f"✅ Found cached meal plan for request hash: {request_hash}")
        print(f"📋 DEBUG: Found {len(existing_meal_plan)} cached meals")
        formatted_meals = []
        for meal in existing_meal_plan[:total_meals_needed]:
            image_url = meal.get("image_url", "/fallback-meal-image.jpg")
            print(f"📋 DEBUG: Cached meal: {meal.get('meal_name')} - Image URL: {image_url}")
            formatted_meal = {
                "id": meal["meal_id"],
                "title": meal["meal_name"],
                "meal_type": meal["meal_type"],
                "nutrition": meal["macros"],
                "ingredients": meal["ingredients"],
                "instructions": meal["meal_text"],
                "imageUrl": image_url
            }
            formatted_meals.append(formatted_meal)
            
        # Try to send notification if possible
        try:
            # Look for active chat session based on user_id
            if user_id:
                logger.info(f"Looking for chat sessions for user_id: {user_id}")
                # Find the most recent chat session for this user
                recent_chat = chat_collection.find_one(
                    {"user_id": user_id},
                    sort=[("created_at", -1)]
                )
                
                if recent_chat:
                    session_id = recent_chat.get("session_id")
                    logger.info(f"Found session_id: {session_id} for user_id: {user_id}")
                    
                    # Get the meal plan ID from the first meal
                    meal_plan_id = existing_meal_plan[0].get("meal_plan_id", request_hash)
                    
                    # Only try to notify if we have session_id
                    if session_id:
                        notification_result = await try_notify_meal_plan_ready(session_id, user_id, meal_plan_id)
                        logger.info(f"Notification result: {notification_result}")
                else:
                    logger.warning(f"No chat session found for user_id: {user_id}")
            else:
                logger.warning("No user_id available to find chat session")
        except Exception as e:
            # Log but don't fail if notification fails
            logger.error(f"⚠️ Non-critical error sending notification: {str(e)}")
            # Continue with returning the meal plan
            
        return {"meal_plan": formatted_meals, "cached": True}
    
    # Step 4: If no cached plan exists, generate a new one
    print(f"⚠️ No cached meal plan found. Generating new meals.")
    meal_plan_id = f"{request_hash}_{random.randint(10000, 99999)}"
    
    # Calculate the macronutrient distribution per meal type
    meal_type_calorie_ratio = {
        "Breakfast": 0.25, # 25% of daily calories
        "Lunch": 0.30, # 30% of daily calories
        "Dinner": 0.35, # 35% of daily calories
        "Snack": 0.10 # 10% of daily calories per snack (10% total for 1 snacks)
    }
    
    # For single meal type requests, use all macros
    if request.meal_type != "Full Day":
        meal_macros = {
            request.meal_type: {
                "calories": request.calories,
                "protein": request.protein,
                "carbs": request.carbs,
                "fat": request.fat,
                "fiber": request.fiber,
                "sugar": request.sugar
            }
        }
    else:
        # For "Full Day" meal type, distribute macros proportionally
        meal_macros = {}
        for meal_type, ratio in meal_type_calorie_ratio.items():
            count = meal_counts.get(meal_type, 0)
            if count > 0:
                type_ratio = ratio * count
                meal_macros[meal_type] = {
                    "calories": int(request.calories * type_ratio),
                    "protein": int(request.protein * type_ratio),
                    "carbs": int(request.carbs * type_ratio),
                    "fat": int(request.fat * type_ratio),
                    "fiber": int(request.fiber * type_ratio),
                    "sugar": int(request.sugar * type_ratio)
                }
    
    # Generate meals for each meal type using Google Gemini
    all_generated_meals = []
    for meal_type, macros in meal_macros.items():
        num_meals = meal_counts.get(meal_type, 1)
        prompt = f"""
        Generate EXACTLY {num_meals} {'meal' if num_meals == 1 else 'meals'} - no more, no less. Each must be a complete, **single-serving** {meal_type.lower()} meal for a {request.dietary_preferences} diet.
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
            model = genai.GenerativeModel("gemini-1.5-flash") # Updated model name
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
            print(f"⚠️ Error generating {meal_type} meals: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate {meal_type} meals: {str(e)}"
            )
    
    # Verify we have the correct number of meals
    if len(all_generated_meals) != total_meals_needed:
        print(f"⚠️ Warning: Generated {len(all_generated_meals)} meals but needed {total_meals_needed}")
    
    # Format generated meals and save to DB
    formatted_meals = []
    for meal in all_generated_meals:
        unique_id = f"{random.randint(10000, 99999)}"
        
        # Save the meal to the database with the unique ID
        saved_meal = save_meal_with_hash(
            meal["title"],
            meal["instructions"],
            meal["ingredients"],
            request.dietary_preferences,
            meal["nutrition"],
            meal_plan_id,
            meal["meal_type"],
            request_hash,
            unique_id
        )
        
        # Generate the image URL
        image_url = await generate_and_cache_meal_image(meal["title"], unique_id, meals_collection)
        print(f"📋 DEBUG: Generated meal: {meal['title']} - Image URL: {image_url}")
        
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
    
    # Try to send notification if possible
    try:
        # Look for active chat session based on user_id
        if user_id:
            logger.info(f"Looking for chat sessions for user_id: {user_id}")
            # Find the most recent chat session for this user
            recent_chat = chat_collection.find_one(
                {"user_id": user_id},
                sort=[("created_at", -1)]
            )
            
            if recent_chat:
                session_id = recent_chat.get("session_id")
                logger.info(f"Found session_id: {session_id} for user_id: {user_id}")
                
                # Only try to notify if we have session_id
                if session_id:
                    notification_result = await try_notify_meal_plan_ready(session_id, user_id, meal_plan_id)
                    logger.info(f"Notification result: {notification_result}")
                else:
                    logger.warning(f"Found chat session but no session_id for user_id: {user_id}")
            else:
                logger.warning(f"No chat session found for user_id: {user_id}")
        else:
            logger.warning("No user_id available to find chat session")
    except Exception as e:
        # Log but don't fail if notification fails
        logger.error(f"⚠️ Non-critical error sending notification: {str(e)}")
        # Continue with returning the meal plan
    
    return {"meal_plan": formatted_meals, "cached": False}

@router.get("/{meal_id}")
async def get_meal_by_id(meal_id: str):
    """
    Retrieves a specific meal by its meal_id.
    """
    print(f"🔎 Looking up meal with ID: {meal_id}")  # Debugging
    
    # Direct lookup by meal_id
    meal = meals_collection.find_one({"meal_id": meal_id})
    
    if not meal:
        print(f"⚠️ Meal not found with ID: {meal_id}")
        # Try using meal_id as a regex pattern as a fallback
        pattern = re.escape(meal_id)
        meal = meals_collection.find_one({"meal_id": {"$regex": f".*{pattern}.*"}})
        
    if not meal:
        print(f"⚠️ Meal still not found with pattern: {meal_id}")
        raise HTTPException(status_code=404, detail=f"Meal not found with ID: {meal_id}")

    print(f"✅ Found meal: {meal.get('meal_name')}")
    
    return {
        "id": meal["meal_id"],
        "title": meal["meal_name"],
        "nutrition": meal["macros"],
        "ingredients": meal["ingredients"],
        "instructions": meal["meal_text"],
        "meal_type": meal.get("meal_type"),
        "imageUrl": meal.get("image_url", "/fallback-meal-image.jpg")
    }

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
                print(f"Error validating ingredient '{ingredient.get('name', 'unknown')}': {str(e)}")
                ingredient["usda_validated"] = False
                validated_ingredients.append(ingredient)
    
    # Determine if we should use USDA validated macros
    validation_success = False
    if ingredients and validation_count >= len(ingredients) * 0.5:
        # Round values and use USDA macros if enough ingredients validated
        usda_macros = {k: round(v, 1) for k, v in usda_macros.items()}
        validation_success = True
        print(f"✅ USDA validation successful: {validation_count}/{len(ingredients)} ingredients validated")
        print(f"Original macros: {macros}")
        print(f"USDA macros: {usda_macros}")
    
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

# Ensure the GOOGLE_APPLICATION_CREDENTIALS environment variable is set
credentials_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if credentials_json:
    creds_dict = json.loads(credentials_json)
    credentials = service_account.Credentials.from_service_account_info(creds_dict)
    project_id = creds_dict["project_id"]
else:
    raise EnvironmentError("GOOGLE_APPLICATION_CREDENTIALS environment variable not set or invalid.")

# Initialize Vertex AI with the credentials
region = "us-central1"
vertexai.init(project=project_id, location=region, credentials=credentials)

async def generate_and_cache_meal_image(meal_name, meal_id, meals_collection):
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
        
        # Load the pre-trained image generation model
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
            import tempfile
            import os
            import json
            
            # Create temp directory if it doesn't exist
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
                    print(f"Error with JSON credentials: {str(json_error)}")
                    return fallback_image
            elif credentials_json:
                # It's a path to a file
                try:
                    credentials = service_account.Credentials.from_service_account_file(credentials_json)
                    storage_client = storage.Client(credentials=credentials)
                except Exception as file_error:
                    print(f"Error with credentials file: {str(file_error)}")
                    return fallback_image
            else:
                # Try default credentials
                try:
                    storage_client = storage.Client()
                except Exception as default_error:
                    print(f"Error with default credentials: {str(default_error)}")
                    return fallback_image
            
            if not storage_client:
                print("Failed to initialize storage client")
                return fallback_image
                
            bucket_name = os.getenv("GCS_BUCKET_NAME")
            if not bucket_name:
                print("No bucket name specified")
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
                print(f"Error in storage operations: {str(storage_error)}")
                return fallback_image
        else:
            print("No images were generated")
            return fallback_image
            
    except Exception as e:
        print(f"Error generating image: {str(e)}")
        return fallback_image