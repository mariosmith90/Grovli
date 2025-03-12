from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo import MongoClient
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import datetime
import os
import uuid
from app.utils.celery_config import celery_app

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
    """Get user document from MongoDB based on Auth0 ID"""
    user = user_collection.find_one({"auth0_id": auth0_id})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user

# --- API Endpoints ---
@router.post("/save")
async def save_meal_plan(request: SaveMealPlanRequest):
    """Save a meal plan for a user"""
    try:
        # Verify user exists
        user = user_collection.find_one({"auth0_id": request.userId})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Create plan ID
        plan_id = str(uuid.uuid4())
        
        # Generate plan name if not provided
        plan_name = request.planName or f"Meal Plan - {datetime.datetime.now().strftime('%Y-%m-%d')}"
        
        # Process each meal in the plan
        processed_meals = []
        for meal_item in request.meals:
            # For each meal we need to get the full meal details from saved_meals
            meal_details = None
            
            # Look up meal from saved_meals collection
            saved_meal_plans = saved_meals_collection.find({})
            
            # Search through saved meal plans for this meal
            for plan in saved_meal_plans:
                if "recipes" in plan:
                    for recipe in plan["recipes"]:
                        if recipe.get("id") == meal_item.mealId:
                            meal_details = recipe
                            break
                    if meal_details:
                        break
            
            # If not found in saved_meals, check meals collection
            if not meal_details:
                from app.api.meals import meals_collection
                meal_doc = meals_collection.find_one({"meal_id": meal_item.mealId})
                if meal_doc:
                    calories_value = meal_doc["macros"].get("calories", 0)
                    meal_details = {
                        "id": meal_doc["meal_id"],
                        "title": meal_doc["meal_name"],
                        "name": meal_doc["meal_name"],  # Add name explicitly
                        "meal_type": meal_doc["meal_type"],
                        "nutrition": meal_doc["macros"],
                        "ingredients": meal_doc["ingredients"],
                        "instructions": meal_doc["meal_text"],
                        "imageUrl": meal_doc.get("image_url", ""),
                        "calories": calories_value  # Add calories explicitly as a number
                    }
                
            if meal_details:
                processed_meal = {
                    "date": meal_item.date,
                    "mealType": meal_item.mealType,
                    "meal": meal_details
                }
                processed_meals.append(processed_meal)
        
        # Create the meal plan document - MOVED OUTSIDE THE LOOP
        meal_plan = {
            "id": plan_id,
            "user_id": request.userId,
            "name": plan_name,
            "created_at": datetime.datetime.now(),
            "updated_at": datetime.datetime.now(),
            "meals": processed_meals
        }
        
        # Save to database - MOVED OUTSIDE THE LOOP
        user_meal_plans_collection.insert_one(meal_plan)
        
        return {  # MOVED OUTSIDE THE LOOP
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
        plans = list(user_meal_plans_collection.find({"user_id": user_id}))
        
        # Convert ObjectId to string to make it JSON serializable
        for plan in plans:
            if "_id" in plan:
                plan["_id"] = str(plan["_id"])
            if "created_at" in plan:
                plan["created_at"] = plan["created_at"].isoformat()
            if "updated_at" in plan:
                plan["updated_at"] = plan["updated_at"].isoformat()
        
        return plans
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user meal plans: {str(e)}"
        )

@router.get("/{plan_id}")
async def get_meal_plan(plan_id: str):
    """Get a specific meal plan by ID"""
    plan = user_meal_plans_collection.find_one({"id": plan_id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )
    
    # Convert ObjectId to string to make it JSON serializable
    if "_id" in plan:
        plan["_id"] = str(plan["_id"])
    if "created_at" in plan:
        plan["created_at"] = plan["created_at"].isoformat()
    if "updated_at" in plan:
        plan["updated_at"] = plan["updated_at"].isoformat()
    
    return plan

@router.put("/update")
@router.post("/update")  # Support both methods
async def update_meal_plan(request: UpdateMealPlanRequest):
    """Update an existing meal plan"""
    try:
        # Verify plan exists
        plan = user_meal_plans_collection.find_one({"id": request.planId})
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meal plan not found"
            )
        
        # Process each meal in the plan
        processed_meals = []
        for meal_item in request.meals:
            # For each meal we need to get the full meal details from saved_meals
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
                from app.api.meals import meals_collection  # Use app.api instead of app.routers
                meal_doc = meals_collection.find_one({"meal_id": meal_item.mealId})
                if meal_doc:
                    meal_details = {
                        "id": meal_doc["meal_id"],
                        "title": meal_doc["meal_name"],
                        "name": meal_doc["meal_name"],  # Add name field explicitly
                        "meal_type": meal_doc["meal_type"],
                        "nutrition": meal_doc["macros"],
                        "ingredients": meal_doc["ingredients"],
                        "instructions": meal_doc["meal_text"],
                        "imageUrl": meal_doc.get("image_url", ""),
                        "calories": meal_doc["macros"].get("calories", 0)  # Add calories explicitly
                    }
            
            if meal_details:
                # Ensure the meal has a name field
                if "name" not in meal_details and "title" in meal_details:
                    meal_details["name"] = meal_details["title"]
                
                processed_meal = {
                    "date": meal_item.date,
                    "mealType": meal_item.mealType,
                    "meal": meal_details
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
        
        return {"message": "Meal plan updated successfully"}
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update meal plan: {str(e)}"
        )

@router.delete("/{plan_id}")
async def delete_meal_plan(plan_id: str):
    """Delete a meal plan"""
    result = user_meal_plans_collection.delete_one({"id": plan_id})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )
    
    return {"message": "Meal plan deleted successfully"}

@router.delete("/meal")
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
        
        # Delete orphaned plans
        for plan in orphaned_plans:
            user_meal_plans_collection.delete_one({"id": plan["id"]})
            
        return {"status": "success", "message": "Orphaned meal plans cleaned up"}
    
    except Exception as e:
        return {"status": "error", "message": str(e)}