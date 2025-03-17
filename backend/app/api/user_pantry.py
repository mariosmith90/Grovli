from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo import MongoClient
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import datetime
import os
import uuid
import requests
import json
import google.generativeai as genai
from app.utils.redis_client import get_cache, set_cache, delete_cache, PROFILE_CACHE_TTL
from app.api.user_recipes import get_auth0_user

# Set up Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Get the MongoDB connection details
client = MongoClient(os.getenv("MONGO_URI"))
db = client["grovli"]
user_pantry_collection = db["user_pantry"]
user_collection = db["users"]
meals_collection = db["meals"]

router = APIRouter(prefix="/user-pantry", tags=["User Pantry"])

# --- Pydantic Models ---
class PantryItem(BaseModel):
    name: str
    barcode: Optional[str] = None
    quantity: Optional[int] = 1
    expiry_date: Optional[str] = None
    category: Optional[str] = None
    nutritional_info: Optional[Dict] = None
    image_url: Optional[str] = None

class PantryItemResponse(BaseModel):
    id: str
    name: str
    barcode: Optional[str] = None
    quantity: Optional[int] = 1
    expiry_date: Optional[str] = None
    category: Optional[str] = None
    nutritional_info: Optional[Dict] = None
    image_url: Optional[str] = None
    created_at: str
    updated_at: str

class PantryItemsResponse(BaseModel):
    items: List[PantryItemResponse]

class BarcodeRequest(BaseModel):
    barcode: str

class MealRecommendationRequest(BaseModel):
    ingredients: List[str]
    dietary_preferences: Optional[str] = None

# --- External API Integration for Barcode Scanning ---
def get_product_from_barcode(barcode: str):
    """
    Fetch product information from Open Food Facts API using a barcode
    """
    try:
        response = requests.get(f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json")
        data = response.json()
        
        if data.get("status") == 1:
            product = data.get("product", {})
            
            # Format the response
            return {
                "name": product.get("product_name", "Unknown Product"),
                "barcode": barcode,
                "category": product.get("categories_tags", ["unknown"])[0] if product.get("categories_tags") else "unknown",
                "nutritional_info": {
                    "calories": product.get("nutriments", {}).get("energy-kcal_100g"),
                    "fat": product.get("nutriments", {}).get("fat_100g"),
                    "carbs": product.get("nutriments", {}).get("carbohydrates_100g"),
                    "protein": product.get("nutriments", {}).get("proteins_100g"),
                    "fiber": product.get("nutriments", {}).get("fiber_100g"),
                    "sugar": product.get("nutriments", {}).get("sugars_100g")
                },
                "image_url": product.get("image_url")
            }
        return None
    except Exception as e:
        print(f"Error fetching product from barcode: {e}")
        return None

# --- Gemini Integration for Meal Recommendations ---
def get_meal_recommendations(ingredients: List[str], dietary_preferences: Optional[str] = None):
    """
    Use Google's Gemini model to suggest meals based on ingredients and dietary preferences
    """
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY environment variable is not set"
        )
    
    try:
        # Format the prompt for Gemini
        prompt_parts = [
            f"I have the following ingredients in my pantry: {', '.join(ingredients)}.\n"
        ]
        
        if dietary_preferences:
            prompt_parts.append(f"My dietary preferences are: {dietary_preferences}.\n")
        
        prompt_parts.append(
            "Please suggest 3 meals I can make with these ingredients. For each meal, provide:\n"
            "1. Name of the meal\n"
            "2. List of ingredients needed (mark the ones I already have)\n"
            "3. Brief preparation instructions\n"
            "4. Approximate calories\n"
            "Format the response as JSON with keys: 'recommendations' containing an array of meal objects."
        )
        
        # Generate recommendations using Gemini
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt_parts)
        
        # Parse the response to extract JSON
        try:
            # Attempt to find and parse JSON in the response
            response_text = response.text
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                recommendations = json.loads(json_str)
                return recommendations
            
            # If no valid JSON found, process as text and convert to JSON format
            lines = response_text.split('\n')
            meals = []
            current_meal = {}
            
            for line in lines:
                if "Name:" in line or line.strip().startswith("1.") or line.strip().startswith("Meal 1:"):
                    if current_meal and 'name' in current_meal:
                        meals.append(current_meal)
                    current_meal = {"name": line.split(":", 1)[1].strip() if ":" in line else line.strip()}
                elif "Ingredients:" in line or "ingredients needed:" in line:
                    current_meal["ingredients"] = line.split(":", 1)[1].strip() if ":" in line else line.strip()
                elif "Instructions:" in line or "Preparation:" in line or "preparation instructions:" in line:
                    current_meal["instructions"] = line.split(":", 1)[1].strip() if ":" in line else line.strip()
                elif "Calories:" in line or "calories:" in line:
                    calorie_text = line.split(":", 1)[1].strip() if ":" in line else line.strip()
                    try:
                        # Extract numeric part (approximate calories)
                        import re
                        calorie_match = re.search(r'\d+', calorie_text)
                        if calorie_match:
                            current_meal["calories"] = int(calorie_match.group())
                        else:
                            current_meal["calories"] = 0
                    except:
                        current_meal["calories"] = 0
            
            if current_meal and 'name' in current_meal:
                meals.append(current_meal)
            
            return {"recommendations": meals}
            
        except json.JSONDecodeError:
            # If JSON parsing fails, return a structured format of the text
            return {
                "recommendations": [
                    {"name": "Recommendation", "content": response.text}
                ]
            }
    
    except Exception as e:
        print(f"Error generating meal recommendations: {e}")
        return {"recommendations": [], "error": str(e)}

