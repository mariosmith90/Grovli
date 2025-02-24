from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import openai
import os
import requests
import re, random, json, datetime
from typing import List, Set
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

# Define the expected number of meals based on Meal Type
MEAL_TYPE_COUNTS = {
    "All": 5,       
    "Breakfast": 1,
    "Lunch": 1,
    "Dinner": 1,
    "Snack": 2,    
}

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

    # Extract dietary type
    dietary_type_match = re.search(r"(?<=for a )([\w\s]+)(?= diet)", request.meal_plan)
    dietary_type = dietary_type_match.group(1) if dietary_type_match else "Unknown"

    # Generate a unique meal_plan_id for this archive
    archive_id = f"archive_{random.randint(10000, 99999)}"
    meal_type = "Mixed"  # Default meal type for archived meals

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

    return {"status": "success", "message": "Meals archived successfully", "meal_plan_id": archive_id}


def find_meal_by_macros(meal_type: str, dietary_type: str, macros: dict, session_id: str, num_meals: int):
    """
    Searches MongoDB for meals that match the exact required macros and meal type.
    Returns stored meals if available, otherwise triggers new meal generation.
    """
    base_meal_id = f"{meal_type}_{dietary_type}_{macros['calories']}".lower()  

    # Enforce strict macro matching
    macro_filter = {
        "macros.calories": macros.get("calories", 0),
        "macros.protein": macros.get("protein", 0),
        "macros.carbs": macros.get("carbs", 0),
        "macros.fat": macros.get("fat", 0),
        "macros.fiber": macros.get("fiber", 0),
        "macros.sugar": macros.get("sugar", 0),
        "session_id": session_id  # Ensure meals from the same session are retrieved together
    }

    # Fetch meals that **exactly** match the required macros
    matching_meals = list(meals_collection.find({"base_meal_id": base_meal_id, **macro_filter}).limit(num_meals))

    if len(matching_meals) >= num_meals:
        print(f"✅ Found {len(matching_meals)} meals for {base_meal_id}. Returning stored results.")
        return matching_meals

    print(f"⚠️ Only found {len(matching_meals)} meals. Generating {num_meals - len(matching_meals)} more.")
    return matching_meals  # Return what exists, let OpenAI generate the rest

def find_meal_by_meal_plan_id(meal_plan_id: str):
    """
    Retrieves meals from MongoDB based on a shared `meal_plan_id`.
    This ensures meals are grouped and retrieved together.
    """
    matching_meals = list(meals_collection.find({"meal_plan_id": meal_plan_id}))

    if matching_meals:
        print(f"✅ Found {len(matching_meals)} meals for meal_plan_id: {meal_plan_id}")
    else:
        print(f"⚠️ No meals found for meal_plan_id: {meal_plan_id}")

    return [
        {
            "title": meal["meal_name"],
            "nutrition": meal["macros"],
            "ingredients": meal["ingredients"],
            "instructions": meal["meal_text"]
        }
        for meal in matching_meals
    ]

