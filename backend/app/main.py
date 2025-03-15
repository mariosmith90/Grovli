from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.meals import router as meal_plan_router
from app.api.list import router as shopping_list_router
from app.api.chat import router as chatbot_router
from app.api.user_recipes import router as user_recipes_router
from app.api.user_plans import router as user_plans_router
from app.api.user_settings import user_settings_router
from app.api.user_profile import user_profile_router

import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the routers
app.include_router(meal_plan_router)
app.include_router(shopping_list_router)
app.include_router(user_recipes_router, prefix="/api")
app.include_router(user_plans_router, prefix="/api")
app.include_router(chatbot_router)
app.include_router(user_settings_router)
app.include_router(user_profile_router)

@app.get("/")
def root():
    return {"message": "Meal Plan API is running"}