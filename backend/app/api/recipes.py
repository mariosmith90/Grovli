from fastapi import APIRouter, Depends, HTTPException, status, Request
from pymongo import MongoClient
from typing import List
from pydantic import BaseModel
import datetime, os, requests, uuid
from jose import jwt, JWTError

router = APIRouter(prefix="/user-recipes", tags=["User Recipes"])

# Auth0 Configuration - Make sure these are set in your environment variables
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "dev-rw8ff6vxgb7t0i4c.us.auth0.com")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE", "https://grovli.citigrove.com/audience")
JWKS_URL = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"

# Cache the JWKS to avoid fetching it for every request
jwks_cache = None
jwks_last_fetched = 0

# Get the database and collections
client = MongoClient(os.getenv("MONGO_URI"))
db = client["grovli"]
meals_collection = db["meals"]
user_collection = db["users"]
saved_meal_plans_collection = db["saved_meals"]

# --- Pydantic Models ---

class SaveRecipeRequest(BaseModel):
    recipes: List[dict]
    plan_name: str = None

class SavedRecipeResponse(BaseModel):
    id: str
    title: str
    meal_type: str = None
    nutrition: dict = None
    ingredients: List[dict] = None
    instructions: str = None 

class SavedMealPlanResponse(BaseModel):
    id: str
    user_id: str
    name: str
    created_at: str
    recipes: List[SavedRecipeResponse]

# --- Auth0 User Dependency ---

async def get_auth0_user(request: Request):
    """Get or create user from Auth0 token"""
    auth0_user = await get_current_user_from_auth0(request)
    
    if not auth0_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user ID from Auth0 sub claim
    auth0_id = auth0_user.get("sub")
    
    # Check if user exists in database
    user = user_collection.find_one({"auth0_id": auth0_id})
    
    # If user doesn't exist, create new user record
    if not user:
        email = auth0_user.get("email", "")
        username = auth0_user.get("nickname", "user")
        
        user = {
            "id": str(uuid.uuid4()),
            "auth0_id": auth0_id,
            "email": email,
            "username": username,
            "created_at": datetime.datetime.now()
        }
        user_collection.insert_one(user)
        user = user_collection.find_one({"auth0_id": auth0_id})
    
    return user

# --- API Endpoints ---

@router.post("/saved-recipes/")
async def save_recipes(request: SaveRecipeRequest, current_user: dict = Depends(get_auth0_user)):
    """Save selected recipes to user's saved recipes collection"""
    
    if not request.recipes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No recipes provided"
        )
    
    # Create a meal plan to group these recipes
    plan_id = str(uuid.uuid4())
    plan_name = request.plan_name or f"Meal Plan - {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    # Process recipes
    saved_recipes = []
    for recipe in request.recipes:
        recipe_id = recipe.get("id")
        
        # Check if we need to fetch additional details from meals collection
        mongo_recipe = None
        if recipe_id:
            mongo_recipe = meals_collection.find_one({"meal_id": recipe_id})
        
        # Get meal_type from sources with fallbacks
        # First try to get it from the mongo_recipe, then from the request, then default to "Unknown"
        meal_type = None
        if mongo_recipe:
            meal_type = mongo_recipe.get("meal_type")
        if not meal_type and "meal_type" in recipe:
            meal_type = recipe.get("meal_type")
        if not meal_type:
            meal_type = "Unknown"
                
        # Create saved recipe document
        saved_recipe = {
            "id": str(uuid.uuid4()),
            "recipe_id": recipe_id,
            "title": recipe.get("title") or (mongo_recipe.get("meal_name") if mongo_recipe else "Untitled Recipe"),
            "meal_type": meal_type, # Add the meal_type field
            # Use MongoDB data with fallback to request data
            "nutrition": mongo_recipe.get("macros") if mongo_recipe else recipe.get("nutrition", {}),
            "ingredients": mongo_recipe.get("ingredients") if mongo_recipe else recipe.get("ingredients", []),
            "instructions": mongo_recipe.get("meal_text") if mongo_recipe else recipe.get("instructions", ""),
        }
        saved_recipes.append(saved_recipe)
    
    # Create the meal plan document
    meal_plan = {
        "id": plan_id,
        "user_id": current_user["id"],
        "name": plan_name,
        "created_at": datetime.datetime.now(),
        "recipes": saved_recipes
    }
    
    # Save to database
    saved_meal_plans_collection.insert_one(meal_plan)
    
    # Return the created plan
    return {
        "id": meal_plan["id"],
        "user_id": meal_plan["user_id"],
        "name": meal_plan["name"],
        "created_at": meal_plan["created_at"].isoformat(),
        "recipes": saved_recipes
    }

@router.get("/saved-recipes/")
async def get_saved_recipes(
    skip: int = 0, 
    limit: int = 100, 
    current_user: dict = Depends(get_auth0_user)
):
    """Get all saved meal plans for the current user"""
    # Find all meal plans for this user
    cursor = saved_meal_plans_collection.find(
        {"user_id": current_user["id"]}
    ).sort("created_at", -1).skip(skip).limit(limit)
    
    meal_plans = []
    for doc in cursor:
        doc["created_at"] = doc["created_at"].isoformat()
        meal_plans.append(doc)
    
    return meal_plans

@router.get("/saved-recipes/{plan_id}")
async def get_saved_meal_plan(
    plan_id: str, 
    current_user: dict = Depends(get_auth0_user)
):
    """Get a specific saved meal plan by ID"""
    meal_plan = saved_meal_plans_collection.find_one({
        "id": plan_id,
        "user_id": current_user["id"]
    })
    
    if not meal_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )
    
    meal_plan["created_at"] = meal_plan["created_at"].isoformat()
    return meal_plan

@router.delete("/saved-recipes/{plan_id}")
async def delete_saved_meal_plan(
    plan_id: str, 
    current_user: dict = Depends(get_auth0_user)
):
    """Delete a saved meal plan"""
    result = saved_meal_plans_collection.delete_one({
        "id": plan_id,
        "user_id": current_user["id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )
    
    return {"message": "Meal plan deleted successfully"}

async def get_current_user_from_auth0(request: Request):
    """Validate the Auth0 JWT token and return the user info"""
    try:
        # Extract token from Authorization header
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        if not token:
            print("Missing authorization token")
            raise HTTPException(status_code=401, detail="Missing authorization token")

        # Get token header to find kid (key ID)
        try:
            header = jwt.get_unverified_header(token)
        except JWTError as e:
            print(f"Invalid token header: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid token format")
        
        if "kid" not in header:
            print("Token missing kid")
            raise HTTPException(status_code=401, detail="Token missing kid")

        # Fetch JWKS (JSON Web Key Set) if not cached or cache is old
        global jwks_cache, jwks_last_fetched
        current_time = datetime.datetime.now().timestamp()
        
        if jwks_cache is None or current_time - jwks_last_fetched > 3600:  # Cache for 1 hour
            try:
                print(f"Fetching JWKS from {JWKS_URL}")
                jwks_response = requests.get(JWKS_URL, timeout=10)
                jwks_response.raise_for_status()
                jwks_cache = jwks_response.json()
                jwks_last_fetched = current_time
                print("JWKS fetched successfully")
            except Exception as e:
                print(f"Error fetching JWKS: {str(e)}")
                raise HTTPException(status_code=500, detail="Failed to fetch JWKS")
        
        # Find the key matching the kid in the token header
        rsa_key = None
        for key in jwks_cache.get("keys", []):
            if key["kid"] == header["kid"]:
                rsa_key = key
                break
        
        if not rsa_key:
            print(f"No matching key found for kid: {header['kid']}")
            raise HTTPException(status_code=401, detail="No matching key found")
            
        # Verify the token
        try:
            # Decode and verify the token
            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=["RS256"],
                audience=AUTH0_AUDIENCE,
                issuer=f"https://{AUTH0_DOMAIN}/"
            )
            print(f"Token validated successfully for sub: {payload.get('sub', 'unknown')}")
            return payload
            
        except jwt.ExpiredSignatureError:
            print("Token expired")
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.JWTClaimsError as e:
            print(f"Invalid claims: {str(e)}")
            raise HTTPException(status_code=401, detail=f"Invalid claims: {str(e)}")
        except JWTError as e:
            print(f"JWT validation error: {str(e)}")
            raise HTTPException(status_code=401, detail=str(e))
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"Unexpected auth error: {str(e)}")
        # Convert unexpected errors to 401 responses
        raise HTTPException(status_code=401, detail=f"Authentication error: {str(e)}")