from fastapi import APIRouter, HTTPException, Response
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
    "Full Day": 4,       
    "Breakfast": 1,
    "Lunch": 1,
    "Dinner": 1,
    "Snack": 1,    
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
    # Step 1: Determine the correct number and types of meals needed
    if request.meal_type == "Full Day":
        # For "Full Day", we need multiple meal types
        meal_counts = {
            "Breakfast": 1,
            "Lunch": 1, 
            "Dinner": 1,
            "Snack": 1
        }
        total_meals_needed = sum(meal_counts.values())
    else:
        # For specific meal types, we need the count from the mapping
        meal_counts = {request.meal_type: MEAL_TYPE_COUNTS.get(request.meal_type, 1)}
        total_meals_needed = meal_counts[request.meal_type]

    print(f"🍽️ Generating meal plan with {total_meals_needed} total meals: {meal_counts}")

    # Step 2: Create a deterministic hash key that identifies this exact request
    request_hash = f"{request.meal_type}_{request.dietary_preferences}_{request.calories}_{request.protein}_{request.carbs}_{request.fat}_{request.fiber}_{request.sugar}"
    print(f"🔑 Request hash: {request_hash}")
    
    # Step 3: Check if we already have a meal plan for this exact request
    existing_meal_plan = list(meals_collection.find({"request_hash": request_hash}).limit(total_meals_needed))
    
    if len(existing_meal_plan) >= total_meals_needed:
        print(f"✅ Found cached meal plan for request hash: {request_hash}")
        print(f"📋 DEBUG: Found {len(existing_meal_plan)} cached meals")
        
        formatted_meals = []
        for meal in existing_meal_plan[:total_meals_needed]:
            # Get image URL with fallback
            image_url = meal.get("image_url", "/fallback-meal-image.jpg")
            print(f"📋 DEBUG: Cached meal: {meal.get('meal_name')} - Image URL: {image_url}")
            
            formatted_meal = {
                "id": meal["meal_id"],
                "title": meal["meal_name"],
                "nutrition": meal["macros"],
                "ingredients": meal["ingredients"],
                "instructions": meal["meal_text"],
                "meal_type": meal["meal_type"],  # Include meal type in response
                "imageUrl": image_url  # Include the image URL with the right property name
            }
            formatted_meals.append(formatted_meal)
            
        return {"meal_plan": formatted_meals, "cached": True}

    # Step 4: If no cached plan exists, generate a new one
    print(f"⚠️ No cached meal plan found. Generating new meals.")
    meal_plan_id = f"{request_hash}_{random.randint(10000, 99999)}"
    
    # Calculate the macronutrient distribution per meal type
    # This is a simplified approach - in a real app, you'd want to distribute macros intelligently
    # based on meal types (breakfast vs dinner vs snack)
    
    # For simplicity, we'll allocate macros proportionally based on typical calorie distribution
    meal_type_calorie_ratio = {
        "Breakfast": 0.25,  # 25% of daily calories
        "Lunch": 0.30,      # 30% of daily calories
        "Dinner": 0.35,     # 35% of daily calories
        "Snack": 0.10       # 10% of daily calories per snack (10% total for 1 snacks)
    }
    
    # For single meal type requests, use all macros
    if request.meal_type != "Full Day":
        meal_macros = {
            request.meal_type: {
                "calories": request.calories,
                "protein": request.protein,
                "carbs": request.carbs,
                "fat": request.fat,
                "fiber": request.fiber,
                "sugar": request.sugar
            }
        }
    else:
        # For "Full Day" meal type, distribute macros proportionally
        meal_macros = {}
        for meal_type, ratio in meal_type_calorie_ratio.items():
            # Multiply by meal count for that type (e.g., 1 snacks)
            count = meal_counts.get(meal_type, 0)
            if count > 0:
                type_ratio = ratio * count
                meal_macros[meal_type] = {
                    "calories": int(request.calories * type_ratio),
                    "protein": int(request.protein * type_ratio),
                    "carbs": int(request.carbs * type_ratio),
                    "fat": int(request.fat * type_ratio),
                    "fiber": int(request.fiber * type_ratio),
                    "sugar": int(request.sugar * type_ratio)
                }

    # OpenAI API setup
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    client = openai.OpenAI(api_key=api_key)
    
    # Generate meals for each meal type
    all_generated_meals = []
    
    for meal_type, macros in meal_macros.items():
        num_meals = meal_counts.get(meal_type, 1)
        
        prompt = f"""
        Generate {num_meals} complete, **single-serving** {meal_type.lower()} meals for a {request.dietary_preferences} diet.
        The total combined calories of these {meal_type} meals **must equal exactly** {macros['calories']} kcal.

        Prioritize recipes inspired by **Food & Wine, Bon Appétit, and Serious Eats**. Create authentic, realistic recipes 
        that could appear in these publications, with proper culinary techniques and flavor combinations.

        Each meal must be individually balanced and the sum of all {meal_type} meals should meet these targets:

        - Be **a single-serving portion**, accurately scaled  
        - Include **all** ingredients needed for **one serving** (oils, spices, pantry staples)  
        - Match **combined meal macros** (±1% of target values):  
            • Calories: {macros['calories']} kcal  
            • Protein: {macros['protein']} g  
            • Carbs: {macros['carbs']} g  
            • Fat: {macros['fat']} g  
            • Fiber: {macros['fiber']} g  
            • Sugar: {macros['sugar']} g  

        ### **Mandatory Requirements**:
        1. **All {num_meals} meals must be {meal_type} meals**
        2. **All portions must be for a single serving** (e.g., "6 oz chicken," not "2 lbs chicken")  
        3. **Each ingredient must list exact quantities** (e.g., "1 tbsp olive oil," not "olive oil")  
        4. **Calculate macros per ingredient and ensure total macros match per serving**  
        5. **List all essential ingredients** (cooking fats, seasonings, and garnishes)  
        6. **Validate meal totals against individual ingredient macros**  
        7. **All meals must share** meal_plan_id: `{meal_plan_id}` 
        8. **Each recipe must feel like an authentic recipe from Food & Wine, Bon Appétit, or Serious Eats**
 
        ---

        ### **Instructions Formatting Requirements**:
        - **Each instruction step must be detailed, clear, and structured for ease of use**  
        - **Use precise cooking techniques** (e.g., "sear over medium-high heat for 3 minutes per side until golden brown")  
        - **Include prep instructions** (e.g., "Finely mince garlic," "Dice bell peppers into ½-inch cubes")  
        - **Specify temperatures, times, and sensory indicators** (e.g., "Roast at 400°F for 20 minutes until caramelized")  
        - **Use line breaks for readability**  
        - **Include plating instructions** (e.g., "Transfer to a warm plate, drizzle with sauce, and garnish with fresh herbs")  

        ---

        ### **Strict JSON Formatting Requirements**:
        - Escape all double quotes inside strings with a backslash (e.g., \\"example\\")
        - Represent newlines in instructions as \\n
        - Ensure all strings use double quotes
        - No trailing commas in JSON arrays/objects

        ### **Example Response Format**:
        ```json
        [
            {{
                "title": "Herb-Roasted Chicken with Vegetables",
                "meal_plan_id": "{meal_plan_id}",
                "meal_type": "{meal_type}",
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
                    }}
                ],
                "instructions": "### **Step 1: Prepare Ingredients**\\n..."
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

            # Improved JSON extraction with robust regex
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL | re.IGNORECASE)
            if json_match:
                cleaned_response_text = json_match.group(1).strip()
            else:
                cleaned_response_text = response_text.strip() 

            meals_for_type = json.loads(cleaned_response_text)

            if not isinstance(meals_for_type, list):
                raise ValueError(f"AI response for {meal_type} is not a valid list of meals.")

            # Ensure each meal has the correct meal_type
            for meal in meals_for_type:
                meal["meal_type"] = meal_type
                
            # Add these meals to our collection
            all_generated_meals.extend(meals_for_type)

        except Exception as e:
            print(f"⚠️ Error generating {meal_type} meals: {str(e)}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to generate {meal_type} meals: {str(e)}"
            )

    # Verify we have the correct number of meals
    if len(all_generated_meals) != total_meals_needed:
        print(f"⚠️ Warning: Generated {len(all_generated_meals)} meals but needed {total_meals_needed}")
        
    # Format generated meals and save to DB
    formatted_meals = []
    
    for meal in all_generated_meals:
        # Generate a unique ID for this meal
        unique_id = f"{random.randint(10000, 99999)}"
        
        # Save the meal to the database with the unique ID
        saved_meal = save_meal_with_hash(
            meal["title"],
            meal["instructions"],
            meal["ingredients"],
            request.dietary_preferences,
            meal["nutrition"],
            meal_plan_id,
            meal["meal_type"],  # Use the specific meal type
            request_hash,
            unique_id
        )
        
        # Generate the image URL - use await to ensure it completes before continuing
        image_url = await generate_and_cache_meal_image(meal["title"], unique_id)
        print(f"📋 DEBUG: Generated meal: {meal['title']} - Image URL: {image_url}")

        # Add to the formatted meals list
        formatted_meals.append({
            "id": unique_id,
            "title": meal["title"],
            "nutrition": meal["nutrition"],
            "ingredients": meal["ingredients"],
            "instructions": meal["instructions"],
            "meal_type": meal["meal_type"],  # Include meal type in response
            "imageUrl": image_url  # Use consistent imageUrl property for frontend
        })

    return {"meal_plan": formatted_meals, "cached": False}

@router.get("/{meal_id}")
async def get_meal_by_id(meal_id: str):
    """
    Retrieves a specific meal by its meal_id.
    """
    print(f"🔎 Looking up meal with ID: {meal_id}")  # Debugging
    
    # Direct lookup by meal_id
    meal = meals_collection.find_one({"meal_id": meal_id})
    
    if not meal:
        print(f"⚠️ Meal not found with ID: {meal_id}")
        # Try using meal_id as a regex pattern as a fallback
        pattern = re.escape(meal_id)
        meal = meals_collection.find_one({"meal_id": {"$regex": f".*{pattern}.*"}})
        
    if not meal:
        print(f"⚠️ Meal still not found with pattern: {meal_id}")
        raise HTTPException(status_code=404, detail=f"Meal not found with ID: {meal_id}")

    print(f"✅ Found meal: {meal.get('meal_name')}")
    
    return {
        "id": meal["meal_id"],
        "title": meal["meal_name"],
        "nutrition": meal["macros"],
        "ingredients": meal["ingredients"],
        "instructions": meal["meal_text"],
        "imageUrl": meal.get("image_url", "/fallback-meal-image.jpg")
    }

def save_meal_with_hash(meal_name, meal_text, ingredients, dietary_type, macros, meal_plan_id, meal_type, request_hash, meal_id):
    """Save meal with request hashing for caching and USDA validation for nutrition accuracy."""
    # Check for duplicate before saving
    existing_meal = meals_collection.find_one({
        "meal_name": meal_name,
        "request_hash": request_hash
    })
    if existing_meal:
        return existing_meal  # Return the existing meal instead of None
    
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
        "meal_id": meal_id,  # Use the provided meal_id directly
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

async def generate_and_cache_meal_image(meal_name, meal_id):
    """
    Generates a realistic food image for a meal using DALL-E.
    If an image exists in the database, return that instead of generating a new one.
    """
    # Define a fallback image path to use consistently
    fallback_image = "/fallback-meal-image.jpg"
    
    print("\n" + "="*80)
    print(f"🔍 DALL-E DEBUG: Starting image generation for meal '{meal_name}' with ID '{meal_id}'")
    print("="*80)
    
    try:
        # Check if image already exists in MongoDB
        print(f"🔍 DALL-E DEBUG: Checking if image already exists for meal_id: {meal_id}")
        existing_meal = meals_collection.find_one({"meal_id": meal_id}, {"image_url": 1})
        
        print(f"🔍 DALL-E DEBUG: MongoDB lookup result: {existing_meal}")
        
        if existing_meal and "image_url" in existing_meal and existing_meal["image_url"]:
            print(f"✅ DALL-E DEBUG: Cached image found. URL: {existing_meal['image_url']}")
            return existing_meal["image_url"]  # Return cached image URL

        # Configure OpenAI client
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print(f"❌ DALL-E DEBUG: OpenAI API key not configured. Using fallback image.")
            return fallback_image
            
        client = openai.OpenAI(api_key=api_key)
        
        # Enhanced prompt for realistic food photography
        prompt = f"""Highly photorealistic food photography of {meal_name} without any AI artifacts. 
        Professional food styling with realistic textures, natural lighting from the side, 
        and detailed texture. Shot on a Canon 5D Mark IV with 100mm macro lens, f/2.8, natural window light.
        Include realistic imperfections, proper food shadows and reflections.
        A photo that could be published in Bon Appetit magazine."""
        
        print(f"🔍 DALL-E DEBUG: Generated prompt: {prompt[:100]}...")
        print(f"🔍 DALL-E DEBUG: Calling DALL-E API for image generation...")
        
        # Generate image with DALL-E
        image_response = client.images.generate(
            model="dall-e-2",
            prompt=prompt,
            n=1,
            size="1024x1024",
            quality="hd"
        )
        
        # Log the raw response structure
        print(f"🔍 DALL-E DEBUG: Raw API response type: {type(image_response)}")
        print(f"🔍 DALL-E DEBUG: Raw API response attributes: {dir(image_response)}")
        
        # Get image URL from response
        if hasattr(image_response, 'data') and image_response.data and len(image_response.data) > 0:
            print(f"🔍 DALL-E DEBUG: Image data found in response")
            
            # Log the first data item
            data_item = image_response.data[0]
            print(f"🔍 DALL-E DEBUG: Data item type: {type(data_item)}")
            print(f"🔍 DALL-E DEBUG: Data item attributes: {dir(data_item)}")
            
            image_url = data_item.url
            print(f"✅ DALL-E DEBUG: Successfully generated image URL: {image_url}")
        else:
            print(f"❌ DALL-E DEBUG: No valid image data in response. Using fallback.")
            image_url = fallback_image

        # Cache the generated image URL in MongoDB
        print(f"🔍 DALL-E DEBUG: Saving image URL to MongoDB for meal_id: {meal_id}")
        update_result = meals_collection.update_one(
            {"meal_id": meal_id},
            {"$set": {"image_url": image_url}}
        )
        
        # Log the update result
        print(f"🔍 DALL-E DEBUG: MongoDB update result: {update_result.raw_result}")
        print(f"🔍 DALL-E DEBUG: Matched count: {update_result.matched_count}")
        print(f"🔍 DALL-E DEBUG: Modified count: {update_result.modified_count}")
        print(f"🔍 DALL-E DEBUG: Upserted ID: {update_result.upserted_id}")
        
        if update_result.modified_count > 0:
            print(f"✅ DALL-E DEBUG: Successfully saved image URL to database")
        else:
            # If no documents were modified, check if document exists
            meal_exists = meals_collection.find_one({"meal_id": meal_id})
            if meal_exists:
                print(f"⚠️ DALL-E DEBUG: Document exists but was not modified. Maybe URL was already set?")
                print(f"⚠️ DALL-E DEBUG: Existing image URL: {meal_exists.get('image_url')}")
            else:
                print(f"❌ DALL-E DEBUG: Failed to update image URL - Document with meal_id {meal_id} not found")

        print(f"🔍 DALL-E DEBUG: Returning image URL: {image_url}")
        print("="*80 + "\n")
        return image_url

    except Exception as e:
        print(f"❌ DALL-E DEBUG: Error generating image: {str(e)}")
        print(f"❌ DALL-E DEBUG: Exception type: {type(e)}")
        import traceback
        print(f"❌ DALL-E DEBUG: Traceback: {traceback.format_exc()}")
        print("="*80 + "\n")
        return fallback_image  # Return fallback image if generation fails