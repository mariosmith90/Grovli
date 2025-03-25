from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
import os, json, datetime
from typing import Optional, List
from pymongo import MongoClient
import logging
from app.utils.redis_client import get_cache, set_cache, delete_cache, PROFILE_CACHE_TTL

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Connect to MongoDB
client = MongoClient(os.getenv("MONGO_URI"))
db = client["grovli"]
user_profile_collection = db["user_profiles"]
user_collection = db["users"]
meal_completions_collection = db["meal_completions"]

# Create the router instance
user_profile_router = APIRouter(prefix="/user-profile", tags=["User Profile"])

class UserProfileData(BaseModel):
    goals: List[str] = Field(default=[], description="Health and fitness goals")
    specific_goal: Optional[str] = Field(None, description="Specific goal details")
    gender: str = Field(..., description="User's gender (male/female)")
    age: int = Field(..., gt=0, description="User's age")
    height_feet: int = Field(..., ge=0, description="Height feet component")
    height_inches: int = Field(..., ge=0, lt=12, description="Height inches component")
    current_weight: float = Field(..., gt=0, description="Current weight in pounds")
    goal_weight: Optional[float] = Field(None, gt=0, description="Goal weight in pounds")
    activity_level: str = Field(..., description="Activity level (sedentary, light, moderate, active, very_active)")
    strength_training: bool = Field(default=False, description="Whether user does strength training")
    cardio_frequency: Optional[str] = Field(None, description="Frequency of cardio workouts")
    dietary_preferences: List[str] = Field(default=[], description="Dietary preferences and cuisines")
    food_allergies: List[str] = Field(default=[], description="Food allergies")
    meal_plan_preference: str = Field(..., description="Meal plan type preference")
    weight_loss_speed: Optional[str] = Field(None, description="Desired weight loss speed")
    food_restrictions: List[str] = Field(default=[], description="Foods to avoid")

class MealCompletionStatus(BaseModel):
    user_id: str
    date: str  # YYYY-MM-DD format
    meal_type: str  # "breakfast", "lunch", etc.
    completed: bool

async def ensure_user_exists(user_id: str):
    """Ensure the user exists in the user collection"""
    user = user_collection.find_one({"auth0_id": user_id})
    if not user:
        user_collection.insert_one({
            "auth0_id": user_id,
            "created_at": datetime.datetime.now(),
            "updated_at": datetime.datetime.now()
        })
        logger.info(f"Created new user record for {user_id}")
    return user_id

@user_profile_router.post("/meal-completion")
async def save_meal_completion(status: MealCompletionStatus):
    """Save a meal's completion status for a user on a specific date"""
    try:
        # Store in MongoDB
        meal_completions_collection.update_one(
            {
                "user_id": status.user_id,
                "date": status.date,
                "meal_type": status.meal_type
            },
            {"$set": {"completed": status.completed}},
            upsert=True
        )
        
        # Invalidate any cached meal data for this user/date
        cache_key = f"user_meals:{status.user_id}:{status.date}"
        delete_cache(cache_key)
        
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@user_profile_router.get("/meal-completion/{user_id}/{date}")
async def get_meal_completions(user_id: str, date: str):
    """Get all meal completion statuses for a user on a date"""
    try:
        completions = list(meal_completions_collection.find(
            {"user_id": user_id, "date": date},
            {"_id": 0, "user_id": 0, "date": 0}
        ))
        
        # Convert to dictionary by meal type
        result = {c["meal_type"]: c["completed"] for c in completions}
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@user_profile_router.get("/{user_id}")
async def get_user_profile(user_id: str):
    """Retrieves a user's profile data with Redis caching"""
    try:
        logger.info(f"Fetching profile for user: {user_id}")
        
        # Check Redis cache first
        cache_key = f"user_profile:{user_id}"
        cached_profile = get_cache(cache_key)
        
        if cached_profile:
            logger.info(f"Found profile in Redis cache for user {user_id}")
            return {"found": True, "profile": cached_profile, "cache_source": "redis"}
        
        # If not in cache, look up user profile in MongoDB
        user_profile = user_profile_collection.find_one({"user_id": user_id})
        
        if not user_profile:
            logger.info(f"No profile found for user {user_id}")
            return {"found": False, "message": "No profile found"}
        
        # Remove MongoDB internal fields
        if "_id" in user_profile:
            user_profile_clean = {k: v for k, v in user_profile.items() if k != "_id"}
        else:
            user_profile_clean = user_profile
            
        # Cache the profile in Redis
        set_cache(cache_key, user_profile_clean, PROFILE_CACHE_TTL)
        logger.info(f"Cached user profile in Redis for user {user_id}")
            
        logger.info(f"Found profile in MongoDB for user {user_id}")
        return {"found": True, "profile": user_profile_clean, "cache_source": "mongodb"}
    
    except Exception as e:
        logger.error(f"Error retrieving user profile: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve user profile: {str(e)}"
        )

