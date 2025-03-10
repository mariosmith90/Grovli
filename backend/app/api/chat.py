from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import os
import logging
import google.generativeai as genai
import datetime
from typing import List, Optional, Dict, Any
from pymongo import MongoClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])

# Connect to MongoDB for chat history
client = MongoClient(os.getenv("MONGO_URI"))
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

        While your {request.dietary_preferences or 'customized'} {request.meal_type.lower() or 'meal'} plan generates, I'm here to chat. Is this eating style new for you?
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
        chat_collection.insert_one(chat_session)
        
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
            "meal_plan_ready": False
        }
        
    except Exception as e:
        logger.error(f"Error starting chat session: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start chat session: {str(e)}"
        )

@router.post("/send_message")
async def send_message(request: ChatRequest):
    """
    Send a message to the ongoing chat session and get a response from Gemini.
    """
    if not request.session_id:
        raise HTTPException(
            status_code=400,
            detail="session_id is required"
        )
    
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
        # Look up existing chat session
        chat_session = chat_collection.find_one({"session_id": request.session_id})
        if not chat_session:
            raise HTTPException(
                status_code=404,
                detail=f"Chat session not found: {request.session_id}"
            )
        
        # Get existing messages
        existing_messages = chat_session.get("messages", [])
        
        # Add user message to history
        current_time = datetime.datetime.now()
        user_message = {
            "role": "user",
            "content": request.message,
            "timestamp": current_time,
            "is_notification": False
        }
        existing_messages.append(user_message)
        
        # Create conversation history for Gemini
        conversation_history = []
        for msg in existing_messages:
            # Skip notification messages for Gemini conversation context
            if msg.get("is_notification", False):
                continue
                
            role = "user" if msg["role"] == "user" else "model"
            conversation_history.append({"role": role, "parts": [msg["content"]]})
            
        # Prepare nutrition context to guide Gemini responses
        nutrition_context = f"""
        You are a nutrition assistant chatting with a user while they wait for their meal plan to generate.
        The user has requested a {request.dietary_preferences or 'customized'} meal plan focusing on {request.meal_type or 'various meals'}.
        Keep your responses friendly, conversational, and focused on nutrition, cooking, and healthy eating habits.
        Provide personalized advice and engage the user in a helpful discussion about their food preferences and goals.
        
        When responding:
        - Be encouraging and supportive
        - Share practical tips they can immediately use
        - Ask follow-up questions to keep the conversation flowing
        - Keep responses concise (2-3 paragraphs maximum)
        """
        
        # Check if meal plan is ready and adjust context
        meal_plan_ready = chat_session.get("meal_plan_ready", False)
        if meal_plan_ready:
            nutrition_context += """
            The user's meal plan is now ready! You can reference this in your response and offer to discuss
            any aspects of their meal plan they might want to talk about.
            """
        
        # Set up the Gemini model with specific parameters for chat
        model = genai.GenerativeModel(
            "gemini-1.5-flash",
            generation_config={
                "temperature": 0.7,
                "top_p": 0.8,
                "top_k": 40,
                "max_output_tokens": 512,
            }
        )
        
        # Create a chat session
        chat = model.start_chat(history=conversation_history)
        
        # Generate response with context
        response = chat.send_message(
            nutrition_context + "\n\nRespond to the user's most recent message."
        )
        
        # Extract the assistant's response
        assistant_message = {
            "role": "assistant",
            "content": response.text,
            "timestamp": datetime.datetime.now(),
            "is_notification": False
        }
        
        # Add to conversation history
        existing_messages.append(assistant_message)
        
        # Update the chat session in MongoDB
        chat_collection.update_one(
            {"session_id": request.session_id},
            {
                "$set": {
                    "messages": existing_messages,
                    "updated_at": datetime.datetime.now()
                }
            }
        )
        
        # Get meal plan status for the response
        meal_plan_ready = chat_session.get("meal_plan_ready", False)
        meal_plan_id = chat_session.get("meal_plan_id", None)
        
        # Return the updated messages
        return {
            "session_id": request.session_id,
            "messages": [user_message, assistant_message],
            "meal_plan_ready": meal_plan_ready,
            "meal_plan_id": meal_plan_id
        }
        
    except Exception as e:
        logger.error(f"Error in chat session: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process message: {str(e)}"
        )

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
        chat_session = chat_collection.find_one({"session_id": request.session_id})
        if not chat_session:
            raise HTTPException(
                status_code=404,
                detail=f"Chat session not found: {request.session_id}"
            )
        
        # Get existing messages
        existing_messages = chat_session.get("messages", [])
        
        # Create notification message
        current_time = datetime.datetime.now()
        notification_message = {
            "role": "assistant",
            "content": "Great news! Your meal plan is now ready. You can view it by clicking the 'View Meal Plan' button. Let me know if you have any questions about your recipes or meal options!",
            "timestamp": current_time,
            "meal_plan_id": request.meal_plan_id,
            "is_notification": True
        }
        
        # Add to conversation history
        existing_messages.append(notification_message)
        
        # Update the chat session in MongoDB
        chat_collection.update_one(
            {"session_id": request.session_id},
            {
                "$set": {
                    "messages": existing_messages,
                    "updated_at": current_time,
                    "meal_plan_ready": True,
                    "meal_plan_id": request.meal_plan_id
                }
            }
        )
        
        # Return the notification message
        return {
            "session_id": request.session_id,
            "message": notification_message,
            "meal_plan_ready": True,
            "meal_plan_id": request.meal_plan_id
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
    Retrieve an existing chat session by ID.
    """
    try:
        chat_session = chat_collection.find_one({"session_id": session_id})
        if not chat_session:
            raise HTTPException(
                status_code=404,
                detail=f"Chat session not found: {session_id}"
            )
        
        # Return the chat history with meal plan status
        return {
            "session_id": session_id,
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