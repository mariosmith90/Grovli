from fastapi import APIRouter, Depends, HTTPException, status, Request
from pymongo import MongoClient
from typing import List
from pydantic import BaseModel
import datetime, os, requests, uuid
import hashlib
from jose import jwt, JWTError
from app.utils.redis_client import get_cache, set_cache, delete_cache, PROFILE_CACHE_TTL, AUTH_CACHE_TTL

router = APIRouter(prefix="/user-recipes", tags=["User Recipes"])

# Auth0 Configuration - Make sure these are set in your environment variables
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "dev-rw8ff6vxgb7t0i4c.us.auth0.com").replace("https://", "").replace("http://", "")
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
    imageUrl: str = None  # Standardized field

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
    
    # Check Redis cache first for user
    cache_key = f"user:{auth0_id}"
    cached_user = get_cache(cache_key)
    if cached_user:
        return cached_user
    
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
    
    # Clean user object for caching
    if "_id" in user:
        user_clean = {k: v for k, v in user.items() if k != "_id"}
    else:
        user_clean = user
    
    # Cache the user
    set_cache(cache_key, user_clean, PROFILE_CACHE_TTL)
    
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
    
    # Safely extract user ID
    user_id = current_user.get('id') or current_user.get('auth0_id')
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID not found in user data"
        )
    
    # Create a meal plan to group these recipes
    plan_id = str(uuid.uuid4())
    plan_name = request.plan_name or f"Meal Plan - {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    # Process recipes
    saved_recipes = []
    for recipe in request.recipes:
        recipe_id = recipe.get("id")
        
        # Check Redis cache for meal details
        if recipe_id:
            meal_cache_key = f"meal:{recipe_id}"
            cached_meal = get_cache(meal_cache_key)
            
            if cached_meal:
                mongo_recipe = cached_meal
            else:
                mongo_recipe = meals_collection.find_one({"meal_id": recipe_id})
                if mongo_recipe:
                    # Clean and cache the meal WITH imageUrl
                    mongo_recipe_clean = {k: v for k, v in mongo_recipe.items() if k != "_id"}
                    set_cache(meal_cache_key, mongo_recipe_clean, PROFILE_CACHE_TTL)
        else:
            mongo_recipe = None
        
        # Get meal_type from sources with fallbacks
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
            "meal_type": meal_type,
            "nutrition": mongo_recipe.get("macros") if mongo_recipe else recipe.get("nutrition", {}),
            "ingredients": mongo_recipe.get("ingredients") if mongo_recipe else recipe.get("ingredients", []),
            "instructions": mongo_recipe.get("meal_text") if mongo_recipe else recipe.get("instructions", ""),
            "imageUrl": mongo_recipe.get("imageUrl") if mongo_recipe else recipe.get("imageUrl", "")  # Standardized field
        }
        saved_recipes.append(saved_recipe)
    
    # Create the meal plan document
    meal_plan = {
        "id": plan_id,
        "user_id": user_id,
        "name": plan_name,
        "created_at": datetime.datetime.now(),
        "recipes": saved_recipes
    }
    
    # Save to database
    saved_meal_plans_collection.insert_one(meal_plan)
    
    # Invalidate user's saved recipes cache
    user_saved_recipes_key = f"user_saved_recipes:{user_id}"
    delete_cache(user_saved_recipes_key)
    
    # Return the created plan
    response_data = {
        "id": meal_plan["id"],
        "user_id": meal_plan["user_id"],
        "name": meal_plan["name"],
        "created_at": meal_plan["created_at"].isoformat(),
        "recipes": [
            {
                "id": recipe["id"],
                "title": recipe["title"],
                "meal_type": recipe["meal_type"],
                "nutrition": recipe["nutrition"],
                "ingredients": recipe["ingredients"],
                "instructions": recipe["instructions"],
                "imageUrl": recipe.get("imageUrl")  # Standardized field
            }
            for recipe in saved_recipes
        ]
    }
    
    # Cache this new plan (including imageUrl)
    cache_data = response_data.copy()
    set_cache(f"saved_plan:{plan_id}", cache_data, PROFILE_CACHE_TTL)
    
    return response_data

@router.get("/saved-recipes/")
async def get_saved_recipes(
    skip: int = 0, 
    limit: int = 100, 
    current_user: dict = Depends(get_auth0_user)
):
    """Get all saved meal plans for the current user"""
    # Safely extract user ID
    user_id = current_user.get('id') or current_user.get('auth0_id')
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID not found in user data"
        )
    
    # Check Redis cache first
    cache_key = f"user_saved_recipes:{user_id}:{skip}:{limit}"
    cached_plans = get_cache(cache_key)
    
    if cached_plans:
        # ✅ Return cached data directly
        return cached_plans
    
    # If not in cache, query MongoDB
    cursor = saved_meal_plans_collection.find(
        {"user_id": user_id}
    ).sort("created_at", -1).skip(skip).limit(limit)
    
    meal_plans = []
    for doc in cursor:
        # Convert ObjectId to string to make it JSON serializable
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        
        doc["created_at"] = doc["created_at"].isoformat()
        meal_plans.append(doc)
    
    # Cache the results (including imageUrl)
    cache_meal_plans = []
    for plan in meal_plans:
        cache_plan = plan.copy()
        cache_meal_plans.append(cache_plan)
    set_cache(cache_key, cache_meal_plans, PROFILE_CACHE_TTL)
    
    return meal_plans

