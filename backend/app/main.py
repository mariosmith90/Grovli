from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.meals import router as meal_plan_router
from app.api.list import router as shopping_list_router
from app.api.recipes import router as user_recipes_router

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the router
app.include_router(meal_plan_router)
app.include_router(shopping_list_router)
app.include_router(user_recipes_router, prefix="/api")

@app.get("/")
def root():
    return {"message": "Meal Plan API is running"}