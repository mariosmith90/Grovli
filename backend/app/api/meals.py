from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
import os, json, uuid
import requests
import re, random, datetime
from typing import List, Set
from pymongo import MongoClient
import logging
from app.utils.tasks import (
    generate_meal_plan as meal_plan_task,
    notify_meal_plan_ready_task
    )
from app.utils.redis_client import get_cache, set_cache, MEAL_CACHE_TTL
from app.api.user_settings import user_settings_collection

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mealplan", tags=["Meal Plan"])

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
    meal_algorithm: str = Field("experimental", description="Algorithm type: 'pantry' or 'experimental'")
    pantry_ingredients: List[str] = Field(default_factory=list, description="Ingredients available in the user's pantry")

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
            "instructions": meal["meal_text"],
            "imageUrl": meal["imageUrl"]  # Standardized field
        }
        for meal in matching_meals
    ]

def try_notify_meal_plan_ready(session_id, user_id, meal_plan_id):
    """
    Sends a notification to the chat service that the meal plan is ready.
    Now simply delegates to the Celery task.
    """
    # First, immediately mark the session as having a meal plan ready
    # This ensures the UI can pick up the status change even if notification hasn't been processed
    try:
        chat_collection.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "meal_plan_ready": True,
                    "meal_plan_id": meal_plan_id,
                    "meal_plan_processing": False,
                    "updated_at": datetime.datetime.now()
                }
            }
        )
        logger.info(f"Updated chat session {session_id} status: meal plan ready")
    except Exception as e:
        logger.error(f"Failed to update chat session status: {str(e)}")
    
    # Then queue the notification task
    notify_meal_plan_ready_task.delay(session_id, user_id, meal_plan_id)
    logger.info(f"Queued notification task for session {session_id}, meal plan {meal_plan_id}")
    return True
    
@router.post("/")
async def generate_meal_plan(request: MealPlanRequest, request_obj: Request):
    """
    Initiates meal plan generation as a background task while providing immediate feedback to the user.
    The actual meal generation happens asynchronously via Celery, allowing the chatbot to continue interacting.
    """
    # Get API key from environment variables
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY environment variable is not set"
        )
    
    # Extract user_id from headers
    user_id = request_obj.headers.get("user-id") or request_obj.headers.get("x-user-id")
    logger.info(f"Processing meal plan request for user_id: {user_id}")
    
    # If user is logged in, try to get their dietary philosophy from settings
    dietary_preferences = request.dietary_preferences.strip()
    if user_id:
        try:
            # Check Redis cache first
            settings_cache_key = f"user_settings:{user_id}"
            cached_settings = get_cache(settings_cache_key)
            
            if cached_settings and cached_settings.get("dietaryPhilosophy"):
                # If the user's preferences already include their philosophy, don't add it again
                philosophy = cached_settings.get("dietaryPhilosophy")
                if philosophy and philosophy not in dietary_preferences:
                    dietary_preferences = f"{dietary_preferences} {philosophy}".strip()
                    logger.info(f"Added dietary philosophy '{philosophy}' from user settings")
            else:
                # If not in Redis, check MongoDB
                user_settings = user_settings_collection.find_one({"user_id": user_id})
                if user_settings and user_settings.get("dietaryPhilosophy"):
                    philosophy = user_settings.get("dietaryPhilosophy")
                    if philosophy and philosophy not in dietary_preferences:
                        dietary_preferences = f"{dietary_preferences} {philosophy}".strip()
                        logger.info(f"Added dietary philosophy '{philosophy}' from database")
        except Exception as e:
            logger.error(f"Error getting user dietary philosophy: {str(e)}")
            # Continue with original preferences if there's an error
    
    # Step 1: Determine the correct number and types of meals needed
    if request.meal_type == "Full Day":
        meal_counts = {
            "Breakfast": request.num_days,  
            "Lunch": request.num_days,      
            "Dinner": request.num_days,     
            "Snack": request.num_days      
        }
        total_meals_needed = sum(meal_counts.values())
    else:
        meal_counts = {request.meal_type: MEAL_TYPE_COUNTS.get(request.meal_type, 1) * request.num_days} 
        total_meals_needed = meal_counts[request.meal_type]
    
    logger.info(f"🍽️ Generating meal plan with {total_meals_needed} total meals: {meal_counts}")
    
    pantry_fingerprint = ""
    if request.meal_algorithm == "pantry" and request.pantry_ingredients:
        # Create a deterministic fingerprint of pantry ingredients
        # Sort them to ensure consistent order regardless of input order
        sorted_ingredients = sorted(request.pantry_ingredients)
        # Take the first few ingredients to keep hash reasonably sized
        pantry_sample = sorted_ingredients[:5]
        pantry_fingerprint = f"_pantry_{'-'.join(pantry_sample)}"

    request_hash = f"{request.meal_type}_{dietary_preferences}_{request.calories}_{request.protein}_{request.carbs}_{request.fat}_{request.fiber}_{request.sugar}_{request.meal_algorithm}{pantry_fingerprint}"
    logger.info(f"🔑 Request hash: {request_hash}")
    
    # Step 3: Check Redis cache first
    cache_key = f"meal_plan:{request_hash}"
    cached_meal_plan = get_cache(cache_key)
    
    if cached_meal_plan and len(cached_meal_plan) >= total_meals_needed:
        logger.info(f"✅ Found cached meal plan in Redis for request hash: {request_hash}")
        logger.info(f"📋 DEBUG: Found {len(cached_meal_plan)} cached meals in Redis")
        formatted_meals = []
        
        for meal in cached_meal_plan[:total_meals_needed]:
            imageUrl = meal.get("imageUrl")  # Standardized field
            logger.info(f"📋 DEBUG: Redis cached meal: {meal.get('meal_name')} - Image URL: {imageUrl}")
            formatted_meal = {
                "id": meal["meal_id"],
                "title": meal["meal_name"],
                "meal_type": meal["meal_type"],
                "nutrition": meal["macros"],
                "ingredients": meal["ingredients"],
                "instructions": meal["meal_text"],
                "imageUrl": imageUrl  # Standardized field
            }
            formatted_meals.append(formatted_meal)
        
        # Notify user through the same logic as before
        try_notify_meal_plan_ready(
            session_id=get_active_session_id(user_id),
            user_id=user_id, 
            meal_plan_id=cached_meal_plan[0].get("meal_plan_id", request_hash)
        )
        
        return {"meal_plan": formatted_meals, "cached": True, "cache_source": "redis"}
    
    # Step 4: If not in Redis, check MongoDB
    existing_meal_plan = list(meals_collection.find({"request_hash": request_hash}).limit(total_meals_needed))
    if len(existing_meal_plan) >= total_meals_needed:
        logger.info(f"✅ Found cached meal plan in MongoDB for request hash: {request_hash}")
        logger.info(f"📋 DEBUG: Found {len(existing_meal_plan)} cached meals in MongoDB")
        formatted_meals = []
        for meal in existing_meal_plan[:total_meals_needed]:
            imageUrl = meal.get("imageUrl")  # Standardized field
            logger.info(f"📋 DEBUG: MongoDB meal: {meal.get('meal_name')} - Image URL: {imageUrl}")
            formatted_meal = {
                "id": meal["meal_id"],
                "title": meal["meal_name"],
                "meal_type": meal["meal_type"],
                "nutrition": meal["macros"],
                "ingredients": meal["ingredients"],
                "instructions": meal["meal_text"],
                "imageUrl": imageUrl  # Standardized field
            }
            formatted_meals.append(formatted_meal)
            
        # Cache the results in Redis for future requests
        set_cache(cache_key, existing_meal_plan, MEAL_CACHE_TTL)
        logger.info(f"📋 DEBUG: Cached MongoDB results in Redis: {cache_key}")
            
        # Try to send notification if possible
        try:
            # Look for active chat session based on user_id
            if user_id:
                session_id = get_active_session_id(user_id)
                if session_id:
                    # Get the meal plan ID from the first meal
                    meal_plan_id = existing_meal_plan[0].get("meal_plan_id", request_hash)
                    
                    # Only try to notify if we have session_id
                    if session_id:
                        # Update chat session to mark meal plan as ready
                        chat_collection.update_one(
                            {"session_id": session_id},
                            {
                                "$set": {
                                    "meal_plan_ready": True,
                                    "meal_plan_id": meal_plan_id,
                                    "meal_plan_processing": False,
                                    "updated_at": datetime.datetime.now()
                                }
                            }
                        )
                        
                        # Add notification task to Celery queue
                        notify_meal_plan_ready_task.delay(session_id, user_id, meal_plan_id)
                        logger.info(f"Added notification task to Celery queue for cached meal plan")
                else:
                    logger.warning(f"No chat session found for user_id: {user_id}")
            else:
                logger.warning("No user_id available to find chat session")
        except Exception as e:
            # Log but don't fail if notification fails
            logger.error(f"⚠️ Non-critical error setting up notification: {str(e)}")
            
        return {"meal_plan": formatted_meals, "cached": True, "cache_source": "mongodb"}
    
    # Step 5: If no cached plan exists, queue generation in Celery
    logger.info(f"⚠️ No cached meal plan found. Scheduling generation of new meals.")
    meal_plan_id = request_hash
    
    # First, update chat session to mark meal plan as processing
    try:
        if user_id:
            session_id = get_active_session_id(user_id)
            if session_id:
                # Update chat session to mark meal plan as processing
                chat_collection.update_one(
                    {"session_id": session_id},
                    {
                        "$set": {
                            "meal_plan_processing": True,
                            "meal_plan_ready": False,
                            "meal_plan_id": meal_plan_id,
                            "updated_at": datetime.datetime.now()
                        }
                    }
                )
                logger.info(f"Updated chat session {session_id} to mark meal plan as processing")
    except Exception as e:
        logger.error(f"⚠️ Non-critical error updating chat session: {str(e)}")
    
    # Convert the Pydantic model to a dictionary for Celery
    request_dict = {
        "dietary_preferences": dietary_preferences,  # Use the combined preferences
        "meal_type": request.meal_type,
        "calories": request.calories,
        "protein": request.protein,
        "carbs": request.carbs,
        "fat": request.fat,
        "fiber": request.fiber,
        "sugar": request.sugar
    }
    
    # Queue the task
    meal_plan_task.delay(
        request_dict,
        user_id,
        meal_counts,
        total_meals_needed,
        meal_plan_id,
        request_hash
    )
    
    # Return an immediate response
    return {
        "status": "processing",
        "message": "Your meal plan is being generated. You can continue chatting while it's processing.",
        "meal_plan_id": meal_plan_id,
        "request_hash": request_hash
    }

