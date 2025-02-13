from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from routers.utils.extract import extract_ingredients_from_meal_plan
from routers.utils.grocery import create_shopping_list, update_shopping_list
import openai
import os
import requests
import re
from typing import List, Optional, Set

router = APIRouter(prefix="/mealplan", tags=["Meal Plan"])

# USDA FoodData Central API URL
USDA_API_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

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
                # "redirect_url": result.url  # URL to the Instacart shopping list
            }
        else:
            # Create new shopping list
            result = await create_shopping_list(ingredients, request.list_name)
            return {
                "status": "success",
                "message": "Shopping list created",
                "shopping_list": result.dict(),
                # "redirect_url": result.url  # URL to the Instacart shopping list
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

@router.post("/")
async def generate_meal_plan(request: MealPlanRequest):
    try:
        session_tracker.clear()
        
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")

        client = openai.OpenAI(api_key=api_key)

        if "keto" in request.dietary_preferences.lower():
            request.fat = int(request.calories * 0.80 / 9)
            request.protein = int(request.calories * 0.15 / 4)
            request.carbs = int(request.calories * 0.05 / 4)

        meal_type_text = (
            "Breakfast, Lunch, Dinner, and two snacks"
            if request.meal_type.lower() == "all"
            else request.meal_type
        )

        full_meal_plan = []
        max_retries = 3

        for day in range(1, request.num_days + 1):
            day_completed = False
            retry_count = 0

            while not day_completed and retry_count < max_retries:
                prompt = (
                    f"Create a unique meal plan for Day {day} of {request.num_days} for a {request.dietary_preferences} diet.\n"
                    f"Each day must include: {meal_type_text}.\n\n"
                    f"## Day {day}\n"
                    f"**Expected Macros for Day {day}:**\n"
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
                recipe_titles = extract_recipe_titles(meal_plan)

                has_duplicates = False
                for title in recipe_titles:
                    if session_tracker.is_duplicate(title):
                        has_duplicates = True
                        break

                if not has_duplicates:
                    for title in recipe_titles:
                        session_tracker.add_recipe(title)

                    meal_lines = meal_plan.split("\n")
                    updated_meal_plan = []
                    current_section = None
                    ingredients = []

                    for line in meal_lines:
                        if not updated_meal_plan and not line.strip():
                            continue

                        if line.strip().startswith("**Ingredients:**"):
                            current_section = "ingredients"
                            updated_meal_plan.append(line)
                            continue

                        if line.strip().startswith("**Instructions:**"):
                            current_section = "instructions"
                            updated_meal_plan.append(line)
                            continue

                        if current_section == "ingredients":
                            if line.strip() and not line.strip().startswith("**"):
                                ingredients.append(line.strip())
                            updated_meal_plan.append(line)
                        else:
                            updated_meal_plan.append(line)

                    ingredient_macros = {}
                    for ingredient in ingredients:
                        macros = fetch_ingredient_macros(ingredient)
                        if macros:
                            ingredient_macros[ingredient] = macros

                    for ingredient, macros in ingredient_macros.items():
                        macros_str = ", ".join(f"{key}: {value}g" for key, value in macros.items())
                        updated_meal_plan.append(f"- {ingredient}: {macros_str}")

                    if day > 1:
                        full_meal_plan.append(f"\n### Day {day}\n")

                    full_meal_plan.append("\n".join(updated_meal_plan))
                    day_completed = True
                else:
                    retry_count += 1

            if not day_completed:
                raise HTTPException(
                    status_code=500,
                    detail=f"Unable to generate unique recipes for day {day} after {max_retries} attempts"
                )

        try:
            # Creating shopping list from already extracted ingredients
            shopping_list = await create_shopping_list(
                ingredients,  # We already have this from the meal plan generation
                f"Meal Plan - {request.dietary_preferences}"
            )
            
            return {
                "meal_plan": "\n\n".join(full_meal_plan),
                "adjusted_macros": {
                    "calories": request.calories,
                    "carbs": request.carbs,
                    "protein": request.protein,
                    "fat": request.fat,
                    "fiber": request.fiber,
                    "sugar": request.sugar,
                },
                "shopping_list": {
                    "url": shopping_list.url,
                    "items": shopping_list.items
                },               
                # "redirect_url": shopping_list.url
            }
        except Exception as e:
            print(f"Warning: Failed to create shopping list: {str(e)}")
            # Return without shopping list if creation fails
            return {
                "meal_plan": "\n\n".join(full_meal_plan),
                "adjusted_macros": {
                    "calories": request.calories,
                    "carbs": request.carbs,
                    "protein": request.protein,
                    "fat": request.fat,
                    "fiber": request.fiber,
                    "sugar": request.sugar,
                }
            }

    except openai.OpenAIError as e:
        raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))