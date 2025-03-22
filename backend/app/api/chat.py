from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
import os
import logging
import google.generativeai as genai
import datetime, asyncio
from typing import List, Optional, Dict, Any
from pymongo import MongoClient
from app.utils.tasks import generate_chat_response

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])

# Connect to MongoDB for chat history
client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client["grovli"]
chat_collection = db["chat_sessions"]

class Message(BaseModel):
    role: str
    content: str
    timestamp: Optional[datetime.datetime] = None
    is_notification: Optional[bool] = False
    meal_plan_id: Optional[str] = None

class ChatRequest(BaseModel):
    user_id: str
    user_name: Optional[str] = None
    message: str
    dietary_preferences: Optional[str] = None
    meal_type: Optional[str] = None
    session_id: Optional[str] = None

class NotificationRequest(BaseModel):
    session_id: str
    user_id: str
    meal_plan_id: Optional[str] = None

class ChatSessionResponse(BaseModel):
    session_id: str
    messages: List[Message]
    meal_plan_ready: Optional[bool] = False
    meal_plan_id: Optional[str] = None

@router.post("/start_session")
async def start_chat_session(request: ChatRequest):
    """
    Start a new chat session with Gemini.
    This is called when the user clicks 'Generate Free Plan' to engage them while waiting.
    """
    # Get API key from environment variables
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY environment variable is not set"
        )
    
    # Initialize Gemini API with the key
    genai.configure(api_key=gemini_api_key)
    
    try:
        # Generate a session ID if not provided
        session_id = request.session_id or f"chat_{request.user_id}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        first_name = request.user_name.split()[0] if request.user_name else "there"

        initial_context = f"""
        Hey {first_name}!

        While your meal plan generates, I'm here to chat. Feel free to ask me any nutrition questions while your plan is being prepared.
        """
        
        # Store the conversation in MongoDB
        current_time = datetime.datetime.now()
        chat_session = {
            "session_id": session_id,
            "user_id": request.user_id,
            "created_at": current_time,
            "updated_at": current_time,
            "dietary_preferences": request.dietary_preferences,
            "meal_type": request.meal_type,
            "meal_plan_ready": False,
            "meal_plan_processing": True,  # Flag to indicate plan is processing
            "messages": [
                {
                    "role": "assistant", 
                    "content": initial_context.strip(),
                    "timestamp": current_time,
                    "is_notification": False
                }
            ]
        }
        
        # Save to database
        await chat_collection.insert_one(chat_session)
        
        # Return the initial response
        return {
            "session_id": session_id,
            "messages": [
                {
                    "role": "assistant",
                    "content": initial_context.strip(),
                    "timestamp": current_time,
                    "is_notification": False
                }
            ],
            "meal_plan_ready": False,
            "meal_plan_processing": True
        }
        
    except Exception as e:
        logger.error(f"Error starting chat session: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start chat session: {str(e)}"
        )

@router.post("/send_message")
async def send_message(request: ChatRequest):
    if not request.session_id:
        raise HTTPException(
            status_code=400,
            detail="session_id is required"
        )
    
    try:
        # Look up existing chat session
        chat_session = await _get_chat_session(request.session_id)
        if not chat_session:
            raise HTTPException(
                status_code=404,
                detail=f"Chat session not found: {request.session_id}"
            )
        
        # Add user message to history
        current_time = datetime.datetime.now()
        user_message = {
            "role": "user",
            "content": request.message,
            "timestamp": current_time,
            "is_notification": False
        }
        
        # Update chat session with user message
        await update_chat_messages(request.session_id, user_message, store_immediately=False)  

        # Get existing messages
        existing_messages = chat_session.get("messages", []) + [user_message]
        
        generate_chat_response.delay(
            request.session_id, 
            request.dietary_preferences, 
            request.meal_type,
            existing_messages
        )
        
        return {
            "session_id": request.session_id,
            "messages": [user_message],
            "status": "processing"
        }
        
    except Exception as e:
        logger.error(f"Error in chat session {request.session_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process message: {str(e)}"
        )

async def _get_chat_session(session_id: str):
    return await chat_collection.find_one({"session_id": session_id})

async def update_chat_messages(session_id: str, message: dict, store_immediately=True):
    """Updates chat session messages in MongoDB."""
    try:
        update_data = {"$set": {"updated_at": datetime.datetime.now()}}
        
        # Only store messages immediately if specified
        if store_immediately:
            update_data["$push"] = {"messages": message}
        
        await chat_collection.update_one(
            {"session_id": session_id}, update_data
        )
    except Exception as e:
        logger.error(f"MongoDB update error for session {session_id}: {str(e)}")