@user_profile_router.post("/{user_id}")
async def save_user_profile(user_id: str, profile_data: UserProfileData):
    """Save a user's profile data to the database and update Redis cache"""
    try:
        logger.info(f"Saving profile for user: {user_id}")
        
        # Ensure the user exists in the user collection
        await ensure_user_exists(user_id)
        
        # Check if profile already exists
        existing_profile = user_profile_collection.find_one({"user_id": user_id})
        
        # Prepare the data for storage
        profile_dict = profile_data.dict()
        profile_dict["user_id"] = user_id
        profile_dict["updated_at"] = datetime.datetime.now()
        
        if not existing_profile:
            profile_dict["created_at"] = datetime.datetime.now()
            logger.info(f"Creating new profile for user {user_id}")
        else:
            logger.info(f"Updating existing profile for user {user_id}")
            if "created_at" in existing_profile:
                profile_dict["created_at"] = existing_profile["created_at"]
        
        # Update or insert the user profile
        result = user_profile_collection.update_one(
            {"user_id": user_id},
            {"$set": profile_dict},
            upsert=True
        )
        
        # Also update the user record to mark onboarding as complete
        user_collection.update_one(
            {"auth0_id": user_id},
            {
                "$set": {
                    "onboarding_completed": True,
                    "onboarding_completed_at": datetime.datetime.now(),
                    "updated_at": datetime.datetime.now()
                }
            }
        )
        
        # Update the Redis cache
        cache_key = f"user_profile:{user_id}"
        set_cache(cache_key, profile_dict, PROFILE_CACHE_TTL)
        logger.info(f"Updated user profile in Redis cache for user {user_id}")
        
        logger.info(f"Profile saved for user {user_id}: Modified={result.modified_count}, Upserted={result.upserted_id is not None}")
        return {
            "status": "success", 
            "message": "Profile saved successfully", 
            "is_new": not existing_profile
        }
    
    except Exception as e:
        logger.error(f"Error saving user profile: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save user profile: {str(e)}"
        )

@user_profile_router.get("/check-onboarding/{user_id}")
async def check_onboarding_status(user_id: str, request: Request):
    """Check if a user has completed onboarding"""
    try:
        logger.info(f"Checking onboarding status for user: {user_id}")

        # Check for force reset parameter in URL
        force_reset = request.query_params.get("forceReset", "").lower() == "true"
        if force_reset:
            logger.info(f"Force reset detected for user {user_id}")
            return {
                "onboarded": False,
                "profile_exists": True,
                "force_reset": True,
                "message": "Forced reset of onboarding status."
            }

        # Check if the user exists in the `users` collection
        user = user_collection.find_one({"auth0_id": user_id})
        if not user:
            logger.info(f"User {user_id} not found in the users collection.")
            return {
                "onboarded": False,
                "profile_exists": False,
                "message": "User not found."
            }

        # Check if onboarding is marked as complete
        onboarding_completed = user.get("onboarding_completed", False)

        # Check if a user profile exists in the `user_profiles` collection
        profile_exists = user_profile_collection.find_one({"user_id": user_id}) is not None

        if "onboarding_completed" in user and user["onboarding_completed"] is False:
            onboarded = False
            logger.info(f"User {user_id} has explicitly reset onboarding status.")
        else:
            onboarded = onboarding_completed or profile_exists

        logger.info(
            f"Onboarding status for user {user_id}: "
            f"onboarded={onboarded}, profile_exists={profile_exists}, "
            f"explicit_completed={onboarding_completed}"
        )

        return {
            "onboarded": onboarded,
            "profile_exists": profile_exists,
            "message": "Onboarding status checked successfully."
        }

    except Exception as e:
        logger.error(f"Error checking onboarding status for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check onboarding status: {str(e)}"
        )
    
@user_profile_router.post("/reset-onboarding/{user_id}")
async def reset_onboarding(user_id: str):
    """Reset a user's onboarding status"""
    try:
        logger.info(f"Resetting onboarding status for user: {user_id}")
        
        # Update the user record to mark onboarding as incomplete
        result = user_collection.update_one(
            {"auth0_id": user_id},
            {
                "$set": {
                    "onboarding_completed": False,
                    "onboarding_reset_at": datetime.datetime.now(),
                    "updated_at": datetime.datetime.now()
                }
            }
        )
        
        if result.matched_count == 0:
            logger.warning(f"No user found with ID {user_id} to reset onboarding status")
            return {
                "success": False,
                "message": "User not found."
            }
            
        # Clear the Redis cache for this user's profile to ensure fresh data
        cache_key = f"user_profile:{user_id}"
        delete_cache(cache_key)
        
        logger.info(f"Successfully reset onboarding status for user {user_id}")
        
        return {
            "success": True,
            "message": "Onboarding status has been reset successfully."
        }
        
    except Exception as e:
        logger.error(f"Error resetting onboarding status for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reset onboarding status: {str(e)}"
        )