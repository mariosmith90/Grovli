"use client";
import { createContext, useContext, useState, useEffect } from 'react';

const MealGenerationContext = createContext();

export const MealGenerationProvider = ({ children }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [mealGenerationComplete, setMealGenerationComplete] = useState(false);
  const [currentMealPlanId, setCurrentMealPlanId] = useState(null);
  const [backgroundTaskId, setBackgroundTaskId] = useState(null);
  const [taskCheckInterval, setTaskCheckInterval] = useState(null);
  const [hasViewedGeneratedMeals, setHasViewedGeneratedMeals] = useState(false);

  // Load state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('mealGenerationState');
      if (savedState) {
        try {
          const { 
            isGenerating: savedIsGenerating, 
            mealGenerationComplete: savedMealGenerationComplete,
            currentMealPlanId: savedCurrentMealPlanId,
            backgroundTaskId: savedBackgroundTaskId,
            hasViewedGeneratedMeals: savedHasViewedGeneratedMeals
          } = JSON.parse(savedState);
          
          setIsGenerating(savedIsGenerating);
          setMealGenerationComplete(savedMealGenerationComplete);
          setCurrentMealPlanId(savedCurrentMealPlanId);
          setHasViewedGeneratedMeals(savedHasViewedGeneratedMeals || false);
          
          if (savedBackgroundTaskId && savedIsGenerating) {
            setBackgroundTaskId(savedBackgroundTaskId);
            startTaskChecking(savedBackgroundTaskId);
          }
        } catch (error) {
          console.error('Error parsing saved meal generation state:', error);
          localStorage.removeItem('mealGenerationState');
        }
      }
    }
  }, []);

  // Expose generation state globally for cross-component access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.mealLoading = isGenerating;
      
      // Setup a listener to synchronize state across tabs/components
      const handleStorageChange = (event) => {
        if (event.key === 'mealGenerationState') {
          try {
            const newState = JSON.parse(event.newValue);
            if (newState) {
              setIsGenerating(newState.isGenerating);
              setMealGenerationComplete(newState.mealGenerationComplete);
              setCurrentMealPlanId(newState.currentMealPlanId);
              setHasViewedGeneratedMeals(newState.hasViewedGeneratedMeals);
            }
          } catch (error) {
            console.error('Error handling storage change:', error);
          }
        }
      };
      
      window.addEventListener('storage', handleStorageChange);
      return () => {
        window.removeEventListener('storage', handleStorageChange);
        window.mealLoading = undefined;
      };
    }
  }, [isGenerating]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stateToSave = {
        isGenerating,
        mealGenerationComplete,
        currentMealPlanId,
        backgroundTaskId,
        hasViewedGeneratedMeals
      };
      localStorage.setItem('mealGenerationState', JSON.stringify(stateToSave));
    }
  }, [isGenerating, mealGenerationComplete, currentMealPlanId, backgroundTaskId, hasViewedGeneratedMeals]);

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

    // Set isGenerating to true when we start checking
    setIsGenerating(true);
    
    // Use a more frequent interval for better UX
    const interval = setInterval(() => checkBackgroundTaskStatus(taskId), 3000);
    setTaskCheckInterval(interval);
    
    console.log('Started checking task status for:', taskId);
  };

  const checkBackgroundTaskStatus = async (taskId) => {
    if (!taskId) {
      console.warn('Cannot check task status: No task ID provided');
      return;
    }
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      let endpoint = `${apiUrl}/mealplan/get_latest_session`;
      
      // First try to get status from the user's latest session
      const userIdFromWindow = typeof window !== 'undefined' ? window.userId : null;
      
      if (userIdFromWindow) {
        const headers = { 'user-id': userIdFromWindow };
        const sessionResponse = await fetch(endpoint, { headers });
        
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          
          if (sessionData.meal_plan_ready) {
            console.log('Meal plan is ready from session check:', sessionData.meal_plan_id);
            setIsGenerating(false);
            setMealGenerationComplete(true);
            setCurrentMealPlanId(sessionData.meal_plan_id);
            setBackgroundTaskId(null);
            clearInterval(taskCheckInterval);
            setTaskCheckInterval(null);
            return;
          } else if (sessionData.meal_plan_processing === false && !sessionData.meal_plan_ready) {
            // If the plan isn't processing anymore but isn't ready, something went wrong
            console.error('Meal plan processing failed or was cancelled');
            setIsGenerating(false);
            setBackgroundTaskId(null);
            clearInterval(taskCheckInterval);
            setTaskCheckInterval(null);
            return;
          }
          // If still processing, continue with the specific task check
        }
      }
      
      // If we can't determine status from the session, try the dedicated task endpoint
      // This is a fallback in case your API has a specific endpoint for task status
      // You might need to add this endpoint to your backend
      try {
        const taskResponse = await fetch(`${apiUrl}/mealplan/by_id/${taskId}`);
        
        if (taskResponse.ok) {
          const mealPlanData = await taskResponse.json();
          
          if (mealPlanData && mealPlanData.meal_plan && Array.isArray(mealPlanData.meal_plan)) {
            console.log('Meal plan is ready from direct check:', taskId);
            setIsGenerating(false);
            setMealGenerationComplete(true);
            setCurrentMealPlanId(taskId);
            setBackgroundTaskId(null);
            clearInterval(taskCheckInterval);
            setTaskCheckInterval(null);
          }
        } else if (taskResponse.status === 404) {
          // 404 likely means "still generating" if your API returns this for in-progress plans
          console.log('Meal plan still generating...');
        } else {
          // Any other error status might indicate a problem
          console.error('Error checking task status:', taskResponse.status);
        }
      } catch (taskError) {
        console.error('Error in task status check:', taskError);
      }
    } catch (error) {
      console.error('Error checking meal plan status:', error);
      
      // After several failed checks, we should give up to avoid endless spinning
      const failedChecksKey = `failedChecks_${taskId}`;
      const failedChecks = parseInt(localStorage.getItem(failedChecksKey) || '0') + 1;
      localStorage.setItem(failedChecksKey, failedChecks.toString());
      
      if (failedChecks > 10) {
        console.error('Too many failed status checks, giving up');
        setIsGenerating(false);
        setBackgroundTaskId(null);
        clearInterval(taskCheckInterval);
        setTaskCheckInterval(null);
        localStorage.removeItem(failedChecksKey);
      }
    }
  };

  const resetMealGeneration = () => {
    setIsGenerating(false);
    setMealGenerationComplete(false);
    setCurrentMealPlanId(null);
    setBackgroundTaskId(null);
    setHasViewedGeneratedMeals(false);
    
    if (taskCheckInterval) {
      clearInterval(taskCheckInterval);
      setTaskCheckInterval(null);
    }
    
    if (typeof window !== 'undefined') {
      window.mealLoading = false;
    }
    
    console.log('Reset meal generation state');
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
    hasViewedGeneratedMeals,
    setHasViewedGeneratedMeals,
    checkBackgroundTaskStatus,
    startTaskChecking,
    resetMealGeneration
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