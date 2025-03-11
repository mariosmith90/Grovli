"use client";

import { useState, useEffect, useRef } from 'react';

const ChatbotWindow = ({ 
  user, 
  preferences, 
  mealType, 
  isVisible, 
  onClose, 
  onChatComplete,
  onMealPlanReady,
  mealPlanReady
}) => {
  // Core state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  
  // Status flags
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingUpdate, setIsProcessingUpdate] = useState(false);
  const [hasMealPlanNotification, setHasMealPlanNotification] = useState(false);
  
  // Message tracking
  const processedMessages = useRef(new Set());
  const [seenNotificationIds, setSeenNotificationIds] = useState(new Set());
  
  // UI state
  const [suggestedResponses, setSuggestedResponses] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const chatEndRef = useRef(null);

  // ===== Setup & Lifecycle =====
  
  // Start chat session when component mounts
  useEffect(() => {
    if (isVisible && !sessionId) {
      startChatSession();
    }
  }, [isVisible, sessionId]);

  // When mealPlanReady becomes true, fetch the latest chat session once
  useEffect(() => {
    if (mealPlanReady && sessionId && !hasMealPlanNotification && !isProcessingUpdate) {
      fetchChatSession();
    }
  }, [mealPlanReady, sessionId, hasMealPlanNotification, isProcessingUpdate]);

  useEffect(() => {
    // When we detect a meal plan ready notification, tell the parent
    if (hasMealPlanNotification) {
      // Call the parent's onMealPlanReady function if it exists
      if (onMealPlanReady) {
        onMealPlanReady();
      }
    }
  }, [hasMealPlanNotification, onMealPlanReady]);

  // Set up polling for chat updates
  useEffect(() => {
    if (!sessionId || !isVisible || hasMealPlanNotification) return;

    const interval = setInterval(() => {
      if (!isProcessingUpdate) {
        fetchChatSession();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, isVisible, hasMealPlanNotification, isProcessingUpdate]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, suggestedResponses, showSuggestions]);

  // ===== Core Functionality =====

  // Start a new chat session
  const startChatSession = async () => {
    try {
      setIsLoading(true);
      setShowSuggestions(false);
      
      // Reset state
      setMessages([]);
      processedMessages.current = new Set();
      setSuggestedResponses([
        "I'm excited to start", 
        "Looking forward to my plan", 
        "How long will this take?"
      ]);
      
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
      
      // Store the session ID first
      setSessionId(data.session_id);
      setLastFetchTime(Date.now());
      
      // Add first message directly
      if (data.messages && data.messages.length > 0) {
        const message = data.messages[0];
        const key = `${message.role}:${message.content}:${message.is_notification ? 'notif' : 'msg'}`;
        
        processedMessages.current.add(key);
        
        // Add message directly instead of typing animation
        setMessages([{
          role: 'assistant',
          content: message.content,
          is_notification: message.is_notification || false,
          timestamp: Date.now().toString(),
          messageId: `initial-${Date.now()}`
        }]);
        
        // Set initial suggested responses based on welcome message
        setTimeout(() => {
          setSuggestedResponses([
            "Yes, I'm just starting out",
            "No, I've been eating this way for a while",
            "I'm trying to be more consistent"
          ]);
          setShowSuggestions(true);
        }, 500);
      }
    } catch (error) {
      console.error('Error starting chat session:', error);
      setMessages([{
        role: 'assistant',
        content: "I'm getting your meal plan ready. This should only take a minute!"
      }]);
      setSuggestedResponses(["Thanks for the update", "How long will it take?"]);
      setShowSuggestions(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch the current chat session with all messages
  const fetchChatSession = async () => {
    // We still use the lock, but make it more targeted
    if (isProcessingUpdate) {
      console.log("Skipping fetch because another is in progress");
      return;
    }
    
    // Get a local reference to the current time for this fetch operation
    const thisFetchTime = Date.now();
    
    try {
      setIsProcessingUpdate(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      const response = await fetch(`${apiUrl}/chatbot/get_session/${sessionId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      // Get rid of typing indicator if it exists
      setMessages(prev => prev.filter(m => !m.isTyping));
      processedMessages.current.delete('assistant:typing');
      
      // Create a map of messages we already have
      const existingMessagesMap = new Map();
      messages.forEach(m => {
        const key = `${m.role}:${m.content}:${m.is_notification ? 'notif' : 'msg'}`;
        existingMessagesMap.set(key, true);
      });
      
      const uniqueMessages = data.messages.filter(m => {
        const key = `${m.role}:${m.content}:${m.timestamp}`;
        return !processedMessages.current.has(key);
      });
      
      uniqueMessages.forEach(m => {
        const key = `${m.role}:${m.content}:${m.timestamp}`;
        processedMessages.current.add(key);
      });
      
      // Process regular messages
      const regularMessages = uniqueMessages.filter(m => !m.is_notification);
      if (regularMessages.length > 0) {
        setMessages(prev => [...prev, ...regularMessages.map(m => ({
          ...m,
          timestamp: Date.now().toString(),
          messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        }))]);
        
        // Generate suggested responses after assistant message
        const lastMessage = regularMessages[regularMessages.length - 1];
        if (lastMessage.role === 'assistant') {
          generateSuggestedResponses(lastMessage.content);
          setShowSuggestions(true);
        }
      }
      
      // Handle notifications
      const notifications = uniqueMessages.filter(m => m.is_notification === true);
      if (notifications.length > 0 && !hasMealPlanNotification) {
        const latestNotification = notifications[notifications.length - 1];
        setHasMealPlanNotification(true);
        
        if (latestNotification.content) {
          // Add notification message directly
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: latestNotification.content,
            is_notification: true,
            timestamp: Date.now().toString(),
            messageId: `notif-${Date.now()}`
          }]);
          
          setSuggestedResponses(["Great!", "View my meal plan now"]);
          setShowSuggestions(true);
        }
      }
      
      setLastFetchTime(thisFetchTime);
    } catch (error) {
      console.error('Error fetching chat session:', error);
    } finally {
      setIsProcessingUpdate(false);
    }
  };

  // Send a message to the chatbot
  const handleSendMessage = async (e, predefinedMessage = null) => {
    // Prevent default form submission
    if (e) e.preventDefault();
    
    const messageText = predefinedMessage || input.trim();
    
    if ((!messageText || !sessionId) && !predefinedMessage) return;
    
    // Hide suggestions immediately when sending a message
    setShowSuggestions(false);
    setSuggestedResponses([]);
    
    // Add user message to the chat
    const userMessage = {
      role: 'user',
      content: messageText,
      timestamp: Date.now().toString(),
      messageId: `user-${Date.now()}`
    };
    
    // Track this message
    processedMessages.current.add(`${userMessage.role}:${userMessage.content}:false`);
    
    // Update UI immediately with user message
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    
    // Only set loading state for the message being sent, not the whole UI
    const currentMessageId = `user-${Date.now()}`;
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      // Fire and forget - don't await this promise
      fetch(`${apiUrl}/chatbot/send_message`, {
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
      }).then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      }).then(data => {
        // If status is processing, start polling without blocking
        if (data.status === 'processing') {
          startPollingForResponse();
        }
      }).catch(error => {
        console.error('Error sending message:', error);
        
        // Handle error - add a fallback message
        const fallbackMessage = { 
          role: 'assistant', 
          content: "I'm having trouble connecting right now. Please try again.",
          timestamp: Date.now().toString(),
          messageId: `fallback-${Date.now()}`
        };
        
        setMessages(prev => [...prev, fallbackMessage]);
      });
      
      // Add a temporary "typing" indicator
      setTimeout(() => {
        if (!processedMessages.current.has('assistant:typing')) {
          processedMessages.current.add('assistant:typing');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: "...",
            isTyping: true,
            timestamp: Date.now().toString(),
            messageId: `typing-${Date.now()}`
          }]);
        }
      }, 1000);
      
    } catch (error) {
      console.error('Error initiating message send:', error);
    }
  };

// Add a new polling method
const startPollingForResponse = () => {
  let attempts = 0;
  const maxAttempts = 10;
  let isPollingUpdate = false;
  
  const pollForResponse = () => {
    // Don't start a new poll if one is already in progress
    if (isPollingUpdate) return;
    
    isPollingUpdate = true;
    
    // Create a function that returns a promise but doesn't block the UI
    const doPoll = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        const response = await fetch(`${apiUrl}/chatbot/get_session/${sessionId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        // Get rid of typing indicator if it exists
        setMessages(prev => prev.filter(m => !m.isTyping));
        processedMessages.current.delete('assistant:typing');
        
        // Find the most recent assistant message that hasn't been processed
        const newMessages = data.messages.filter(msg => 
          msg.role === 'assistant' && 
          !processedMessages.current.has(`${msg.role}:${msg.content}:${msg.is_notification}`)
        );
        
        if (newMessages.length > 0) {
          // Add new messages
          newMessages.forEach(msg => {
            const key = `${msg.role}:${msg.content}:${msg.is_notification}`;
            processedMessages.current.add(key);
            
            setMessages(prev => [...prev, {
              ...msg,
              messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
            }]);
            
            // Generate suggested responses if it's a non-notification message
            if (!msg.is_notification) {
              generateSuggestedResponses(msg.content);
              setShowSuggestions(true);
            }
          });
          
          // Stop polling once messages are found
          clearInterval(pollInterval);
        }
        
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          // Handle timeout scenario
          const timeoutMessage = { 
            role: 'assistant', 
            content: "I apologize, but I'm taking longer than expected to respond. Please try again.",
            timestamp: Date.now().toString(),
            messageId: `timeout-${Date.now()}`
          };
          
          setMessages(prev => [...prev, timeoutMessage]);
        }
      } catch (error) {
        console.error('Error polling for response:', error);
        clearInterval(pollInterval);
      } finally {
        isPollingUpdate = false;
      }
    };
    
    // Execute the poll without awaiting it
    doPoll();
  };
  
  // Poll every 2 seconds
  const pollInterval = setInterval(pollForResponse, 2000);
};

  // Handle View Meal Plan button click
  const handleViewMealPlan = () => {
    if (onChatComplete) {
      onChatComplete();
    }
  };

  // ===== Helper Functions =====

  // Generate contextual suggested responses
  const generateSuggestedResponses = (assistantMessage) => {
    const lowerCaseMessage = assistantMessage.toLowerCase();
    let responses = [];
    
    if (lowerCaseMessage.includes("new for you")) {
      responses = [
        "Yes, I'm just starting out",
        "No, I've been eating this way for a while",
        "I'm trying to be more consistent"
      ];
    } else if (lowerCaseMessage.includes("cooking")) {
      responses = [
        "I love cooking!",
        "I'm a beginner cook",
        "I prefer simple recipes",
        "I enjoy meal prepping"
      ];
    } else if (lowerCaseMessage.includes("goal") || lowerCaseMessage.includes("reason")) {
      responses = [
        "I want to lose weight",
        "I'm focusing on my health",
        "I have specific dietary needs",
        "I want more energy"
      ];
    } else if (lowerCaseMessage.includes("challenge") || lowerCaseMessage.includes("difficult")) {
      responses = [
        "Finding time to cook",
        "Meal planning is hard",
        "Staying consistent",
        "Managing cravings"
      ];
    } else {
      // Default responses
      responses = [
        "Tell me more",
        "That sounds interesting",
        "What should I know about nutrition?",
        "Any quick meal prep tips?"
      ];
    }
    
    setSuggestedResponses(responses);
  };

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Format message with paragraphs
  const formatMessage = (text) => {
    const paragraphs = text.split('\n').filter(p => p.trim() !== '');
    
    return paragraphs.map((paragraph, index) => (
      <p key={index} className="mb-2">{paragraph}</p>
    ));
  };
  
  // ===== Render =====
  
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-4xl px-4">
      <div className="bg-white rounded-xl shadow-xl w-full h-[500px] flex flex-col border border-gray-200 overflow-hidden">
        {/* Chat header */}
        <div className="bg-teal-600 text-white p-3 rounded-t-xl flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.5-4.5 10-10 10S2 17.5 2 12a10 10 0 0 1 10-10Z"/>
                <path d="M8 9h8"/>
                <path d="M8 15h5"/>
                <path d="M16 15h.01"/>
              </svg>
            </div>
            <h2 className="text-xl font-semibold">Grovli Assistant</h2>
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
            key={message.messageId || index} 
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
              {message.isTyping ? (
                <div className="flex space-x-2">
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0s' }}></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              ) : (
                formatMessage(message.content)
              )}
              {message.is_notification && (
                <div className="mt-3">
                  <button
                    onClick={handleViewMealPlan}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    View Meal Plan
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
          
          {/* User-side suggested responses (quick reply bubbles) */}
          {suggestedResponses.length > 0 && !isLoading && showSuggestions && (
            <div className="flex justify-end flex-wrap gap-2 mb-4">
              {suggestedResponses.map((response, index) => (
                <button
                  key={index}
                  onClick={() => handleSendMessage(null, response)}
                  className="bg-teal-50 border border-teal-300 text-teal-700 px-3 py-2 rounded-full text-sm hover:bg-teal-100 transition-colors"
                >
                  {response}
                </button>
              ))}
            </div>
          )}
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-center my-2">
              <div className="flex space-x-2">
                <div className="w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0s' }}></div>
                <div className="w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          )}
          
          {/* If meal plan is ready, add a prompt but NO auto-redirect */}
          {mealPlanReady && !hasMealPlanNotification && (
            <div className="flex justify-center">
              <button
                onClick={handleViewMealPlan}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                View Meal Plan
              </button>
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
        </div>
      </div>
    </div>
  );
};

export default ChatbotWindow;