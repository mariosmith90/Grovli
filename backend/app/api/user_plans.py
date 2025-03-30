from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo import MongoClient
from typing import Dict, List, Any, Optional
import datetime
import os
import uuid
from pydantic import BaseModel 
from app.utils.celery_config import celery_app
from app.utils.redis_client import get_cache, set_cache, delete_cache, PROFILE_CACHE_TTL

# Get the MongoDB connection details
client = MongoClient(os.getenv("MONGO_URI"))
db = client["grovli"]
user_meal_plans_collection = db["user_meal_plans"]
saved_meals_collection = db["saved_meals"]
user_collection = db["users"]

router = APIRouter(prefix="/user-plans", tags=["User Meal Plans"])

# --- Pydantic Models ---
class MealPlanItem(BaseModel):
    date: str
    mealType: str
    mealId: str
    meal_name: Optional[str] = None
    meal_type: Optional[str] = None
    macros: Optional[dict] = {}
    ingredients: Optional[List[dict]] = []
    instructions: Optional[str] = ""
    imageUrl: Optional[str] = ""
    calories: Optional[int] = 0
    current_day: bool = False

class SaveMealPlanRequest(BaseModel):
    userId: str
    planName: Optional[str] = None
    meals: List[MealPlanItem]

class UpdateMealPlanRequest(BaseModel):
    planId: str
    meals: List[MealPlanItem]

class DeleteMealRequest(BaseModel):
    planId: str
    date: str
    mealType: str

# --- Helper to get user from Auth0 ID ---
async def get_user_by_auth0_id(auth0_id: str):
    cache_key = f"user:{auth0_id}"
    cached_user = get_cache(cache_key)
    if cached_user:
        return cached_user
        
    user = user_collection.find_one({"auth0_id": auth0_id})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if "_id" in user:
        user_clean = {k: v for k, v in user.items() if k != "_id"}
    else:
        user_clean = user
        
    set_cache(cache_key, user_clean, PROFILE_CACHE_TTL)
    return user

# --- API Endpoints ---
@router.post("/save")
async def save_meal_plan(request: SaveMealPlanRequest):
    try:
        user = user_collection.find_one({"auth0_id": request.userId})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        plan_id = str(uuid.uuid4())
        plan_name = request.planName or f"Meal Plan - {datetime.datetime.now().strftime('%Y-%m-%d')}"
        
        processed_meals = []
        for meal_item in request.meals:
            # First try to use data from request
            if meal_item.meal_name:
                meal_details = {
                    "id": meal_item.mealId,
                    "title": meal_item.meal_name,
                    "name": meal_item.meal_name,
                    "meal_type": meal_item.meal_type or meal_item.mealType,
                    "nutrition": meal_item.macros,
                    "ingredients": meal_item.ingredients,
                    "instructions": meal_item.instructions,
                    "imageUrl": meal_item.imageUrl,
                    "calories": meal_item.calories
                }
            else:
                # Fallback to cache/database lookup
                meal_cache_key = f"meal:{meal_item.mealId}"
                cached_meal = get_cache(meal_cache_key)
                
                if cached_meal:
                    meal_details = {
                        "id": cached_meal["meal_id"],
                        "title": cached_meal["meal_name"],
                        "name": cached_meal["meal_name"],
                        "meal_type": cached_meal["meal_type"],
                        "nutrition": cached_meal["macros"],
                        "ingredients": cached_meal["ingredients"],
                        "instructions": cached_meal["meal_text"],
                        "imageUrl": cached_meal.get("imageUrl", ""),
                        "calories": cached_meal["macros"].get("calories", 0)
                    }
                else:
                    meal_details = None
                    saved_meal_plans = saved_meals_collection.find({})
                    
                    for plan in saved_meal_plans:
                        if "recipes" in plan:
                            for recipe in plan["recipes"]:
                                if recipe.get("id") == meal_item.mealId:
                                    meal_details = recipe
                                    break
                            if meal_details:
                                break
                    
                    if not meal_details:
                        from app.api.meals import meals_collection
                        meal_doc = meals_collection.find_one({"meal_id": meal_item.mealId})
                        if meal_doc:
                            meal_details = {
                                "id": meal_doc["meal_id"],
                                "title": meal_doc["meal_name"],
                                "name": meal_doc["meal_name"],
                                "meal_type": meal_doc["meal_type"],
                                "nutrition": meal_doc["macros"],
                                "ingredients": meal_doc["ingredients"],
                                "instructions": meal_doc["meal_text"],
                                "imageUrl": meal_doc.get("imageUrl", ""),
                                "calories": meal_doc["macros"].get("calories", 0)
                            }
                            set_cache(meal_cache_key, meal_doc, PROFILE_CACHE_TTL)
            
            if meal_details:
                processed_meal = {
                    "date": meal_item.date,
                    "mealType": meal_item.mealType,
                    "meal": meal_details
                }
                processed_meals.append(processed_meal)
        
        meal_plan = {
            "id": plan_id,
            "user_id": request.userId,
            "name": plan_name,
            "created_at": datetime.datetime.now(),
            "updated_at": datetime.datetime.now(),
            "meals": processed_meals
        }
        
        user_meal_plans_collection.insert_one(meal_plan)
        delete_cache(f"user_plans:{request.userId}")
        
        return {
            "id": plan_id,
            "name": plan_name,
            "message": "Meal plan saved successfully"
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save meal plan: {str(e)}"
        )
    
