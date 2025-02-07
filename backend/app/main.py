from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.meal_plan import router as meal_plan_router

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

@app.get("/")
def root():
    return {"message": "Meal Plan API is running"}