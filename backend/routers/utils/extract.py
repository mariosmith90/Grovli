import re, os, random
from typing import List
from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient(os.getenv("MONGO_URI"))
db = client["meal_plans_db"]
meals_collection = db["meals"]

def extract_ingredients_from_meal_plan(meal_plan: str) -> List[str]:
    """
    Extracts ingredients from a formatted meal plan text using regex.
    """
    ingredient_section_pattern = re.compile(r"\*\*Ingredients:\*\*\s*(.*?)\n\n", re.DOTALL)
    ingredient_matches = ingredient_section_pattern.findall(meal_plan)

    ingredients = []
    for match in ingredient_matches:
        lines = match.strip().split("\n")
        for line in lines:
            clean_line = line.strip()
            if clean_line and not clean_line.startswith("- "):  # Exclude bullet points if present
                ingredients.append(clean_line)

    return list(set(ingredients))  # Remove duplicates

def save_meal(meal_name: str, meal_text: str, ingredients: list, dietary_type: str, macros: dict, meal_type: str):
    """
    Saves individual meals into the database if they do not already exist.
    Meals are uniquely identified by {meal_type}_{dietary_type}_{calories}_{unique_id}.
    """

    base_meal_id = f"{meal_type}_{dietary_type}_{macros.get('calories', 0)}".lower()

    # Generate a unique 5-digit identifier
    unique_id = f"{random.randint(10000, 99999)}"
    full_meal_id = f"{base_meal_id}_{unique_id}"

    # Check if this meal name already exists under this base ID
    existing_meal = meals_collection.find_one({
        "meal_id": base_meal_id,
        "meal_name": meal_name
    })

    if existing_meal:
        print(f"⚠️ Meal '{meal_name}' ({full_meal_id}) already exists in the database.")
        return

    # Clean ingredients (remove numbering/bullets)
    cleaned_ingredients = [re.sub(r"^\d+\.\s*", "", ing).strip() for ing in ingredients]

    # Save each meal independently
    meal_data = {
        "meal_id": full_meal_id,  # Unique meal identifier
        "base_meal_id": base_meal_id,  # Used for category-level lookup
        "meal_name": meal_name,
        "meal_text": meal_text,
        "ingredients": cleaned_ingredients,
        "dietary_type": dietary_type,
        "meal_type": meal_type,
        "macros": macros,
    }

    meals_collection.insert_one(meal_data)
    print(f"✅ Meal '{meal_name}' ({full_meal_id}) saved to the database.")