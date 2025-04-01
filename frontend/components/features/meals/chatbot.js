"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';

const ChatbotWindow = ({ 
  preferences, 
  mealType, 
  isVisible, 
  onClose, 
  onChatComplete,
  onMealPlanReady,
  mealPlanReady
}) => {
  // Get user from auth context instead of props
  const { user, userId, getAuthHeaders } = useAuth();
  // Core state management
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const processedMessages = useRef(new Set());
  const chatEndRef = useRef(null);

  // UI and interaction state
  const [suggestedResponses, setSuggestedResponses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Meal plan state
  const [mealPlanNotification, setMealPlanNotification] = useState(null);

  // Configuration
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  // Utility function to generate a unique message ID
  const generateMessageId = () => 
    `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // Centralized message processing
  const processNewMessages = useCallback((newMessages) => {
    const uniqueMessages = newMessages.filter(m => {
      const key = `${m.role}:${m.content}:${m.is_notification || false}`;
      return !processedMessages.current.has(key);
    });

    uniqueMessages.forEach(m => {
      const key = `${m.role}:${m.content}:${m.is_notification || false}`;
      processedMessages.current.add(key);
    });

    return uniqueMessages.map(m => ({
      ...m,
      messageId: generateMessageId()
    }));
  }, []);

  // Generate contextual suggested responses
  const generateSuggestedResponses = useCallback((assistantMessage) => {
    const lowerCaseMessage = assistantMessage.toLowerCase();
    const responseCategories = {
      "new for you": [
        "Yes, I'm just starting out",
        "No, I've been eating this way for a while",
        "I'm trying to be more consistent"
      ],
      "cooking": [
        "I love cooking!",
        "I'm a beginner cook",
        "I prefer simple recipes",
        "I enjoy meal prepping"
      ],
      "goal|reason": [
        "I want to lose weight",
        "I'm focusing on my health",
        "I have specific dietary needs",
        "I want more energy"
      ],
      "challenge|difficult": [
        "Finding time to cook",
        "Meal planning is hard",
        "Staying consistent",
        "Managing cravings"
      ]
    };

    const matchedResponses = Object.entries(responseCategories)
      .find(([key]) => lowerCaseMessage.match(new RegExp(key, 'i')));

    return matchedResponses 
      ? matchedResponses[1] 
      : ["Tell me more", "That sounds interesting", "Any nutrition tips?"];
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!sessionId || isProcessing) return;

    try {
      setIsProcessing(true);
      
      // Get auth headers
      const headers = await getAuthHeaders(); 
      
      // First check for any immediately ready meal plans (this handles the immediate cached response case)
      try {
        console.log("[Chatbot] Checking for any ready meal plans via special check");
        const readyCheckResponse = await fetch(`/api/webhook/meal-ready?user_id=${user?.sub || 'anonymous'}&checkReadyPlans=true`);
        
        if (readyCheckResponse.ok) {
          const readyData = await readyCheckResponse.json();
          
          if (readyData.has_notification && readyData.notification?.meal_plan_id) {
            console.log("[Chatbot] Found ready meal plan from webhook cache:", readyData.notification.meal_plan_id);
            
            // Create a synthetic notification for this immediately ready meal plan
            const syntheticNotification = {
              role: 'assistant',
              content: "Great news! Your meal plan with all meal images is now ready. You can view it by clicking the 'View Meal Plan' button.",
              timestamp: new Date().toISOString(),
              meal_plan_id: readyData.notification.meal_plan_id,
              is_notification: true,
              is_from_ready_cache: true,
              messageId: generateMessageId()
            };
            
            // Store the meal plan ID in localStorage for persistence
            if (typeof window !== 'undefined') {
              localStorage.setItem('currentMealPlanId', readyData.notification.meal_plan_id);
              console.log(`[Chatbot] Stored currentMealPlanId in localStorage: ${readyData.notification.meal_plan_id}`);
            }
            
            setMessages(prev => [...prev.filter(m => !m.isTyping), syntheticNotification]);
            setMealPlanNotification(syntheticNotification);
            
            // Notify meal generation context
            onMealPlanReady?.();
            return;
          }
        }
      } catch (err) {
        console.error("[Chatbot] Error checking for ready meal plans:", err);
        // Continue with normal session fetch - this check is just an optimization
      }
      
      // Regular session fetch
      const response = await fetch(`${apiUrl}/chatbot/get_session/${sessionId}`, { headers });
      
      if (!response.ok) {
        console.error(`[Chatbot] Error fetching session: ${response.status}`);
        return;
      }
      
      const data = await response.json();

      // First check if meal plan is ready regardless of messages
      if (data.meal_plan_ready && data.meal_plan_id) {
        console.log("[Chatbot] Meal plan is ready:", data.meal_plan_id);
        
        // Store the meal plan ID in localStorage for persistence
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentMealPlanId', data.meal_plan_id);
          console.log(`[Chatbot] Stored currentMealPlanId in localStorage: ${data.meal_plan_id}`);
        }
        
        // Check if notification is in messages
        const hasNotification = data.messages.some(
          msg => msg.is_notification && msg.meal_plan_id === data.meal_plan_id
        );
        
        if (!hasNotification) {
          console.log("[Chatbot] Notification missing but meal plan is ready. Creating notification.");
          // Create a synthetic notification if none exists
          const syntheticNotification = {
            role: 'assistant',
            content: "Great news! Your meal plan with all meal images is now ready. You can view it by clicking the 'View Meal Plan' button.",
            timestamp: new Date().toISOString(),
            meal_plan_id: data.meal_plan_id,
            is_notification: true,
            messageId: generateMessageId()
          };
          
          setMessages(prev => [...prev.filter(m => !m.isTyping), syntheticNotification]);
          setMealPlanNotification(syntheticNotification);
          
          // Notify the meal generation context
          onMealPlanReady?.();
          return;
        }
      }

      // Process new messages as before
      const newMessages = processNewMessages(data.messages);
      
      if (newMessages.length) {
        setMessages(prev => {
          // Remove typing indicators and add new messages
          const filteredPrev = prev.filter(m => !m.isTyping);
          return [...filteredPrev, ...newMessages];
        });

        // Handle suggested responses for last assistant message
        const lastAssistantMessage = newMessages
          .filter(m => m.role === 'assistant' && !m.is_notification)
          .pop();

        if (lastAssistantMessage) {
          const responses = generateSuggestedResponses(lastAssistantMessage.content);
          setSuggestedResponses(responses);
        }

        // Check for meal plan notification
        const notification = newMessages.find(m => m.is_notification);
        if (notification) {
          console.log("Found notification in messages:", notification);
          setMealPlanNotification(notification);
          onMealPlanReady?.();
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [
    sessionId, 
    isProcessing, 
    apiUrl, 
    processNewMessages, 
    generateSuggestedResponses, 
    onMealPlanReady
  ]);

  // Effect to check meal plan status
useEffect(() => {
  // This effect only checks for meal plan status, separate from message polling
  if (sessionId && !mealPlanNotification) {
    const checkMealPlanStatus = async () => {
      try {
        // Get auth headers 
        const headers = await getAuthHeaders();
        headers['user-id'] = user?.sub || 'anonymous';
        
        console.log("[Chatbot] Checking meal plan status for user:", headers['user-id']);
        
        const response = await fetch(`${apiUrl}/mealplan/get_latest_session`, {
          headers
        });
        
        if (!response.ok) {
          console.error(`[Chatbot] Error checking meal plan status: ${response.status}`);
          return;
        }
        
        const data = await response.json();
        
        if (data.meal_plan_ready && data.meal_plan_id && data.all_meals_ready) {
          console.log("[Chatbot] Detected ready meal plan with all images:", data.meal_plan_id);
          
          // Store in localStorage for persistence
          if (typeof window !== 'undefined') {
            localStorage.setItem('currentMealPlanId', data.meal_plan_id);
            console.log(`[Chatbot] Stored currentMealPlanId in localStorage: ${data.meal_plan_id}`);
          }
          
          // First try to fetch the actual session with notification
          try {
            const sessionResponse = await fetch(`${apiUrl}/chatbot/get_session/${data.session_id}`, { headers });
            if (sessionResponse.ok) {
              const sessionData = await sessionResponse.json();
              
              // Check if notification exists in that session
              const hasNotification = sessionData.messages.some(
                msg => msg.is_notification && msg.meal_plan_id === data.meal_plan_id
              );
              
              if (hasNotification) {
                // Found the notification, use it
                const notification = sessionData.messages.find(
                  msg => msg.is_notification && msg.meal_plan_id === data.meal_plan_id
                );
                
                // Apply it to our current session
                const formattedNotification = {
                  ...notification,
                  messageId: generateMessageId()
                };
                
                setMealPlanNotification(formattedNotification);
                
                setMessages(prev => [
                  ...prev.filter(m => !m.isTyping && !m.is_notification), 
                  formattedNotification
                ]);
                
                // Signal that meal plan is ready
                onMealPlanReady?.();
                return;
              }
            }
          } catch (err) {
            console.error("[Chatbot] Error fetching session with notification:", err);
          }
          
          // If we reach here, create a synthetic notification
          console.log("[Chatbot] Creating synthetic notification for meal plan:", data.meal_plan_id);
          const syntheticNotification = {
            role: 'assistant',
            content: "Great news! Your meal plan with all meal images is now ready. You can view it by clicking the 'View Meal Plan' button.",
            timestamp: new Date().toISOString(),
            meal_plan_id: data.meal_plan_id,
            is_notification: true,
            messageId: generateMessageId()
          };
          
          setMessages(prev => [...prev.filter(m => !m.isTyping), syntheticNotification]);
          setMealPlanNotification(syntheticNotification);
          onMealPlanReady?.();
        } else if (data.meal_plan_ready && !data.all_meals_ready) {
          console.log("[Chatbot] Meal plan data ready but still waiting for images");
        }
      } catch (error) {
        console.error("[Chatbot] Error checking meal plan status:", error);
      }
    };
    
    // Check initially
    checkMealPlanStatus();
    
    // Also set up periodic checking with proper cleanup
    const intervalId = setInterval(checkMealPlanStatus, 15000); // Check every 15 seconds
    
    return () => {
      clearInterval(intervalId);
    };
  }
}, [sessionId, mealPlanNotification, apiUrl, userId, user, onMealPlanReady, getAuthHeaders]);

  // Start chat session
  const startChatSession = useCallback(async () => {
    try {
      setIsLoading(true);
      // Get auth headers from context
      const authHeaders = await getAuthHeaders();
      // Add content type
      authHeaders['Content-Type'] = 'application/json';
      
      const response = await fetch(`${apiUrl}/chatbot/start_session`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          user_id: userId || 'anonymous',
          user_name: user?.name || user?.nickname,
          message: 'Hello',
          dietary_preferences: preferences,
          meal_type: mealType
        })
      });

      const data = await response.json();
      setSessionId(data.session_id);

      // Process initial messages
      const initialMessages = processNewMessages(data.messages);
      setMessages(initialMessages);

      // Set initial suggested responses
      const lastMessage = initialMessages[initialMessages.length - 1];
      const responses = generateSuggestedResponses(lastMessage.content);
      setSuggestedResponses(responses);
    } catch (error) {
      console.error('Error starting chat session:', error);
      setMessages([{
        role: 'assistant',
        content: "I'm preparing your meal plan and generating meal images. This might take a moment!",
        messageId: generateMessageId()
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [
    apiUrl, 
    user, 
    preferences, 
    mealType, 
    processNewMessages, 
    generateSuggestedResponses
  ]);

  // Send message
  const sendMessage = useCallback(async (messageText) => {
    if (!messageText || !sessionId) return;

    // Add user message
    const userMessage = {
      role: 'user',
      content: messageText,
      messageId: generateMessageId()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSuggestedResponses([]);

    try {
      // Get auth headers from context
      const authHeaders = await getAuthHeaders();
      // Add content type
      authHeaders['Content-Type'] = 'application/json';
      
      const sendResponse = await fetch(`${apiUrl}/chatbot/send_message`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          user_id: userId || 'anonymous',
          session_id: sessionId,
          message: messageText,
          dietary_preferences: preferences,
          meal_type: mealType
        })
      });
      
      // We fetch messages directly after sending, rather than setting up polling
      if (sendResponse.ok) {
        // Add a small delay to allow the backend to process the message
        setTimeout(() => fetchMessages(), 500);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting. Please try again.",
        messageId: generateMessageId()
      }]);
    }
  }, [
    sessionId, 
    userId,
    user, 
    preferences, 
    mealType, 
    apiUrl, 
    fetchMessages,
    getAuthHeaders
  ]);

  // Effect to start chat session
  useEffect(() => {
    if (isVisible && !sessionId) {
      startChatSession();
    }
  }, [isVisible, sessionId, startChatSession]);

  // Effect to fetch messages once when sessionId changes
  useEffect(() => {
    if (sessionId && !mealPlanNotification) {
      // Instead of polling, just fetch messages once
      // The message system should work with server-sent events or websockets
      // for real-time updates, rather than constant polling
      fetchMessages();
      
      // Setup an event source for server-sent events if using that technique
      // This is just a comment as an example of the intent, not implemented yet
      // const eventSource = new EventSource(`${apiUrl}/chatbot/events/${sessionId}`);
      // eventSource.onmessage = (event) => {
      //   const data = JSON.parse(event.data);
      //   // Process message
      // };
      // return () => eventSource.close();
    }
  }, [sessionId, mealPlanNotification, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Render helpers
  const formatMessage = (text) => 
    text.split('\n')
      .filter(p => p.trim() !== '')
      .map((paragraph, index) => (
        <p key={index} className="mb-2 leading-relaxed">{paragraph}</p>
      ));

  // Prevent rendering if not visible
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-4xl px-4 mb-20">
      <div className="bg-white rounded-2xl shadow-2xl w-full h-[500px] flex flex-col border border-gray-100 overflow-hidden font-sans">
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-teal-500 to-teal-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mr-3 shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.5-4.5 10-10 10S2 17.5 2 12a10 10 0 0 1 10-10Z"/>
                <path d="M8 9h8"/>
                <path d="M8 15h5"/>
                <path d="M16 15h.01"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold tracking-tight">Grovli Assistant</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/20 rounded-full text-white transition-all duration-200"
            aria-label="Close chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-5 bg-gradient-to-b from-gray-50 to-white">
          {messages.map((message) => (
            <div 
              key={message.messageId} 
              className={`mb-5 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`rounded-2xl px-5 py-3.5 max-w-[85%] shadow-sm ${
                  message.role === 'user' 
                    ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-tr-none shadow-teal-100' 
                    : message.is_notification
                      ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-l-4 border-orange-400 text-gray-800 rounded-tl-none'
                      : 'bg-white text-gray-800 rounded-tl-none shadow-gray-100 border border-gray-100'
                }`}
                style={{
                  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                  fontSize: message.role === 'user' ? '15px' : '15px',
                  letterSpacing: '0.01em',
                }}
              >
                {message.is_notification && (
                  <div className="flex items-center mb-2 text-orange-500 font-medium">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span className="font-semibold">Notification</span>
                  </div>
                )}
                {formatMessage(message.content)}
                {message.is_notification && (
                  <div className="mt-4">
                    <button
                      onClick={onChatComplete}
                      className="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                    >
                      View Meal Plan
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Suggested Responses */}
          {suggestedResponses.length > 0 && !isLoading && (
            <div className="flex justify-end flex-wrap gap-2 mb-4">
              {suggestedResponses.map((response, index) => (
                <button
                  key={index}
                  onClick={() => sendMessage(response)}
                  className="bg-teal-50 border border-teal-200 text-teal-700 px-4 py-2 rounded-full text-sm hover:bg-teal-100 transition-all duration-200 hover:shadow-sm font-medium"
                >
                  {response}
                </button>
              ))}
            </div>
          )}

          {/* Scroll Anchor */}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-gray-100 bg-white">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }} 
            className="flex items-center gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 border border-gray-200 rounded-full px-5 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-gray-700 font-medium transition-all duration-200 shadow-sm"
              disabled={isLoading}
              style={{
                fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                fontSize: '15px',
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-gradient-to-r from-teal-500 to-teal-600 text-white p-3 rounded-full hover:shadow-md transition-all duration-200 disabled:opacity-50 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z"/>
                <path d="M22 2 11 13"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatbotWindow;