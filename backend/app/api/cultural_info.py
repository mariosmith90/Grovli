from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Union
import os
import json
import google.generativeai as genai
import logging
from app.utils.redis_client import get_cache, set_cache
from google.api_core import exceptions as google_exceptions
from concurrent.futures import ThreadPoolExecutor
import asyncio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cultural-info", tags=["Cultural Info"])

# Thread pool for running synchronous Gemini calls
executor = ThreadPoolExecutor(max_workers=4)

class CulturalInfoResponse(BaseModel):
    cuisine: str
    description: str
    keyIngredients: List[str]
    nutritionalHighlights: Dict[str, str] = Field(None, alias="nutritionalProfile")
    healthBenefits: Union[str, List[str]]
    popularDishes: List[str]
    colorAccent: Optional[str] = None

CULTURAL_CACHE_TTL = 60 * 60 * 24 * 7  # 7 days
CULTURAL_KEY_PREFIX = "cultural:v2:"

def validate_gemini_response(response_text: str) -> Dict:
    """Helper function to validate and parse Gemini response"""
    try:
        # First try parsing directly
        data = json.loads(response_text)
        
        # Check if we got a list instead of a dictionary (happens sometimes with Gemini)
        if isinstance(data, list) and len(data) > 0:
            logger.warning(f"Received list instead of object, taking first item: {data}")
            # Take the first item if it's a list
            data = data[0] if isinstance(data[0], dict) else {"error": "Invalid response structure"}
            
        return data
    except json.JSONDecodeError:
        # If direct parsing fails, try extracting JSON from markdown
        try:
            # Handle cases where response might be markdown with JSON code block
            json_str = response_text.split('```json')[1].split('```')[0].strip()
            data = json.loads(json_str)
            
            # Also check here if we got a list
            if isinstance(data, list) and len(data) > 0:
                logger.warning(f"Received list instead of object in markdown, taking first item")
                data = data[0] if isinstance(data[0], dict) else {"error": "Invalid response structure"}
                
            return data
        except (IndexError, json.JSONDecodeError) as e:
            logger.error(f"Failed to extract JSON from response: {response_text}")
            raise ValueError("Invalid response format from AI service")
        
@router.get("/{cuisine}", response_model=CulturalInfoResponse)
async def get_cultural_info(cuisine: str):
    """
    Retrieves cultural and nutritional information about a specific cuisine.
    Returns either cached data or fresh data from Gemini API.
    """
    cuisine = cuisine.lower()
    logger.info(f"Fetching cultural info for {cuisine} cuisine")
    
    # Check Redis cache first with namespaced key
    cache_key = f"{CULTURAL_KEY_PREFIX}{cuisine}"
    cached_info = get_cache(cache_key)
    
    if cached_info:
        logger.info(f"✅ Found cached info for {cuisine}")
        return cached_info
    
    # Get fresh data from Gemini (async)
    try:
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            logger.error("Missing GEMINI_API_KEY environment variable")
            raise HTTPException(status_code=500, detail="Server configuration error")
            
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = f"""Create a visually appealing, modern overview of {cuisine} cuisine with these exact JSON keys:
        - cuisine: name of the cuisine (capitalized string)
        - description: 1 short, engaging sentence about the cuisine
        - keyIngredients: 5 iconic ingredients (array of strings, each 1-2 words)
        - nutritionalHighlights: 4 key nutritional facts (object with short values)
        - healthBenefits: 2-3 bullet points for health benefits (array of strings)
        - popularDishes: 4 most famous dishes (array of strings)
        - colorAccent: suitable HEX color code that represents this cuisine (e.g., "#E63946")

        Example format:
        {{
        "cuisine": "Mediterranean",
        "description": "Fresh, vibrant flavors from olive oil, herbs, and seafood.",
        "keyIngredients": ["Olive Oil", "Feta", "Tomatoes", "Fresh Herbs", "Seafood"],
        "nutritionalHighlights": {{
            "proteins": "Lean fish and legumes",
            "fats": "Heart-healthy olive oil",
            "carbs": "Whole grains",
            "vitamins": "Abundant in A, C, E"
        }},
        "healthBenefits": [
            "Supports heart health with antioxidants",
            "Promotes longevity through anti-inflammatory properties",
            "Maintains healthy weight with balanced nutrients"
        ],
        "popularDishes": ["Greek Salad", "Paella", "Hummus", "Ratatouille"],
        "colorAccent": "#3A86FF"
        }}"""
        
        # Run synchronous Gemini call in thread pool
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            executor,
            lambda: model.generate_content(
                prompt,
                generation_config={
                    "temperature": 0.3,
                    "max_output_tokens": 2000
                }
            )
        )
        
        # Log raw response for debugging
        logger.debug(f"Raw Gemini response: {response.text}")
        
        try:
            # Validate and parse response
            data = validate_gemini_response(response.text)
            
            # Convert to Pydantic model for validation
            validated_data = CulturalInfoResponse(**data)
            
            # Cache the validated data
            set_cache(cache_key, validated_data.dict(), ttl=CULTURAL_CACHE_TTL)            
            
            return validated_data
            
        except ValueError as e:
            logger.error(f"Response validation failed: {str(e)}")
            logger.error(f"Problematic response: {response.text}")
            raise HTTPException(
                status_code=502,
                detail=f"AI service returned invalid format: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Unexpected validation error: {str(e)}")
            raise HTTPException(
                status_code=502,
                detail="Failed to process AI service response"
            )
            
    except google_exceptions.GoogleAPIError as e:
        logger.error(f"Gemini API error: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail="AI service is currently unavailable"
        )
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )