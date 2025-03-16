from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
import os, json, datetime
from typing import Optional
from pymongo import MongoClient
import logging
from app.utils.redis_client import get_cache, set_cache, delete_cache, PROFILE_CACHE_TTL


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Connect to MongoDB using the same connection as other routers
client = MongoClient(os.getenv("MONGO_URI"))
db = client["grovli"]
user_settings_collection = db["user_settings"]

# Create the router instance
user_settings_router = APIRouter(prefix="/user-settings", tags=["User Settings"])

class UserSettings(BaseModel):
    calculationMode: str = Field(default="auto", description="Method for calculating macros")
    calories: int = Field(default=2400, gt=0, description="Daily calorie target")
    carbs: int = Field(default=270, ge=0, description="Daily carbs target in grams")
    protein: int = Field(default=180, ge=0, description="Daily protein target in grams")
    fat: int = Field(default=67, ge=0, description="Daily fat target in grams")
    fiber: int = Field(default=34, ge=0, description="Daily fiber target in grams")
    sugar: int = Field(default=60, ge=0, description="Daily sugar limit in grams")

@user_settings_router.get("/{user_id}")
async def get_user_settings(user_id: str):
    """
    Retrieves a user's stored nutrition settings with Redis caching.
    Returns default values if none exist.
    """
    try:
        logger.info(f"Fetching settings for user: {user_id}")
        
        # Check Redis cache first
        cache_key = f"user_settings:{user_id}"
        cached_settings = get_cache(cache_key)
        
        if cached_settings:
            logger.info(f"Found settings in Redis cache for user {user_id}")
            return cached_settings
        
        # If not in cache, look up user settings in MongoDB
        user_settings = user_settings_collection.find_one({"user_id": user_id})
        
        if not user_settings:
            logger.info(f"No settings found for user {user_id}, returning defaults")
            # Return default settings if none found
            default_settings = UserSettings().dict()
            return default_settings
            
        # Remove MongoDB internal fields
        if "_id" in user_settings:
            user_settings_clean = {k: v for k, v in user_settings.items() if k != "_id"}
        else:
            user_settings_clean = user_settings
        
        # Cache the settings in Redis
        set_cache(cache_key, user_settings_clean, PROFILE_CACHE_TTL)
        logger.info(f"Cached user settings in Redis for user {user_id}")
        
        logger.info(f"Found settings in MongoDB for user {user_id}")
        return user_settings_clean
        
    except Exception as e:
        logger.error(f"Error retrieving user settings: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve user settings: {str(e)}"
        )

@user_settings_router.post("/{user_id}")
async def save_user_settings(user_id: str, settings: UserSettings):
    """
    Save a user's nutrition settings to the database and update Redis cache.
    """
    try:
        logger.info(f"Saving settings for user: {user_id}")
        
        # Convert Pydantic model to dictionary and add user_id and timestamp
        settings_dict = {
            **settings.dict(),
            "user_id": user_id,
            "updated_at": datetime.datetime.now()
        }
        
        # Update or insert the user settings in MongoDB
        result = user_settings_collection.update_one(
            {"user_id": user_id},
            {"$set": settings_dict},
            upsert=True
        )
        
        # Update the Redis cache
        cache_key = f"user_settings:{user_id}"
        set_cache(cache_key, settings_dict, PROFILE_CACHE_TTL)
        logger.info(f"Updated user settings in Redis cache for user {user_id}")
        
        logger.info(f"Settings saved for user {user_id}: Modified={result.modified_count}, Upserted={result.upserted_id is not None}")
        return {"status": "success", "message": "Settings saved successfully"}
        
    except Exception as e:
        logger.error(f"Error saving user settings: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save user settings: {str(e)}"
        )