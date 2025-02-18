from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from routers.utils.extract import extract_ingredients_from_meal_plan, save_meal
from routers.utils.grocery import create_shopping_list, update_shopping_list
import openai
import os
import requests
import re, random
from typing import List, Optional, Set
from pymongo import MongoClient

router = APIRouter(prefix="/mealplan", tags=["Meal Plan"])

# USDA FoodData Central API URL
USDA_API_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

# Connect to MongoDB
client = MongoClient(os.getenv("MONGO_URI"))
db = client["meal_plans_db"]
meals_collection = db["meals"]

class MealPlanText(BaseModel):
    meal_plan: str

@router.post("/extract_ingredients/")
async def extract_ingredients(meal_plan_request: MealPlanText):
    """
    Extract ingredients from the given meal plan text.
    """
    if not meal_plan_request.meal_plan.strip():
        raise HTTPException(status_code=400, detail="Meal plan cannot be empty")

    ingredients = extract_ingredients_from_meal_plan(meal_plan_request.meal_plan)
    return {"ingredients": ingredients}

class ShoppingListRequest(BaseModel):
    meal_plan: str
    list_name: Optional[str] = "Weekly Meal Plan"
    list_id: Optional[str] = None


@router.post("/create_shopping_list/")
async def create_shopping_list_endpoint(request: ShoppingListRequest):
    """
    Create or update a shopping list on Instacart from the meal plan ingredients.
    Returns both the shopping list details and the Instacart URL.
    """
    if not request.meal_plan.strip():
        raise HTTPException(status_code=400, detail="Meal plan cannot be empty")
    
    try:
        # Extract ingredients using existing function
        ingredients = extract_ingredients_from_meal_plan(request.meal_plan)
        
        if request.list_id:
            # Update existing shopping list
            result = await update_shopping_list(request.list_id, ingredients)
            return {
                "status": "success",
                "message": "Shopping list updated",
                "shopping_list": result.dict(),
            }
        else:
            # Create new shopping list
            result = await create_shopping_list(ingredients, request.list_name)
            return {
                "status": "success",
                "message": "Shopping list created",
                "shopping_list": result.dict(),
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

def extract_recipe_titles(content: str) -> List[str]:
    """Extract recipe titles from the meal plan text."""
    return re.findall(r'### MEAL: (.+?)(?=\n|$)', content)

def fetch_ingredient_macros(ingredient: str):
    """Fetches macros for a given ingredient using the USDA API."""
    api_key = os.getenv("USDA_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="USDA API key not configured")

    params = {"query": ingredient, "api_key": api_key}
    response = requests.get(USDA_API_URL, params=params)

    if response.status_code != 200:
        return None

    data = response.json()
    if not data.get("foods"):
        return None

    food_item = data["foods"][0]

    nutrient_mapping = {
        208: "calories",
        203: "protein",
        205: "carbs",
        204: "fat",
        269: "sugar",
        291: "fiber"
    }

    macros = {nutrient_mapping[nutrient["nutrientId"]]: nutrient["value"]
              for nutrient in food_item["foodNutrients"] if nutrient["nutrientId"] in nutrient_mapping}

    return macros

@router.post("/archive_meal_plan/")
async def archive_meal_plan(request: MealPlanText):
    """
    Saves each meal in a generated meal plan separately to the database for future reuse.
    """
    if not request.meal_plan.strip():
        raise HTTPException(status_code=400, detail="Meal plan cannot be empty")

    ingredients = extract_ingredients_from_meal_plan(request.meal_plan)

    # Extract dietary type
    dietary_type_match = re.search(r"(?<=for a )([\w\s]+)(?= diet)", request.meal_plan)
    dietary_type = dietary_type_match.group(1) if dietary_type_match else "Unknown"

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
        meal_ingredients = extract_ingredients_from_meal_plan(meal_text)

        # Save each meal separately
        save_meal(meal_name.strip(), meal_text, meal_ingredients, dietary_type, macros)

    return {"status": "success", "message": "Meals archived successfully"}


def find_meal_by_macros(meal_type: str, dietary_type: str, calories: int):
    """
    Searches MongoDB for meals matching the base identifier: {meal_type}_{dietary_type}_{calories}.
    If meals exist, randomly selects one.
    """

    base_meal_id = f"{meal_type}_{dietary_type}_{calories}".lower()

    matching_meals = list(meals_collection.find({"base_meal_id": base_meal_id}))

    if matching_meals:
        selected_meal = random.choice(matching_meals)  # Pick a random meal
        print(f"✅ Selected meal '{selected_meal['meal_name']}' from {len(matching_meals)} options for {base_meal_id}.")
        return selected_meal
    else:
        print(f"⚠️ No meals found for {base_meal_id}. Generating a new meal.")
        return None

@router.post("/")
async def generate_meal_plan(request: MealPlanRequest):
    """
    Generates a meal plan by first checking MongoDB for existing meals that match the requested macros.
    If no match is found, it generates new meals via OpenAI.
    """

    full_meal_plan = []
    adjusted_macros = {
        "calories": request.calories,
        "protein": request.protein,
        "carbs": request.carbs,
        "fat": request.fat,
        "fiber": request.fiber,
        "sugar": request.sugar,
    }

    base_meal_id = f"{request.meal_type}_{request.dietary_preferences}_{request.calories}".lower()

    print(f"🔍 Checking for existing meals under {base_meal_id}...")

    # Try to find an existing meal in the category
    existing_meal = find_meal_by_macros(request.meal_type, request.dietary_preferences, request.calories)

    if existing_meal:
        print(f"✅ Using stored meal: {existing_meal['meal_name']} ({existing_meal['meal_id']})")
        full_meal_plan.append(existing_meal["meal_text"])  # Ensure meal text is appended
    else:
        print(f"⚠️ No existing meal found. Generating a new meal.")

        # OpenAI API Key
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")

        client = openai.OpenAI(api_key=api_key)

        meal_type_text = (
            "Breakfast, Lunch, Dinner, and two snacks"
            if request.meal_type.lower() == "all"
            else request.meal_type
        )

        prompt = (
            f"Create a unique meal plan for a {request.dietary_preferences} diet with {request.calories} calories.\n"
            f"Each day must include: {meal_type_text}.\n\n"
            f"**Expected Macros:**\n"
            f"- Total calories: {request.calories} kcal\n"
            f"- Carbohydrates: {request.carbs}g\n"
            f"- Protein: {request.protein}g\n"
            f"- Fat: {request.fat}g\n"
            f"- Fiber: {request.fiber}g\n"
            f"- Sugar: ≤{request.sugar}g\n\n"
            f"**Important: Generate completely unique recipes that have not been used before.**\n\n"
            f"**Format Requirements:**\n"
            f"1. Each meal title must be formatted as ### MEAL: Recipe Name\n"
            f"2. Include a '**Nutrition:**' section with total meal macros\n"
            f"3. List ingredients under '**Ingredients:**'\n"
            f"4. Provide macros per ingredient\n"
            f"5. Provide detailed instructions under '**Instructions:**'\n"
        )

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a precision-focused nutritionist and chef that creates detailed, accurate meal plans with exact measurements and clear cooking instructions. Always create unique recipe names."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7
        )

        meal_plan = response.choices[0].message.content

        # Extract individual meal names from the meal plan
        meal_names = extract_recipe_titles(meal_plan)

        if not meal_names:
            meal_names = [f"Meal for {base_meal_id}"]

        # Save each meal separately with a new unique identifier
        for meal_name in meal_names:
            ingredients = extract_ingredients_from_meal_plan(meal_plan)

            save_meal(meal_name, meal_plan, ingredients, request.dietary_preferences, {
                "calories": request.calories, "protein": request.protein,
                "carbs": request.carbs, "fat": request.fat,
                "fiber": request.fiber, "sugar": request.sugar
            }, request.meal_type)

            full_meal_plan.append(meal_plan)

    # Ensure the response properly prints the full meal plan
    meal_plan_text = "\n\n".join(full_meal_plan)
    print(f"📄 Full Meal Plan Output:\n{meal_plan_text}")  # Debugging output

    return {
        "meal_plan": meal_plan_text,
        "adjusted_macros": adjusted_macros,
    }