@router.get("/user/{user_id}")
async def get_user_meal_plans(user_id: str):
    """Get all meal plans for a specific user"""
    try:
        # Check Redis cache first
        cache_key = f"user_plans:{user_id}"
        cached_plans = get_cache(cache_key)
        
        if cached_plans:
            return cached_plans
        
        # If not in cache, query MongoDB
        plans = list(user_meal_plans_collection.find({"user_id": user_id}))
        
        # Convert ObjectId to string and format dates to make it JSON serializable
        for plan in plans:
            if "_id" in plan:
                plan["_id"] = str(plan["_id"])
            if "created_at" in plan:
                plan["created_at"] = plan["created_at"].isoformat()
            if "updated_at" in plan:
                plan["updated_at"] = plan["updated_at"].isoformat()
        
        # Cache the results
        set_cache(cache_key, plans, PROFILE_CACHE_TTL)
        
        return plans
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user meal plans: {str(e)}"
        )

@router.get("/{plan_id}")
async def get_meal_plan(plan_id: str):
    """Get a specific meal plan by ID"""
    # Check Redis cache first
    cache_key = f"plan:{plan_id}"
    cached_plan = get_cache(cache_key)
    
    if cached_plan:
        return cached_plan
    
    # If not in cache, query MongoDB
    plan = user_meal_plans_collection.find_one({"id": plan_id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )
    
    # Convert ObjectId to string and format dates to make it JSON serializable
    if "_id" in plan:
        plan["_id"] = str(plan["_id"])
    if "created_at" in plan:
        plan["created_at"] = plan["created_at"].isoformat()
    if "updated_at" in plan:
        plan["updated_at"] = plan["updated_at"].isoformat()
    
    # Cache the result
    set_cache(cache_key, plan, PROFILE_CACHE_TTL)
    
    return plan

@router.put("/update")
@router.post("/update")  # Support both methods
async def update_meal_plan(request: UpdateMealPlanRequest):
    """Update an existing meal plan"""
    try:
        # Verify plan exists
        from app.api.meals import meals_collection
        plan = user_meal_plans_collection.find_one({"id": request.planId})
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meal plan not found"
            )
        
        # Process each meal in the plan
        processed_meals = []
        
        # Get today's date for current_day flag
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        
        for meal_item in request.meals:
            # Check if the date is today for setting current_day
            is_current_day = meal_item.date == today
            if hasattr(meal_item, 'current_day'):
                is_current_day = is_current_day or meal_item.current_day
            
            # Check Redis cache for meal details
            meal_cache_key = f"meal:{meal_item.mealId}"
            cached_meal = get_cache(meal_cache_key)
            
            if cached_meal:
                # Use cached meal details
                meal_details = {
                    "id": cached_meal["meal_id"],
                    "title": cached_meal["meal_name"],
                    "name": cached_meal["meal_name"],
                    "meal_type": cached_meal["meal_type"],
                    "nutrition": cached_meal["macros"],
                    "ingredients": cached_meal["ingredients"],
                    "instructions": cached_meal["meal_text"],
                    "imageUrl": cached_meal.get("imageUrl", ""),  # Fixed: Use camelCase
                    "calories": cached_meal["macros"].get("calories", 0)
                }
            else:
                # For each meal we need to get the full meal details
                meal_details = None
                
                # Look up meal from saved_meals collection
                saved_meal_plans = saved_meals_collection.find({})
                
                # Search through saved meal plans for this meal
                for saved_plan in saved_meal_plans:
                    if "recipes" in saved_plan:
                        for recipe in saved_plan["recipes"]:
                            if recipe.get("id") == meal_item.mealId:
                                meal_details = recipe
                                break
                        if meal_details:
                            break
                
                # If not found in saved_meals, check meals collection
                if not meal_details:
                    meal_doc = meals_collection.find_one({"meal_id": meal_item.mealId})
                    if meal_doc:
                        meal_details = {
                            "id": meal_doc["meal_id"],
                            "title": meal_doc["meal_name"],
                            "name": meal_doc["meal_name"],
                            "meal_type": meal_doc["meal_type"],
                            "nutrition": meal_doc["macros"],
                            "ingredients": meal_doc["ingredients"],
                            "instructions": meal_doc["meal_text"],
                            "imageUrl": meal_doc.get("imageUrl", ""),  # Fixed: Use camelCase
                            "calories": meal_doc["macros"].get("calories", 0)
                        }
                        
                        # Cache this meal for future requests
                        set_cache(meal_cache_key, meal_doc, PROFILE_CACHE_TTL)
            
            if meal_details:
                # Ensure the meal has a name field
                if "name" not in meal_details and "title" in meal_details:
                    meal_details["name"] = meal_details["title"]
                
                processed_meal = {
                    "date": meal_item.date,
                    "mealType": meal_item.mealType,
                    "meal": meal_details,
                    "current_day": is_current_day
                }
                processed_meals.append(processed_meal)
        
        # Update the meal plan document
        user_meal_plans_collection.update_one(
            {"id": request.planId},
            {
                "$set": {
                    "meals": processed_meals,
                    "updated_at": datetime.datetime.now()
                }
            }
        )
        
        # Invalidate caches
        delete_cache(f"plan:{request.planId}")
        
        # Get user ID to invalidate user plans cache
        if plan and "user_id" in plan:
            delete_cache(f"user_plans:{plan['user_id']}")
        
        return {"message": "Meal plan updated successfully"}
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update meal plan: {str(e)}"
        )