async def store_error_message(session_id: str, error_text: str):
    error_message = {
        "role": "assistant",
        "content": error_text,
        "timestamp": datetime.datetime.now(),
        "is_notification": False,
        "error": True
    }
    
    try:
        await chat_collection.update_one(
            {"session_id": session_id},
            {
                "$push": {"messages": error_message},
                "$set": {"updated_at": datetime.datetime.now()}
            }
        )
    except Exception as e:
        logger.error(f"Error storing error message: {str(e)}")

@router.post("/notify_meal_plan_ready")
async def notify_meal_plan_ready(request: NotificationRequest):
    """
    Sends a notification to the user that their meal plan is ready.
    This is called by the meal plan generation service when a plan is complete.
    """
    if not request.session_id:
        raise HTTPException(
            status_code=400,
            detail="session_id is required"
        )
    
    try:
        # Look up existing chat session
        chat_session = await _get_chat_session(request.session_id)
        if not chat_session:
            raise HTTPException(
                status_code=404,
                detail=f"Chat session not found: {request.session_id}"
            )
        
        # Get existing messages
        existing_messages = chat_session.get("messages", [])
        
        # Check if notification has already been sent
        for msg in existing_messages:
            if (msg.get("is_notification") and 
                msg.get("meal_plan_id") == request.meal_plan_id and
                "meal plan is now ready" in msg.get("content", "")):
                
                # Return existing notification
                return {
                    "session_id": request.session_id,
                    "message": msg,
                    "meal_plan_ready": True,
                    "meal_plan_id": request.meal_plan_id,
                    "status": "already_notified"
                }
        
        # Create notification message
        current_time = datetime.datetime.now()
        notification_message = {
            "role": "assistant",
            "content": "Great news! Your meal plan is now ready. You can view it by clicking the 'View Meal Plan' button.",
            "timestamp": current_time,
            "meal_plan_id": request.meal_plan_id,
            "is_notification": True
        }
        
        # Add to conversation history
        existing_messages.append(notification_message)
        
        # Update the chat session in MongoDB
        await chat_collection.update_one(
            {"session_id": request.session_id},
            {
                "$set": {
                    "messages": existing_messages,
                    "updated_at": current_time,
                    "meal_plan_ready": True,
                    "meal_plan_id": request.meal_plan_id,
                    "meal_plan_processing": False
                }
            }
        )
        
        # Return the notification message
        return {
            "session_id": request.session_id,
            "message": notification_message,
            "meal_plan_ready": True,
            "meal_plan_id": request.meal_plan_id,
            "status": "success"
        }
        
    except Exception as e:
        logger.error(f"Error sending meal plan notification: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send meal plan notification: {str(e)}"
        )



@router.get("/get_session/{session_id}")
async def get_chat_session(session_id: str):
    """
    Retrieve a specific chat session by its ID.
    Also handles notification recovery by checking if a meal plan is ready but no notification is present.
    """
    try:
        # Look up the chat session in MongoDB
        chat_session = await chat_collection.find_one({"session_id": session_id})
        
        if not chat_session:
            raise HTTPException(
                status_code=404,
                detail=f"Chat session not found: {session_id}"
            )
        
        # Check if we need to recover a missing notification
        if chat_session.get("meal_plan_ready") and chat_session.get("meal_plan_id"):
            meal_plan_id = chat_session.get("meal_plan_id")
            
            # Check if notification message exists
            has_notification = False
            for msg in chat_session.get("messages", []):
                if msg.get("is_notification") and msg.get("meal_plan_id") == meal_plan_id:
                    has_notification = True
                    break
            
            # If meal plan is ready but no notification message, add one
            if not has_notification:
                logger.info(f"Missing notification detected for ready meal plan {meal_plan_id}, adding it now")
                
                # Create notification message
                current_time = datetime.datetime.now()
                notification_message = {
                    "role": "assistant",
                    "content": "Great news! Your meal plan is now ready. You can view it by clicking the 'View Meal Plan' button.",
                    "timestamp": current_time,
                    "meal_plan_id": meal_plan_id,
                    "is_notification": True,
                    "notification_id": f"recovery_{meal_plan_id}_{current_time.timestamp()}"
                }
                
                # Add notification to messages
                chat_session["messages"].append(notification_message)
                
                # Save changes to MongoDB (async)
                await chat_collection.update_one(
                    {"session_id": session_id},
                    {
                        "$push": {"messages": notification_message},
                        "$set": {f"notification_sent_for.{meal_plan_id}": True}
                    }
                )
                
                logger.info(f"Added recovery notification for meal plan {meal_plan_id}")
        
        # Convert MongoDB document to a format suitable for API response
        return {
            "session_id": chat_session["session_id"],
            "messages": chat_session.get("messages", []),
            "meal_plan_ready": chat_session.get("meal_plan_ready", False),
            "meal_plan_id": chat_session.get("meal_plan_id")
        }
        
    except Exception as e:
        logger.error(f"Error retrieving chat session: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve chat session: {str(e)}"
        )
