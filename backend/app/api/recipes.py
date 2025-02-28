from fastapi import APIRouter, Depends, HTTPException, status, Request
from pymongo import MongoClient
from typing import List
from pydantic import BaseModel
import datetime, os
import uuid


router = APIRouter(prefix="/user-recipes", tags=["User Recipes"])

# Get the database and collections
client = MongoClient(os.getenv("MONGO_URI"))
db = client["meal_plans_db"]
meals_collection = db["meals"]
user_collection = db["users"]
saved_meal_plans_collection = db["saved_meal_plans"]

# --- Pydantic Models ---

class SaveRecipeRequest(BaseModel):
    recipes: List[dict]
    plan_name: str = None

class SavedRecipeResponse(BaseModel):
    id: str
    title: str
    nutrition: dict = None
    ingredients: List[dict] = None
    instructions: str = None

class SavedMealPlanResponse(BaseModel):
    id: str
    user_id: str
    name: str
    created_at: str
    recipes: List[SavedRecipeResponse]

# --- Auth0 User Dependency ---

async def get_auth0_user(request: Request):
    """Get or create user from Auth0 token"""
    auth0_user = await get_current_user_from_auth0(request)
    
    if not auth0_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user ID from Auth0 sub claim
    auth0_id = auth0_user.get("sub")
    
    # Check if user exists in database
    user = user_collection.find_one({"auth0_id": auth0_id})
    
    # If user doesn't exist, create new user record
    if not user:
        email = auth0_user.get("email", "")
        username = auth0_user.get("nickname", "user")
        
        user = {
            "id": str(uuid.uuid4()),
            "auth0_id": auth0_id,
            "email": email,
            "username": username,
            "created_at": datetime.datetime.now()
        }
        user_collection.insert_one(user)
        user = user_collection.find_one({"auth0_id": auth0_id})
    
    return user

# --- API Endpoints ---

@router.post("/saved-recipes/")
async def save_recipes(request: SaveRecipeRequest, current_user: dict = Depends(get_auth0_user)):
    """Save selected recipes to user's saved recipes collection"""
    
    if not request.recipes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No recipes provided"
        )
    
    # Create a meal plan to group these recipes
    plan_id = str(uuid.uuid4())
    plan_name = request.plan_name or f"Meal Plan - {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    # Process recipes
    saved_recipes = []
    for recipe in request.recipes:
        recipe_id = recipe.get("id")
        
        # Check if we need to fetch additional details from meals collection
        mongo_recipe = None
        if recipe_id:
            mongo_recipe = meals_collection.find_one({"meal_id": recipe_id})
        
        # Create saved recipe document
        saved_recipe = {
            "id": str(uuid.uuid4()),
            "recipe_id": recipe_id,
            "title": recipe.get("title") or (mongo_recipe.get("meal_name") if mongo_recipe else "Untitled Recipe"),
            # Use MongoDB data with fallback to request data
            "nutrition": mongo_recipe.get("macros") if mongo_recipe else recipe.get("nutrition", {}),
            "ingredients": mongo_recipe.get("ingredients") if mongo_recipe else recipe.get("ingredients", []),
            "instructions": mongo_recipe.get("meal_text") if mongo_recipe else recipe.get("instructions", ""),
        }
        saved_recipes.append(saved_recipe)
    
    # Create the meal plan document
    meal_plan = {
        "id": plan_id,
        "user_id": current_user["id"],
        "name": plan_name,
        "created_at": datetime.datetime.now(),
        "recipes": saved_recipes
    }
    
    # Save to database
    saved_meal_plans_collection.insert_one(meal_plan)
    
    # Return the created plan
    return {
        "id": meal_plan["id"],
        "user_id": meal_plan["user_id"],
        "name": meal_plan["name"],
        "created_at": meal_plan["created_at"].isoformat(),
        "recipes": saved_recipes
    }

@router.get("/saved-recipes/")
async def get_saved_recipes(
    skip: int = 0, 
    limit: int = 100, 
    current_user: dict = Depends(get_auth0_user)
):
    """Get all saved meal plans for the current user"""
    # Find all meal plans for this user
    cursor = saved_meal_plans_collection.find(
        {"user_id": current_user["id"]}
    ).sort("created_at", -1).skip(skip).limit(limit)
    
    meal_plans = []
    for doc in cursor:
        doc["created_at"] = doc["created_at"].isoformat()
        meal_plans.append(doc)
    
    return meal_plans

@router.get("/saved-recipes/{plan_id}")
async def get_saved_meal_plan(
    plan_id: str, 
    current_user: dict = Depends(get_auth0_user)
):
    """Get a specific saved meal plan by ID"""
    meal_plan = saved_meal_plans_collection.find_one({
        "id": plan_id,
        "user_id": current_user["id"]
    })
    
    if not meal_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )
    
    meal_plan["created_at"] = meal_plan["created_at"].isoformat()
    return meal_plan

@router.delete("/saved-recipes/{plan_id}")
async def delete_saved_meal_plan(
    plan_id: str, 
    current_user: dict = Depends(get_auth0_user)
):
    """Delete a saved meal plan"""
    result = saved_meal_plans_collection.delete_one({
        "id": plan_id,
        "user_id": current_user["id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )
    
    return {"message": "Meal plan deleted successfully"}