@router.get("/saved-recipes/{plan_id}")
async def get_saved_meal_plan(plan_id: str, current_user: dict = Depends(get_auth0_user)):
    """Get a specific saved meal plan by ID"""
    # Safely extract user ID
    user_id = current_user.get('id') or current_user.get('auth0_id')
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID not found in user data"
        )
    
    # Check Redis cache first
    cache_key = f"saved_plan:{plan_id}"
    cached_plan = get_cache(cache_key)
    
    if cached_plan:
        if cached_plan.get("user_id") == user_id:
            # ✅ Return cached data directly
            return cached_plan
            
    # If not in cache or not owned by this user, query MongoDB
    meal_plan = saved_meal_plans_collection.find_one({
        "id": plan_id,
        "user_id": user_id
    })
    
    if not meal_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )
    
    # Format the response
    if "_id" in meal_plan:
        meal_plan = {k: v for k, v in meal_plan.items() if k != "_id"}
    
    meal_plan["created_at"] = meal_plan["created_at"].isoformat()
    
    # Cache the result (including imageUrl)
    cache_plan = meal_plan.copy()
    set_cache(cache_key, cache_plan, PROFILE_CACHE_TTL)
    
    return meal_plan

@router.delete("/saved-recipes/{plan_id}")
async def delete_saved_meal_plan(
    plan_id: str, 
    current_user: dict = Depends(get_auth0_user)
):
    """Delete a saved meal plan"""
    # Safely extract user ID
    user_id = current_user.get('id') or current_user.get('auth0_id')
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID not found in user data"
        )
    
    result = saved_meal_plans_collection.delete_one({
        "id": plan_id,
        "user_id": user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )
    
    # Invalidate caches
    delete_cache(f"saved_plan:{plan_id}")
    delete_cache(f"user_saved_recipes:{user_id}*")  
    
    return {"message": "Meal plan deleted successfully"}

async def get_current_user_from_auth0(request: Request):
    """Validate the Auth0 JWT token and return the user info with Redis caching"""
    try:
        # Extract token from Authorization header
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        if not token:
            print("Missing authorization token")
            raise HTTPException(status_code=401, detail="Missing authorization token")

        # Create a cache key based on the token hash (don't store the raw token)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        cache_key = f"auth0_token:{token_hash}"
        
        # Check Redis cache first
        cached_payload = get_cache(cache_key)
        if cached_payload:
            print(f"Using cached token validation for sub: {cached_payload.get('sub', 'unknown')}")
            return cached_payload

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
        
        # Check Redis for JWKS cache
        jwks_cache_key = f"auth0_jwks:{AUTH0_DOMAIN}"
        cached_jwks = get_cache(jwks_cache_key)
        
        if cached_jwks:
            print(f"Using cached JWKS from Redis")
            jwks_cache = cached_jwks
        elif jwks_cache is None or current_time - jwks_last_fetched > 3600:  # Cache for 1 hour
            try:
                print(f"Fetching JWKS from {JWKS_URL}")
                jwks_response = requests.get(JWKS_URL, timeout=10)
                jwks_response.raise_for_status()
                jwks_cache = jwks_response.json()
                jwks_last_fetched = current_time
                
                # Cache JWKS in Redis for 24 hours
                set_cache(jwks_cache_key, jwks_cache, 86400)  # 24 hours
                print("JWKS fetched successfully and cached in Redis")
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
            
            # Cache the validated payload in Redis
            # Use a shorter TTL than the actual token to ensure we refresh before expiry
            set_cache(cache_key, payload, AUTH_CACHE_TTL)
            
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

@router.get("/is-saved/{recipe_id}")
async def is_recipe_saved(
    recipe_id: str,
    current_user: dict = Depends(get_auth0_user)
):
    """Check if a specific recipe is saved by the user"""
    try:
        # Safely extract user ID
        user_id = current_user.get('id') or current_user.get('auth0_id')
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID not found in user data"
            )
        
        # Check Redis cache first
        cache_key = f"is_saved:{user_id}:{recipe_id}"
        cached_result = get_cache(cache_key)
        
        if cached_result is not None:  # Check explicitly against None since False is a valid result
            return {"isSaved": cached_result}
        
        # If not in cache, find all saved meal plans for this user
        saved_plans = saved_meal_plans_collection.find({"user_id": user_id})
        
        # Check if the recipe exists in any plan
        for plan in saved_plans:
            if "recipes" in plan:
                for recipe in plan["recipes"]:
                    if recipe.get("recipe_id") == recipe_id or recipe.get("id") == recipe_id:
                        # Cache the positive result
                        set_cache(cache_key, True, PROFILE_CACHE_TTL)
                        return {"isSaved": True}
        
        # If we've gone through all plans and not found it
        # Cache the negative result
        set_cache(cache_key, False, PROFILE_CACHE_TTL)
        return {"isSaved": False}
    
    except Exception as e:
        print(f"Error checking saved status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check saved status: {str(e)}"
        )