# --- API Endpoints ---
@router.post("/add-item", response_model=PantryItemResponse)
async def add_pantry_item(item: PantryItem, current_user: dict = Depends(get_auth0_user)):
    """Add an item to the user's pantry"""
    try:
        # Create a unique ID for the item
        item_id = str(uuid.uuid4())
        now = datetime.datetime.now().isoformat()
        
        # Prepare the item document
        pantry_item = {
            "id": item_id,
            "user_id": current_user["id"],
            "name": item.name,
            "barcode": item.barcode,
            "quantity": item.quantity or 1,
            "expiry_date": item.expiry_date,
            "category": item.category,
            "nutritional_info": item.nutritional_info,
            "image_url": item.image_url,
            "created_at": now,
            "updated_at": now
        }
        
        # Save to database
        user_pantry_collection.insert_one(pantry_item)
        
        # Convert MongoDB ObjectId to string for JSON response
        pantry_item["_id"] = str(pantry_item.get("_id", ""))
        
        # Invalidate user pantry cache
        delete_cache(f"user_pantry:{current_user['id']}")
        
        return pantry_item
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add pantry item: {str(e)}"
        )

@router.get("/items", response_model=PantryItemsResponse)
async def get_pantry_items(current_user: dict = Depends(get_auth0_user)):
    """Get all pantry items for the current user"""
    try:
        # Check Redis cache first
        cache_key = f"user_pantry:{current_user['id']}"
        cached_items = get_cache(cache_key)
        
        if cached_items:
            return {"items": cached_items}
        
        # If not in cache, query MongoDB
        items = list(user_pantry_collection.find({"user_id": current_user["id"]}))
        
        # Convert ObjectId to string for each item
        for item in items:
            if "_id" in item:
                item["_id"] = str(item["_id"])
            # Format dates as ISO strings
            if isinstance(item.get("created_at"), datetime.datetime):
                item["created_at"] = item["created_at"].isoformat()
            if isinstance(item.get("updated_at"), datetime.datetime):
                item["updated_at"] = item["updated_at"].isoformat()
        
        # Cache the results
        set_cache(cache_key, items, PROFILE_CACHE_TTL)
        
        return {"items": items}
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get pantry items: {str(e)}"
        )

@router.delete("/items/{item_id}")
async def delete_pantry_item(item_id: str, current_user: dict = Depends(get_auth0_user)):
    """Delete a pantry item"""
    try:
        result = user_pantry_collection.delete_one({
            "id": item_id,
            "user_id": current_user["id"]
        })
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pantry item not found"
            )
        
        # Invalidate cache
        delete_cache(f"user_pantry:{current_user['id']}")
        
        return {"message": "Pantry item deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete pantry item: {str(e)}"
        )

@router.put("/items/{item_id}", response_model=PantryItemResponse)
async def update_pantry_item(item_id: str, item: PantryItem, current_user: dict = Depends(get_auth0_user)):
    """Update a pantry item"""
    try:
        # Get the existing item to make sure it belongs to the user
        existing_item = user_pantry_collection.find_one({
            "id": item_id,
            "user_id": current_user["id"]
        })
        
        if not existing_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pantry item not found"
            )
        
        # Prepare update document
        update_doc = {
            "name": item.name,
            "quantity": item.quantity or existing_item.get("quantity", 1),
            "updated_at": datetime.datetime.now().isoformat()
        }
        
        # Add optional fields if provided
        if item.barcode is not None:
            update_doc["barcode"] = item.barcode
        if item.expiry_date is not None:
            update_doc["expiry_date"] = item.expiry_date
        if item.category is not None:
            update_doc["category"] = item.category
        if item.nutritional_info is not None:
            update_doc["nutritional_info"] = item.nutritional_info
        if item.image_url is not None:
            update_doc["image_url"] = item.image_url
        
        # Update the item
        user_pantry_collection.update_one(
            {"id": item_id, "user_id": current_user["id"]},
            {"$set": update_doc}
        )
        
        # Invalidate cache
        delete_cache(f"user_pantry:{current_user['id']}")
        
        # Get the updated item
        updated_item = user_pantry_collection.find_one({"id": item_id})
        if "_id" in updated_item:
            updated_item["_id"] = str(updated_item["_id"])
        
        return updated_item
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update pantry item: {str(e)}"
        )

@router.post("/lookup-barcode")
async def lookup_barcode(request: BarcodeRequest):
    """Look up product information using a barcode"""
    try:
        product = get_product_from_barcode(request.barcode)
        
        if not product:
            return {
                "found": False,
                "message": "Product not found"
            }
        
        return {
            "found": True,
            "product": product
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to look up barcode: {str(e)}"
        )

@router.post("/recommend-meals")
async def recommend_meals(request: MealRecommendationRequest, current_user: dict = Depends(get_auth0_user)):
    """Generate meal recommendations based on pantry ingredients"""
    try:
        # If no ingredients provided, try to use all ingredients from the user's pantry
        if not request.ingredients or len(request.ingredients) == 0:
            pantry_items = user_pantry_collection.find({"user_id": current_user["id"]})
            ingredients = [item["name"] for item in pantry_items]
            
            if not ingredients:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No ingredients provided and no items in pantry"
                )
        else:
            ingredients = request.ingredients
        
        # Get dietary preferences from user profile if not provided
        dietary_preferences = request.dietary_preferences
        if not dietary_preferences:
            user_profile = user_collection.find_one({"id": current_user["id"]})
            if user_profile and "dietary_preferences" in user_profile:
                dietary_preferences = " ".join(user_profile["dietary_preferences"])
        
        # Get recommendations
        recommendations = get_meal_recommendations(ingredients, dietary_preferences)
        
        return recommendations
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate meal recommendations: {str(e)}"
        )