# Helper to get the active session ID from a user ID
def get_active_session_id(user_id):
    """Get the most recent chat session ID for a user."""
    if not user_id:
        return None
        
    # Try Redis cache first
    cache_key = f"active_session:{user_id}"
    cached_session = get_cache(cache_key)
    if cached_session:
        return cached_session
    
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
            return session_id
    
    return None

@router.get("/get_latest_session")
async def get_latest_meal_session(request: Request):
    """
    Retrieves information about the latest meal plan session for a user.
    """
    try:
        # Get user_id from headers
        user_id = request.headers.get("user-id") or request.headers.get("x-user-id")
        
        if not user_id:
            raise HTTPException(
                status_code=400,
                detail="user-id header is required"
            )
        
        # Find the active session
        session_id = get_active_session_id(user_id)
        if not session_id:
            raise HTTPException(
                status_code=404,
                detail=f"No active session found for user: {user_id}"
            )
            
        # Get the session details
        chat_session = chat_collection.find_one({"session_id": session_id})
        if not chat_session:
            raise HTTPException(
                status_code=404,
                detail=f"Session not found: {session_id}"
            )
        
        # Return meal plan status information
        return {
            "session_id": session_id,
            "meal_plan_ready": chat_session.get("meal_plan_ready", False),
            "meal_plan_id": chat_session.get("meal_plan_id"),
            "meal_plan_processing": chat_session.get("meal_plan_processing", False)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving latest meal session: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve latest meal session: {str(e)}"
        )

