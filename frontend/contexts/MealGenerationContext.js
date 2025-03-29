"use client";
import { createContext, useContext, useState, useEffect } from 'react';

const MealGenerationContext = createContext();

export const MealGenerationProvider = ({ children }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [mealGenerationComplete, setMealGenerationComplete] = useState(false);
  const [currentMealPlanId, setCurrentMealPlanId] = useState(null);
  const [backgroundTaskId, setBackgroundTaskId] = useState(null);
  const [taskCheckInterval, setTaskCheckInterval] = useState(null);

  // Load state from localStorage on initial render
  useEffect(() => {
    const savedState = localStorage.getItem('mealGenerationState');
    if (savedState) {
      const {
        isGenerating: savedIsGenerating,
        mealGenerationComplete: savedComplete,
        currentMealPlanId: savedMealPlanId,
        backgroundTaskId: savedTaskId
      } = JSON.parse(savedState);
      
      setIsGenerating(savedIsGenerating);
      setMealGenerationComplete(savedComplete);
      setCurrentMealPlanId(savedMealPlanId);
      setBackgroundTaskId(savedTaskId);
      
      if (savedTaskId) {
        startTaskChecking(savedTaskId);
      }
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    const state = {
      isGenerating,
      mealGenerationComplete,
      currentMealPlanId,
      backgroundTaskId
    };
    localStorage.setItem('mealGenerationState', JSON.stringify(state));
    
    // Update global window state
    if (typeof window !== 'undefined') {
      window.mealLoading = isGenerating;
      window.mealGenerationComplete = mealGenerationComplete;
    }
  }, [isGenerating, mealGenerationComplete, currentMealPlanId, backgroundTaskId]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (taskCheckInterval) {
        clearInterval(taskCheckInterval);
      }
    };
  }, [taskCheckInterval]);

  const startTaskChecking = (taskId) => {
    // Clear any existing interval
    if (taskCheckInterval) {
      clearInterval(taskCheckInterval);
    }
  
    // Set isGenerating to true immediately to ensure spinner shows
    setIsGenerating(true);
    localStorage.setItem('isGenerating', 'true');
    
    // Reset completion state at the beginning of a new task
    setMealGenerationComplete(false);
    localStorage.removeItem('mealGenerationComplete');
  
    console.log(`🔄 Starting task check interval for task: ${taskId}`);
  
    const interval = setInterval(async () => {
      try {
        // First try the task status endpoint
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        console.log(`📡 Checking status for task: ${taskId}`);
        
        const response = await fetch(`${apiUrl}/mealplan/task_status/${taskId}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`📊 Task status response:`, data);
          
          if (data.status === 'completed') {
            handleTaskCompletion(interval, data.meal_plan_id);
            return;
          } else if (data.status === 'failed') {
            handleTaskFailure(interval);
            return;
          }
        } else {
          console.error(`❌ Error response from API: ${response.status}`);
        }
        
        // As a backup, also check the session endpoint used by the chatbot
        if (typeof window !== 'undefined' && window.userId) {
          try {
            const sessionResponse = await fetch(`${apiUrl}/mealplan/get_latest_session`, {
              headers: { 'user-id': window.userId }
            });
            
            if (sessionResponse.ok) {
              const sessionData = await sessionResponse.json();
              console.log(`📊 Session status response:`, sessionData);
              
              if (sessionData.meal_plan_ready && sessionData.meal_plan_id) {
                console.log(`✅ Meal plan ready via session check: ${sessionData.meal_plan_id}`);
                handleTaskCompletion(interval, sessionData.meal_plan_id);
                return;
              }
            }
          } catch (sessionError) {
            console.error('Error checking session status:', sessionError);
          }
        }
        
        // Still processing if we got here
        console.log(`⏳ Task ${taskId} still processing.`);
      } catch (error) {
        console.error('Error checking task status:', error);
        // Don't clear the interval on network errors - keep trying
      }
    }, 3000); // Check more frequently (3 seconds)
  
    setTaskCheckInterval(interval);
    
    // Helper function to handle task completion
    function handleTaskCompletion(intervalToClean, mealPlanId) {
      console.log(`✅ Task completed! Meal plan ID: ${mealPlanId}`);
      
      // Clear interval first to prevent any race conditions
      clearInterval(intervalToClean);
      setTaskCheckInterval(null);
      
      // Update all relevant states in a specific order
      if (mealPlanId) {
        setCurrentMealPlanId(mealPlanId);
      }
      
      // Important: set these in the correct order
      setIsGenerating(false);
      setMealGenerationComplete(true);
      setBackgroundTaskId(null);
      
      // Update localStorage values
      localStorage.setItem('mealGenerationComplete', 'true');
      localStorage.removeItem('isGenerating');
      
      // Force update global window state
      if (typeof window !== 'undefined') {
        window.mealLoading = false;
        window.mealGenerationComplete = true;
        if (mealPlanId) {
          window.currentMealPlanId = mealPlanId;
        }
      }
      
      // Dispatch a custom event that other components can listen for
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('mealGenerationComplete', { 
          detail: { 
            mealPlanId: mealPlanId 
          } 
        });
        window.dispatchEvent(event);
      }
    }
    
    // Helper function to handle task failure
    function handleTaskFailure(intervalToClean) {
      console.error(`❌ Task failed`);
      
      clearInterval(intervalToClean);
      setTaskCheckInterval(null);
      setIsGenerating(false);
      setBackgroundTaskId(null);
      
      localStorage.removeItem('isGenerating');
      
      if (typeof window !== 'undefined') {
        window.mealLoading = false;
      }
    }
  };

  const value = {
    isGenerating,
    setIsGenerating,
    mealGenerationComplete,
    setMealGenerationComplete,
    currentMealPlanId,
    setCurrentMealPlanId,
    backgroundTaskId,
    setBackgroundTaskId,
    startTaskChecking
  };

  return (
    <MealGenerationContext.Provider value={value}>
      {children}
    </MealGenerationContext.Provider>
  );
};

export const useMealGeneration = () => {
  const context = useContext(MealGenerationContext);
  if (!context) {
    throw new Error('useMealGeneration must be used within a MealGenerationProvider');
  }
  return context;
};