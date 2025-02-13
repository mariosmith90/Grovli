from typing import List, Dict
import requests
import os
import openai
from fastapi import HTTPException
from pydantic import BaseModel

INSTACART_API_URL = "https://connect.dev.instacart.tools/idp/v1/products/products_link"

class ShoppingListResponse(BaseModel):
    list_id: str
    url: str
    items: List[Dict]

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OpenAI API key not configured")

client = openai.OpenAI(api_key=api_key)

def clean_ingredient_name(ingredient: str) -> str:
    """
    Uses OpenAI GPT to intelligently remove macros and units from ingredient names.
    Returns only the essential product name.
    """
    prompt = f"""
    Remove any numbers, macro details (calories, carbs, protein, fat, fiber, sugar), 
    and measurement units (cup, tbsp, tsp, oz, grams, ml, lb) from the following ingredient 
    while keeping the essential product name intact:
    
    "{ingredient}"
    
    Return only the cleaned product name.
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )
        cleaned_name = response.choices[0].message.content.strip()
        return cleaned_name

    except Exception as e:
        print(f"Error calling OpenAI API: {str(e)}")
        return ingredient 
    
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
    payload = {
        "title": name,
        "line_items": [{"name": ing, "quantity": 1} for ing in cleaned_ingredients]
    }

    try:
        response = requests.post(
            INSTACART_API_URL,
            headers=headers,
            json=payload
        )
        response.raise_for_status()

        print("Full Instacart Response:", response.text)

        data = response.json()

        products_link_url = data.get("products_link_url")
        
        if not products_link_url:
            raise HTTPException(status_code=500, detail="Missing 'products_link_url' in Instacart response")

        return ShoppingListResponse(
            list_id="dev-list", 
            url=products_link_url,
            items=[{"name": ing} for ing in cleaned_ingredients] 
        )

    except requests.exceptions.RequestException as e:
        error_detail = f"Instacart API connection error: {str(e)}"
        raise HTTPException(status_code=500, detail=error_detail)

async def update_shopping_list(list_id: str, ingredients: List[str]) -> ShoppingListResponse:
    """
    Update an existing shopping list with new ingredients.
    Returns the updated shopping list details including the URL.
    """
    api_key = os.getenv("INSTACART_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Instacart API key not configured")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # Correct payload structure for update
    update_data = {
        "items": [{"text": ingredient} for ingredient in ingredients]
    }
    
    try:
        response = requests.patch(
            f"{INSTACART_API_URL}/{list_id}",
            headers=headers,
            json=update_data
        )
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        error_detail = f"Instacart API connection error: {str(e)}"
        raise HTTPException(status_code=500, detail=error_detail)
    
    data = response.json()
    
    if 'data' not in data:
        raise HTTPException(status_code=500, detail="Invalid response format from Instacart")
    
    list_data = data['data']
    return ShoppingListResponse(
        list_id=list_data["id"],
        url=list_data.get("url", "https://www.instacart.com"),
        items=list_data.get("items", [])
    )