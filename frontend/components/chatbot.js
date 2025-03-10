"use client";

import { useState, useEffect, useRef } from 'react';

const ChatbotWindow = ({ 
  user, 
  preferences, 
  mealType, 
  isVisible, 
  onClose, 
  onChatComplete,
  mealPlanReady // Add this prop to know when meal plan is ready
}) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const chatEndRef = useRef(null);
  const [hasMealPlanNotification, setHasMealPlanNotification] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [isProcessingUpdate, setIsProcessingUpdate] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState(new Set());
  const latestNotificationRef = useRef(null);
  
  // States for typing animation
  const [typingMessage, setTypingMessage] = useState(null);
  const [typingIndex, setTypingIndex] = useState(0);
  const [typingInterval, setTypingIntervalId] = useState(null);

  // Start chat session when component mounts
  useEffect(() => {
    if (isVisible && !sessionId) {
      startChatSession();
    }
    
    // Cleanup typing animation interval on unmount
    return () => {
      if (typingInterval) {
        clearInterval(typingInterval);
      }
    };
  }, [isVisible, sessionId]);

  // When mealPlanReady becomes true, fetch the latest chat session once
  useEffect(() => {
    // Only fetch once when the meal plan becomes ready and we don't already have a notification
    if (mealPlanReady && sessionId && !hasMealPlanNotification && !isProcessingUpdate) {
      console.log("Meal plan is ready, fetching latest chat session once");
      fetchChatSession();
    }
  }, [mealPlanReady, sessionId, hasMealPlanNotification, isProcessingUpdate]);

  // Set up polling for chat updates
  useEffect(() => {
    if (!sessionId || !isVisible || hasMealPlanNotification) return;

    // Only poll if we don't already have a notification
    const interval = setInterval(() => {
      if (!isProcessingUpdate) {
        fetchChatSession();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, isVisible, hasMealPlanNotification, isProcessingUpdate]);

  // Fetch the current chat session with all messages
  const fetchChatSession = async () => {
    // Prevent concurrent fetches
    if (isProcessingUpdate) {
      return;
    }
    
    try {
      setIsProcessingUpdate(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/chatbot/get_session/${sessionId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      // First handle normal messages (non-notifications)
      const regularMessages = data.messages.filter(m => !m.is_notification);
      const existingMsgTimestamps = new Set(messages.map(m => m.timestamp?.toString()));
      
      // Add only new regular messages
      const newRegularMessages = regularMessages.filter(m => 
        !m.timestamp || !existingMsgTimestamps.has(m.timestamp?.toString())
      );
      
      if (newRegularMessages.length > 0) {
        setMessages(prev => [...prev, ...newRegularMessages]);
      }
      
      // Now handle notifications separately
      const notifications = data.messages.filter(m => 
        m.is_notification === true && 
        !seenNotificationIds.has(m.timestamp?.toString())
      );
      
      if (notifications.length > 0) {
        // Get the latest notification
        const latestNotification = notifications[notifications.length - 1];
        
        // Store it in the ref to prevent race conditions
        latestNotificationRef.current = latestNotification;
        
        // Mark all of these notifications as seen so we don't process them again
        const updatedSeen = new Set(seenNotificationIds);
        notifications.forEach(n => updatedSeen.add(n.timestamp?.toString()));
        setSeenNotificationIds(updatedSeen);
        
        // Only show the notification if we haven't already shown one
        if (!hasMealPlanNotification) {
          setHasMealPlanNotification(true);
          
          // Add the notification with animation
          if (latestNotification.content) {
            startTypingAnimation(latestNotification.content, true);
          }
        }
      }
      
      // Update last fetch time
      setLastFetchTime(Date.now());
    } catch (error) {
      console.error('Error fetching chat session:', error);
    } finally {
      setIsProcessingUpdate(false);
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, typingMessage]);

  // Start a new chat session
  const startChatSession = async () => {
    try {
      setIsLoading(true);
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/chatbot/start_session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user?.sub || 'anonymous',
          user_name: user?.name || user?.nickname || null,
          message: 'Hello',
          dietary_preferences: preferences,
          meal_type: mealType
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      setSessionId(data.session_id);
      setLastFetchTime(Date.now());
      
      // Use typing animation for the first message
      if (data.messages && data.messages.length > 0) {
        startTypingAnimation(data.messages[0].content);
      }
    } catch (error) {
      console.error('Error starting chat session:', error);
      // Add a fallback message if API call fails
      setMessages([{
        role: 'assistant',
        content: "I'm getting your meal plan ready. This should only take a minute!"
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle sending a message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    
    if (!input.trim() || !sessionId || isLoading) return;
    
    // Add user message to the chat
    const userMessage = {
      role: 'user',
      content: input.trim()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Store input and clear the field
    const messageText = input.trim();
    setInput('');
    setIsLoading(true);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/chatbot/send_message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user?.sub || 'anonymous',
          session_id: sessionId,
          message: messageText,
          dietary_preferences: preferences,
          meal_type: mealType
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update last fetch time
      setLastFetchTime(Date.now());
      
      // Add assistant's response with typing animation
      if (data.messages && data.messages.length >= 2) {
        startTypingAnimation(data.messages[1].content);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Add a fallback message if API call fails
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: "I'm having trouble connecting to the server. Let's focus on your meal plan that's being prepared."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Typing animation effect
  const startTypingAnimation = (content, isNotification = false) => {
    // Clear any existing typing animation
    if (typingInterval) {
      clearInterval(typingInterval);
    }
    
    setTypingMessage({
      role: 'assistant',
      content: '',
      is_notification: isNotification
    });
    
    setTypingIndex(0);
    
    // Set up typing animation interval
    const intervalId = setInterval(() => {
      setTypingIndex(prevIndex => {
        const nextIndex = prevIndex + 1;
        
        if (nextIndex > content.length) {
          clearInterval(intervalId);
          setTypingMessage(null);
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content,
            is_notification: isNotification,
            timestamp: Date.now().toString() // Add a timestamp to help with deduplication
          }]);
          return 0;
        }
        
        setTypingMessage({
          role: 'assistant',
          content: content.substring(0, nextIndex),
          is_notification: isNotification
        });
        
        return nextIndex;
      });
    }, 15); // Speed of typing
    
    setTypingIntervalId(intervalId);
  };

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Format message with paragraphs and links
  const formatMessage = (text) => {
    // Split by newlines and create paragraphs
    const paragraphs = text.split('\n').filter(p => p.trim() !== '');
    
    return paragraphs.map((paragraph, index) => (
      <p key={index} className="mb-2">
        {paragraph}
      </p>
    ));
  };
  
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-4xl px-4">
      <div className="bg-white rounded-t-xl shadow-2xl w-full h-[400px] flex flex-col">
        {/* Chat header */}
        <div className="bg-teal-600 text-white p-3 rounded-t-xl flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-teal-700 flex items-center justify-center mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.5-4.5 10-10 10S2 17.5 2 12a10 10 0 0 1 10-10Z"/>
                <path d="M8 9h8"/>
                <path d="M8 15h5"/>
                <path d="M16 15h.01"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Grovli Assistant</h2>
          </div>
          <div className="flex items-center">
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-teal-700 rounded-full text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18"/>
                <path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {messages.map((message, index) => (
            <div 
              key={index} 
              className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                  message.role === 'user' 
                    ? 'bg-teal-600 text-white rounded-tr-none' 
                    : message.is_notification
                      ? 'bg-orange-100 border-2 border-orange-500 text-gray-800 rounded-tl-none'
                      : 'bg-white text-gray-800 shadow-md rounded-tl-none'
                }`}
              >
                {message.is_notification && (
                  <div className="flex items-center mb-2 text-orange-600">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span className="font-semibold">Notification</span>
                  </div>
                )}
                {formatMessage(message.content)}
                {message.is_notification && (
                  <div className="mt-3">
                    <button
                      onClick={onChatComplete}
                      className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      View Meal Plan
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {/* Typing animation */}
          {typingMessage && (
            <div className="mb-4 flex justify-start">
              <div className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                typingMessage.is_notification 
                ? 'bg-orange-100 border-2 border-orange-500 text-gray-800 rounded-tl-none' 
                : 'bg-white text-gray-800 shadow-md rounded-tl-none'
              }`}>
                {typingMessage.is_notification && (
                  <div className="flex items-center mb-2 text-orange-600">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span className="font-semibold">Notification</span>
                  </div>
                )}
                {formatMessage(typingMessage.content)}
                <span className="inline-block w-2 h-4 bg-gray-500 ml-1 animate-pulse"></span>
              </div>
            </div>
          )}
          
          {/* Loading indicator */}
          {isLoading && !typingMessage && (
            <div className="flex justify-center my-2">
              <div className="flex space-x-2">
                <div className="w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0s' }}></div>
                <div className="w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>
        
        {/* Chat input */}
        <div className="p-3 border-t border-gray-200 bg-white">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !isLoading) {
                    handleSendMessage(e);
                  }
                }
              }}
              placeholder="Type your message..."
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-600"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-teal-600 text-white p-2 rounded-full hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z"/>
                <path d="M22 2 11 13"/>
              </svg>
            </button>
          </form>
          
          {/* Only show view meal plan button if meal plan is ready */}
          {(hasMealPlanNotification || mealPlanReady) && (
            <div className="text-center mt-2">
              <button
                type="button"
                onClick={onChatComplete}
                className="text-teal-600 text-sm font-medium hover:text-teal-800"
              >
                View Your Meal Plan →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatbotWindow;