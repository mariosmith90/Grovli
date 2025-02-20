import re, os, random, datetime
from typing import List
from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient(os.getenv("MONGO_URI"))
db = client["meal_plans_db"]
meals_collection = db["meals"]

from typing import List, Dict

def extract_ingredients_from_meal_plan(meal_plan: List[Dict]) -> List[str]:
    """
    Extracts ingredient names from a structured meal plan.

    Expected meal plan format:
    [
        {
            "title": "Meal Name",
            "ingredients": [
                {"name": "Chicken Breast", "quantity": "6 oz"},
                {"name": "Mixed Greens", "quantity": "2 cups"}
            ],
            "instructions": "Step-by-step cooking instructions."
        },
        ...
    ]

    Returns:
        A list of unique ingredient names.
    """

    ingredients = set()  # Using a set to remove duplicates

    for meal in meal_plan:
        meal_ingredients = meal.get("ingredients", [])
        for ingredient in meal_ingredients:
            if isinstance(ingredient, dict) and "name" in ingredient:
                ingredients.add(ingredient["name"].strip())  # Extract only the ingredient name

    return list(ingredients)  # Convert set back to a list for return

def save_meal(meal_name: str, meal_text: str, ingredients: list, dietary_type: str, macros: dict, meal_plan_id: str = None, meal_type: str = None, request_hash: str = None):
    """Saves meals into MongoDB with unique `meal_plan_id`."""
    meal_calories = macros.get("calories", 0)
    
    # Handle optional parameters for backward compatibility
    meal_type = meal_type or "Unknown"
    meal_plan_id = meal_plan_id or f"{meal_type}_{dietary_type}_{meal_calories}_{random.randint(10000, 99999)}"
    
    base_meal_id = f"{meal_type}_{dietary_type}_{meal_calories}".lower()
    unique_id = f"{random.randint(10000, 99999)}"
    full_meal_id = f"{base_meal_id}_{unique_id}"

    existing_meal = meals_collection.find_one({
        "meal_name": meal_name,
        "meal_plan_id": meal_plan_id
    })

    if existing_meal:
        return  # Avoid duplicates

    meal_data = {
        "meal_id": full_meal_id,
        "meal_plan_id": meal_plan_id,
        "meal_name": meal_name,
        "meal_text": meal_text,
        "ingredients": ingredients,
        "dietary_type": dietary_type,
        "meal_type": meal_type,
        "macros": macros
    }
    
    # Add request_hash if provided for better caching
    if request_hash:
        meal_data["request_hash"] = request_hash
        meal_data["created_at"] = datetime.datetime.now()

    meals_collection.insert_one(meal_data)