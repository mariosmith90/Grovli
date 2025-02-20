from typing import List, Dict
import requests, os, json, openai
from collections import Counter
from fastapi import HTTPException
from pydantic import BaseModel
from routers.meal_plan import extract_ingredients_from_meal_plan, MealPlanText
from fastapi import APIRouter, HTTPException
from typing import List, Optional

router = APIRouter(prefix="/shopping_list", tags=["Shopping List"])

INSTACART_API_URL = "https://connect.dev.instacart.tools/idp/v1/products/products_link"

class ShoppingListResponse(BaseModel):
    list_id: str
    url: str
    items: List[Dict]

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OpenAI API key not configured")

client = openai.OpenAI(api_key=api_key)

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
    
def clean_ingredient_name(ingredient: str) -> str:
    """
    Uses OpenAI GPT to remove macros, units, and preparation descriptors from ingredient names.
    Returns only the essential raw product name.
    """
    prompt = f"""
    Extract only the raw, unprocessed ingredient name from the following text.
    Remove any numbers, nutritional details (calories, carbs, protein, fat, fiber, sugar), 
    measurement units (cup, tbsp, tsp, oz, grams, ml, lb), and preparation descriptions.

    Example conversions:
    - "1/2 cup cooked quinoa" → "quinoa"
    - "3 oz grilled chicken breast" → "chicken breast"
    - "1 tbsp diced onion" → "onion"
    - "2 cups mashed sweet potato" → "sweet potato"
    - "4 slices cheddar cheese" → "cheddar cheese"

    Ingredient: "{ingredient}"

    Return only the cleaned product name.
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )
        cleaned_name = response.choices[0].message.content.strip()
        return cleaned_name.split("\n")[0]  # Ensure only one word is returned

    except Exception as e:
        print(f"Error calling OpenAI API: {str(e)}")
        return ingredient  # Return original ingredient in case of failure

@router.post("/create_shopping_list/")
async def create_shopping_list_endpoint(request: ShoppingListRequest):
    """
    Create a shopping list on Instacart from the meal plan ingredients.
    Returns both the shopping list details and the Instacart URL.
    """
    if not request.meal_plan.strip():
        raise HTTPException(status_code=400, detail="Meal plan cannot be empty")
    
    try:
        # ✅ Debug: Print the received meal_plan
        print("📝 Raw meal plan request:", request.meal_plan)

        # ✅ Parse JSON meal plan and extract ingredients
        meal_plan_data = json.loads(request.meal_plan)  # Ensure it's treated as a list
        ingredients = extract_ingredients_from_meal_plan(meal_plan_data)

        # ✅ Debug: Print the extracted ingredients
        print("🥦 Extracted ingredients:", ingredients)

        if not ingredients:
            raise HTTPException(status_code=400, detail="No ingredients extracted from the meal plan.")

        # Create new shopping list
        result = await create_shopping_list(ingredients, request.list_name)

        return {
            "status": "success",
            "message": "Shopping list created",
            "shopping_list": result.dict(),
        }
            
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid meal plan format. Expected JSON.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
async def create_shopping_list(ingredients: List[str], name: str = "Weekly Meal Plan") -> ShoppingListResponse: 
    """
    Create a shopping list on Instacart from a list of ingredients.
    Returns the shopping list details including the URL to view it on Instacart.
    """
    api_key = os.getenv("INSTACART_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Instacart API key not configured")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    cleaned_ingredients = [clean_ingredient_name(ingredient) for ingredient in ingredients]
    ingredient_counts = Counter(cleaned_ingredients)
    payload = {
        "title": name,
        "line_items": [{"name": ing, "quantity": qty} for ing, qty in ingredient_counts.items()]
    }

    print("📢 Payload being sent to Instacart:")
    print(json.dumps(payload, indent=2))

    try:
        response = requests.post(
            INSTACART_API_URL,
            headers=headers,
            json=payload
        )
        response.raise_for_status()

        # ✅ Print response for debugging
        print("Full Instacart Response:", response.text)

        data = response.json()
        products_link_url = data.get("products_link_url")
        list_id = data.get("list_id", "dev-list")  # ✅ Fallback to "dev-list" if missing

        # ✅ Only check for products_link_url (matches the old version)
        if not products_link_url:
            raise HTTPException(status_code=500, detail="Missing 'products_link_url' in Instacart response")

        return ShoppingListResponse(
            list_id=list_id,  # ✅ Now allows missing list_id
            url=products_link_url,
            items=[{"name": ing, "quantity": qty} for ing, qty in ingredient_counts.items()] 
        )

    except requests.exceptions.RequestException as e:
        error_detail = f"Instacart API connection error: {str(e)}"
        raise HTTPException(status_code=500, detail=error_detail)