@router.get("/{meal_id}")
async def get_meal_by_id(meal_id: str):
    """
    Retrieves a specific meal by its meal_id with Redis caching.
    """
    print(f"🔎 Looking up meal with ID: {meal_id}")  
    
    # Check Redis cache first
    cache_key = f"meal:{meal_id}"
    cached_meal = get_cache(cache_key)
    if cached_meal:
        print(f"✅ Found meal in Redis cache: {cached_meal.get('meal_name')}")
        return {
            "id": cached_meal["meal_id"],
            "title": cached_meal["meal_name"],
            "nutrition": cached_meal["macros"],
            "ingredients": cached_meal["ingredients"],
            "instructions": cached_meal["meal_text"],
            "meal_type": cached_meal.get("meal_type"),
            "imageUrl": cached_meal.get("imageUrl"),  # Standardized field
            "cache_source": "redis"
        }
    
    # If not in Redis, direct lookup by meal_id in MongoDB
    meal = meals_collection.find_one({"meal_id": meal_id})
    
    if not meal:
        print(f"⚠️ Meal not found with ID: {meal_id}")
        # Try using meal_id as a regex pattern as a fallback
        pattern = re.escape(meal_id)
        meal = meals_collection.find_one({"meal_id": {"$regex": f".*{pattern}.*"}})
        
    if not meal:
        print(f"⚠️ Meal still not found with pattern: {meal_id}")
        raise HTTPException(status_code=404, detail=f"Meal not found with ID: {meal_id}")

    print(f"✅ Found meal in MongoDB: {meal.get('meal_name')}")
    
    # Cache the result in Redis
    set_cache(cache_key, meal, MEAL_CACHE_TTL)
    
    return {
        "id": meal["meal_id"],
        "title": meal["meal_name"],
        "nutrition": meal["macros"],
        "ingredients": meal["ingredients"],
        "instructions": meal["meal_text"],
        "meal_type": meal.get("meal_type"),
        "imageUrl": meal.get("imageUrl"),  # Standardized field
        "cache_source": "mongodb"
    }

@router.get("/by_id/{meal_plan_id}")
async def get_meal_plan_by_id(meal_plan_id: str):
    """
    Retrieves a meal plan by its ID using Redis cache.
    """
    try:
        # Check Redis cache first
        cache_key = f"meal_plan_id:{meal_plan_id}"
        cached_meals = get_cache(cache_key)
        
        if cached_meals:
            logger.info(f"Found meal plan in Redis cache: {meal_plan_id}")
            formatted_meals = []
            for meal in cached_meals:
                formatted_meal = {
                    "id": meal["meal_id"],
                    "title": meal["meal_name"],
                    "meal_type": meal["meal_type"],
                    "nutrition": meal["macros"],
                    "ingredients": meal["ingredients"],
                    "instructions": meal["meal_text"],
                    "imageUrl": meal.get("imageUrl")  # Standardized field
                }
                formatted_meals.append(formatted_meal)
            
            return {"meal_plan": formatted_meals, "cache_source": "redis"}
        
        # If not in cache, find meals in MongoDB
        meals = list(meals_collection.find({"meal_plan_id": meal_plan_id}))

        expected_count = 4  # or dynamically determine based on meal_plan_id
        if len(meals) < expected_count:
            raise HTTPException(status_code=404, detail="Meal plan still generating")
        
        # Cache the results in Redis
        set_cache(cache_key, meals, MEAL_CACHE_TTL)
        
        # Format the meals for return
        formatted_meals = []
        for meal in meals:
            formatted_meal = {
                "id": meal["meal_id"],
                "title": meal["meal_name"],
                "meal_type": meal["meal_type"],
                "nutrition": meal["macros"],
                "ingredients": meal["ingredients"],
                "instructions": meal["meal_text"],
                "imageUrl": meal.get("imageUrl")  # Standardized field
            }
            formatted_meals.append(formatted_meal)
        
        return {"meal_plan": formatted_meals, "cache_source": "mongodb"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving meal plan: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve meal plan: {str(e)}"
        )