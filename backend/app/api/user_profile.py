from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
import os, json, datetime
from typing import Optional, List
from pymongo import MongoClient
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Connect to MongoDB using the same connection as other routers
client = MongoClient(os.getenv("MONGO_URI"))
db = client["grovli"]
user_profile_collection = db["user_profiles"]
user_collection = db["users"] # Reference to users collection

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

async def ensure_user_exists(user_id: str):
    """
    Ensure the user exists in the user collection.
    If not, create a basic user record.
    """
    user = user_collection.find_one({"auth0_id": user_id})
    if not user:
        # Create a basic user record
        user_collection.insert_one({
            "auth0_id": user_id,
            "created_at": datetime.datetime.now(),
            "updated_at": datetime.datetime.now()
        })
        logger.info(f"Created new user record for {user_id}")
    return user_id

@user_profile_router.get("/{user_id}")
async def get_user_profile(user_id: str):
    """
    Retrieves a user's profile data.
    """
    try:
        logger.info(f"Fetching profile for user: {user_id}")
        
        # Look up user profile in MongoDB
        user_profile = user_profile_collection.find_one({"user_id": user_id})
        
        if not user_profile:
            logger.info(f"No profile found for user {user_id}")
            return {"found": False, "message": "No profile found"}
        
        # Remove MongoDB internal fields
        if "_id" in user_profile:
            del user_profile["_id"]
            
        logger.info(f"Found profile for user {user_id}")
        return {"found": True, "profile": user_profile}
    
    except Exception as e:
        logger.error(f"Error retrieving user profile: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve user profile: {str(e)}"
        )

@user_profile_router.post("/{user_id}")
async def save_user_profile(user_id: str, profile_data: UserProfileData):
    """
    Save a user's profile data to the database, ensuring we don't create duplicates
    """
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
            # This is a new profile, set created_at
            profile_dict["created_at"] = datetime.datetime.now()
            logger.info(f"Creating new profile for user {user_id}")
        else:
            logger.info(f"Updating existing profile for user {user_id}")
            # Preserve the original creation date
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
async def check_onboarding_status(user_id: str):
    """
    Check if a user has completed onboarding
    """
    try:
        # Check user record
        user = user_collection.find_one({"auth0_id": user_id})
        
        if not user:
            return {"onboarded": False, "message": "User not found"}
            
        # Check if onboarding is marked as complete
        onboarding_completed = user.get("onboarding_completed", False)
        
        # Also check for profile existence as a backup
        profile_exists = user_profile_collection.find_one({"user_id": user_id}) is not None
        
        return {
            "onboarded": onboarding_completed or profile_exists,
            "profile_exists": profile_exists
        }
        
    except Exception as e:
        logger.error(f"Error checking onboarding status: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check onboarding status: {str(e)}"
        )