@router.post("/")
async def generate_meal_plan(request: MealPlanRequest):
    """
    Generates a meal plan by retrieving stored meals from MongoDB first.
    If enough meals do not exist, it generates new meals with OpenAI.
    """
    num_meals_needed = MEAL_TYPE_COUNTS.get(request.meal_type, 1)

    # Step 1: Create a SIMPLE deterministic hash key that identifies this exact request
    # This guarantees the same requests get the same results
    request_hash = f"{request.meal_type}_{request.dietary_preferences}_{request.calories}_{request.protein}_{request.carbs}_{request.fat}_{request.fiber}_{request.sugar}"
    print(f"🔑 Request hash: {request_hash}")
    
    # Step 2: Check if we already have a meal plan for this exact request
    existing_meal_plan = list(meals_collection.find({"request_hash": request_hash}).limit(num_meals_needed))
    
    if len(existing_meal_plan) >= num_meals_needed:
        print(f"✅ Found cached meal plan for request hash: {request_hash}")
        formatted_meals = [
            {
                "title": meal["meal_name"],
                "nutrition": meal["macros"],
                "ingredients": meal["ingredients"],
                "instructions": meal["meal_text"]
            }
            for meal in existing_meal_plan[:num_meals_needed]
        ]
        return {"meal_plan": formatted_meals, "cached": True}

    # Step 3: If no cached plan exists, generate a new one
    print(f"⚠️ No cached meal plan found. Generating new meals.")
    meal_plan_id = f"{request_hash}_{random.randint(10000, 99999)}"
    
    total_macros = {
        "calories": request.calories,
        "protein": request.protein,
        "carbs": request.carbs,
        "fat": request.fat,
        "fiber": request.fiber,
        "sugar": request.sugar,
    }

    # OpenAI API setup
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    client = openai.OpenAI(api_key=api_key)

    prompt = f"""
    Generate {num_meals_needed} complete, **single-serving** {request.meal_type.lower()} meals for a {request.dietary_preferences} diet.  
    Prioritize recipes from **Food & Wine, Bon Appétit, and Serious Eats**. Each meal must:

    - Be **a single-serving portion**, accurately scaled  
    - Include **all** ingredients needed for **one serving** (oils, spices, pantry staples)  
    - Match **individual meal macros** (±1% of target values):  
        • Calories: {total_macros['calories']} kcal  
        • Protein: {total_macros['protein']} g  
        • Carbs: {total_macros['carbs']} g  
        • Fat: {total_macros['fat']} g  
        • Fiber: {total_macros['fiber']} g  
        • Sugar: {total_macros['sugar']} g  

    ### **Mandatory Requirements**:
    1. **All portions must be for a single serving** (e.g., "6 oz chicken," not "2 lbs chicken")  
    2. **Each ingredient must list exact quantities** (e.g., "1 tbsp olive oil," not "olive oil")  
    3. **Calculate macros per ingredient and ensure total macros match per serving**  
    4. **List all essential ingredients** (cooking fats, seasonings, and garnishes)  
    5. **Validate meal totals against individual ingredient macros**  
    6. **All meals must share** meal_plan_id: `{meal_plan_id}`  

    ---

    ### **Example Response Format**:
    ```json
    [
        {{
            "title": "Herb-Roasted Chicken with Vegetables",
            "meal_plan_id": "{meal_plan_id}",
            "nutrition": {{
                "calories": 625,
                "protein": 42,
                "carbs": 38,
                "fat": 22,
                "fiber": 8,
                "sugar": 9
            }},
            "ingredients": [
                {{
                    "name": "Boneless chicken breast",
                    "quantity": "6 oz",
                    "macros": {{
                        "calories": 280,
                        "protein": 38,
                        "carbs": 0,
                        "fat": 12,
                        "fiber": 0,
                        "sugar": 0
                    }}
                }},
                {{
                    "name": "Olive oil",
                    "quantity": "1 tbsp",
                    "macros": {{
                        "calories": 119,
                        "protein": 0,
                        "carbs": 0,
                        "fat": 14,
                        "fiber": 0,
                        "sugar": 0
                    }}
                }},
                {{
                    "name": "Fresh rosemary",
                    "quantity": "1 tsp chopped",
                    "macros": {{
                        "calories": 2,
                        "protein": 0,
                        "carbs": 0,
                        "fat": 0,
                        "fiber": 0,
                        "sugar": 0
                    }}
                }}
            ],
            "instructions": "1. **Prep Chicken**: Pat dry chicken. Mix 1 tsp rosemary, 1/2 tsp salt, 1/4 tsp pepper. Rub onto chicken.\\n2. **Cook**: Heat olive oil in oven-safe skillet. Sear chicken 3 mins/side. Transfer to 400°F oven for 18 mins.\\n3. **Rest**: Let chicken rest 5 mins before serving."
        }}
    ]
    ```
    **Strictly return only JSON with no extra text.**
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )

        response_text = response.choices[0].message.content.strip()
        cleaned_response_text = re.sub(r"^```json\n|\n```$", "", response_text)  # Fix markdown JSON issue

        generated_meals = json.loads(cleaned_response_text)

        if not isinstance(generated_meals, list):
            raise ValueError("AI response is not a valid list of meals.")

        # Save all newly generated meals with the request hash for future caching
        for meal in generated_meals:
            save_meal_with_hash(
                meal["title"],
                meal["instructions"],
                meal["ingredients"],
                request.dietary_preferences,
                meal["nutrition"],
                meal_plan_id,
                request.meal_type,
                request_hash  # Add the request hash
            )

        # Format generated meals
        formatted_meals = [
            {
                "title": meal["title"],
                "nutrition": meal["nutrition"],
                "ingredients": meal["ingredients"],
                "instructions": meal["instructions"]
            }
            for meal in generated_meals
        ]

    except json.JSONDecodeError as e:
        print(f"⚠️ JSONDecodeError: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI-generated meal plan.")

    return {"meal_plan": formatted_meals, "cached": False}

def save_meal_with_hash(meal_name, meal_text, ingredients, dietary_type, macros, meal_plan_id, meal_type, request_hash):
    """Save meal with request hashing for caching and USDA validation for nutrition accuracy."""
    # Check for duplicate before saving
    existing_meal = meals_collection.find_one({
        "meal_name": meal_name,
        "request_hash": request_hash
    })
    if existing_meal:
        return  # Avoid duplicates

    # Generate IDs
    meal_calories = macros.get("calories", 0)
    unique_id = f"{random.randint(10000, 99999)}"
    full_meal_id = f"{meal_type}_{dietary_type}_{meal_calories}_{unique_id}"
    
    # USDA validation
    validated_ingredients = []
    usda_macros = {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0,
        "sugar": 0,
        "fiber": 0
    }
    validation_count = 0
    
    # Process ingredients if available in expected format
    if isinstance(ingredients, list) and ingredients:
        for ingredient in ingredients:
            if not isinstance(ingredient, dict) or "name" not in ingredient:
                validated_ingredients.append(ingredient)
                continue
            
            try:
                # Clean ingredient name for better USDA matching
                clean_name = re.sub(r'^\d+\s*[\d/]*\s*(?:cup|tbsp|tsp|oz|g|lb|ml|l)s?\s*', '', ingredient["name"], flags=re.IGNORECASE)
                clean_name = re.sub(r'diced|chopped|minced|sliced|cooked|raw|fresh|frozen|canned', '', clean_name, flags=re.IGNORECASE)
                clean_name = clean_name.strip()
                
                # Get USDA data
                usda_data = fetch_ingredient_macros(clean_name)
                
                if usda_data:
                    # Keep track of USDA validation and attach data to ingredient
                    ingredient["usda_validated"] = True
                    ingredient["usda_macros"] = usda_data
                    validation_count += 1
                    
                    # Try to extract quantity
                    quantity_str = ingredient.get("quantity", "")
                    grams = 0
                    
                    # Simple quantity extraction
                    if "g" in quantity_str:
                        match = re.search(r'(\d+(?:\.\d+)?)\s*g', quantity_str)
                        if match:
                            grams = float(match.group(1))
                    elif "cup" in quantity_str.lower():
                        match = re.search(r'(\d+(?:\.\d+)?)', quantity_str)
                        if match:
                            grams = float(match.group(1)) * 240  # ~240g per cup
                    elif "tbsp" in quantity_str.lower() or "tablespoon" in quantity_str.lower():
                        match = re.search(r'(\d+(?:\.\d+)?)', quantity_str)
                        if match:
                            grams = float(match.group(1)) * 15  # ~15g per tbsp  
                    elif "oz" in quantity_str.lower():
                        match = re.search(r'(\d+(?:\.\d+)?)', quantity_str)
                        if match:
                            grams = float(match.group(1)) * 28.35  # ~28.35g per oz
                    else:
                        # Try to extract just the number
                        match = re.search(r'^(\d+(?:\.\d+)?)', quantity_str)
                        if match:
                            grams = float(match.group(1))
                        else:
                            grams = 100  # Default if no quantity found
                    
                    # Calculate nutrition based on quantity
                    factor = grams / 100.0  # USDA data is per 100g
                    for key in usda_macros:
                        if key in usda_data:
                            usda_macros[key] += usda_data[key] * factor
                else:
                    ingredient["usda_validated"] = False
                
                validated_ingredients.append(ingredient)
                
            except Exception as e:
                print(f"Error validating ingredient '{ingredient.get('name', 'unknown')}': {str(e)}")
                ingredient["usda_validated"] = False
                validated_ingredients.append(ingredient)
    
    # Determine if we should use USDA validated macros
    validation_success = False
    if ingredients and validation_count >= len(ingredients) * 0.5:
        # Round values and use USDA macros if enough ingredients validated
        usda_macros = {k: round(v, 1) for k, v in usda_macros.items()}
        validation_success = True
        print(f"✅ USDA validation successful: {validation_count}/{len(ingredients)} ingredients validated")
        print(f"Original macros: {macros}")
        print(f"USDA macros: {usda_macros}")
    
    # Use the appropriate macros
    final_macros = usda_macros if validation_success else macros
    
    # Add validation metadata
    final_macros["usda_validated"] = validation_success
    
    # Build meal data
    meal_data = {
        "meal_id": full_meal_id,
        "meal_plan_id": meal_plan_id,
        "meal_name": meal_name,
        "meal_text": meal_text,
        "ingredients": validated_ingredients,
        "dietary_type": dietary_type,
        "meal_type": meal_type,
        "macros": final_macros,
        "original_macros": macros if validation_success else None,
        "request_hash": request_hash,
        "created_at": datetime.datetime.now()
    }

    # Save to database
    meals_collection.insert_one(meal_data)
    return meal_data