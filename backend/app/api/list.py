from typing import List, Dict
import requests, os, json, openai
from collections import Counter
from fastapi import HTTPException
from pydantic import BaseModel
from app.api.meals import MealPlanText
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

class ShoppingListRequest(BaseModel):
    meal_plan: str
    list_name: Optional[str] = "Weekly Meal Plan"
    list_id: Optional[str] = None

@router.post("/create_shopping_list/")
async def create_shopping_list_endpoint(request: ShoppingListRequest):
    """
    Create a shopping list from extracted meal plan ingredients.
    """
    if not request.meal_plan.strip():
        raise HTTPException(status_code=400, detail="Meal plan cannot be empty")

    try:
        # ✅ Parse meal plan JSON and extract ingredients
        meal_plan_data = json.loads(request.meal_plan)

        # ✅ Extract ingredients from each meal in the meal plan list
        ingredients = []
        for meal in meal_plan_data:  # meal_plan_data is a list of meal dictionaries
            if "ingredients" in meal and isinstance(meal["ingredients"], list):
                ingredients.extend(meal["ingredients"])

        if not ingredients:
            raise HTTPException(status_code=400, detail="No ingredients extracted from the meal plan.")

        # Create new shopping list
        result = await create_shopping_list(ingredients, request.list_name)

        ingredient_names = [ingredient["name"] for ingredient in ingredients]  # ✅ Extract only names for shopping list

        return {
            "status": "success",
            "message": "Shopping list created",
            "shopping_list": {
                "list_id": result.list_id,
                "url": result.url,
                "items": ingredient_names  # ✅ Send only names to Instacart
            }
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

    ingredient_counts = Counter([ingredient["name"] for ingredient in ingredients if isinstance(ingredient, dict) and "name" in ingredient])
    
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