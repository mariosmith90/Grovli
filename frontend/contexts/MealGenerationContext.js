"use client";
import { createContext, useContext, useState, useEffect } from 'react';

const MealGenerationContext = createContext();

export const MealGenerationProvider = ({ children }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [mealGenerationComplete, setMealGenerationComplete] = useState(false);
  const [currentMealPlanId, setCurrentMealPlanId] = useState(null);
  const [backgroundTaskId, setBackgroundTaskId] = useState(null);
  const [taskCheckInterval, setTaskCheckInterval] = useState(null);

  // Load state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('mealGenerationState');
      if (savedState) {
        const { 
          isGenerating: savedIsGenerating, 
          mealGenerationComplete: savedMealGenerationComplete,
          currentMealPlanId: savedCurrentMealPlanId,
          backgroundTaskId: savedBackgroundTaskId
        } = JSON.parse(savedState);
        
        setIsGenerating(savedIsGenerating);
        setMealGenerationComplete(savedMealGenerationComplete);
        setCurrentMealPlanId(savedCurrentMealPlanId);
        
        if (savedBackgroundTaskId) {
          setBackgroundTaskId(savedBackgroundTaskId);
          startTaskChecking(savedBackgroundTaskId);
        }
      }
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mealGenerationState', JSON.stringify({
        isGenerating,
        mealGenerationComplete,
        currentMealPlanId,
        backgroundTaskId
      }));
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

    const interval = setInterval(() => checkBackgroundTaskStatus(taskId), 5000);
    setTaskCheckInterval(interval);
  };

  const checkBackgroundTaskStatus = async (taskId) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/mealplan/task_status/${taskId}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'completed') {
          setIsGenerating(false);
          setMealGenerationComplete(true);
          setBackgroundTaskId(null);
          setCurrentMealPlanId(data.meal_plan_id);
          clearInterval(taskCheckInterval);
        } else if (data.status === 'failed') {
          setIsGenerating(false);
          setBackgroundTaskId(null);
          clearInterval(taskCheckInterval);
          console.error('Meal generation failed:', data.error);
        }
        // If still processing, do nothing - we'll check again
      } else {
        console.error('Failed to check task status');
        setIsGenerating(false);
        setBackgroundTaskId(null);
        clearInterval(taskCheckInterval);
      }
    } catch (error) {
      console.error('Error checking task status:', error);
      setIsGenerating(false);
      setBackgroundTaskId(null);
      clearInterval(taskCheckInterval);
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
    checkBackgroundTaskStatus,
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