@router.delete("/{plan_id}")
async def delete_meal_plan(plan_id: str):
    """Delete a meal plan"""
    # Get user ID before deleting for cache invalidation
    plan = user_meal_plans_collection.find_one({"id": plan_id})
    user_id = plan.get("user_id") if plan else None
    
    result = user_meal_plans_collection.delete_one({"id": plan_id})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )
    
    # Invalidate caches
    delete_cache(f"plan:{plan_id}")
    if user_id:
        delete_cache(f"user_plans:{user_id}")
    
    return {"message": "Meal plan deleted successfully"}

@router.post("/meal/delete")
async def delete_meal_from_plan(request: DeleteMealRequest):
    """Delete a specific meal from a plan"""
    try:
        # Get the current plan
        plan = user_meal_plans_collection.find_one({"id": request.planId})
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meal plan not found"
            )
        
        # Filter out the meal to delete
        updated_meals = [
            meal for meal in plan["meals"]
            if not (meal["date"] == request.date and meal["mealType"] == request.mealType)
        ]
        
        # Update the plan
        user_meal_plans_collection.update_one(
            {"id": request.planId},
            {
                "$set": {
                    "meals": updated_meals,
                    "updated_at": datetime.datetime.now()
                }
            }
        )
        
        # Invalidate caches
        delete_cache(f"plan:{request.planId}")
        if "user_id" in plan:
            delete_cache(f"user_plans:{plan['user_id']}")
        
        return {"message": "Meal deleted from plan successfully"}
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete meal from plan: {str(e)}"
        )

# Task to clean up orphaned meal plans
@celery_app.task(name="cleanup_orphaned_meal_plans")
def cleanup_orphaned_meal_plans():
    """Background task to remove meal plans for users that no longer exist"""
    try:
        # Get all user IDs
        user_ids = [user["id"] for user in user_collection.find({}, {"id": 1})]
        
        # Find meal plans with no associated user
        orphaned_plans = user_meal_plans_collection.find({"user_id": {"$nin": user_ids}})
        
        # Delete orphaned plans and invalidate their caches
        for plan in orphaned_plans:
            plan_id = plan.get("id")
            user_id = plan.get("user_id")
            
            user_meal_plans_collection.delete_one({"id": plan_id})
            
            # Invalidate caches
            if plan_id:
                delete_cache(f"plan:{plan_id}")
            if user_id:
                delete_cache(f"user_plans:{user_id}")
            
        return {"status": "success", "message": "Orphaned meal plans cleaned up"}
    
    except Exception as e:
        return {"status": "error", "message": str(e)}