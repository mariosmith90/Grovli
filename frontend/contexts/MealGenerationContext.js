"use client";
import { createContext, useContext, useState, useEffect } from 'react';

// Simple shared context for meal generation state
const MealGenerationContext = createContext();

export const MealGenerationProvider = ({ children }) => {
  // Core state
  const [isGenerating, setIsGenerating] = useState(false);
  const [mealGenerationComplete, setMealGenerationComplete] = useState(false);
  const [currentMealPlanId, setCurrentMealPlanId] = useState(null);
  const [hasViewedGeneratedMeals, setHasViewedGeneratedMeals] = useState(false);
  const [backgroundTaskId, setBackgroundTaskId] = useState(null);

  // Load state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('mealGenerationState');
    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        setIsGenerating(parsedState.isGenerating || false);
        setMealGenerationComplete(parsedState.mealGenerationComplete || false);
        setCurrentMealPlanId(parsedState.currentMealPlanId || null);
        setHasViewedGeneratedMeals(parsedState.hasViewedGeneratedMeals || false);
        setBackgroundTaskId(parsedState.backgroundTaskId || null);
      } catch (error) {
        // If parsing fails, just continue with default state
      }
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    localStorage.setItem('mealGenerationState', JSON.stringify({
      isGenerating,
      mealGenerationComplete,
      currentMealPlanId,
      hasViewedGeneratedMeals,
      backgroundTaskId
    }));
  }, [isGenerating, mealGenerationComplete, currentMealPlanId, hasViewedGeneratedMeals, backgroundTaskId]);

  // Update global window vars when state changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.mealLoading = isGenerating;
      window.mealPlanReady = mealGenerationComplete;
      
      // Also update localStorage to maintain state across refreshes
      if (isGenerating !== undefined && mealGenerationComplete !== undefined) {
        const currentState = JSON.parse(localStorage.getItem('mealGenerationState') || '{}');
        localStorage.setItem('mealGenerationState', JSON.stringify({
          ...currentState,
          isGenerating,
          mealGenerationComplete
        }));
      }
    }
  }, [isGenerating, mealGenerationComplete]);

  // Function to start meal generation
  const startTaskChecking = (taskId) => {
    // Store task ID before we set any other state
    if (taskId) {
      setCurrentMealPlanId(taskId);
      
      // Also store in localStorage for persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('currentMealPlanId', taskId);
        console.log(`[MealContext] Stored currentMealPlanId in localStorage: ${taskId}`);
      }
    }
    
    setIsGenerating(true);
    setMealGenerationComplete(false);
    setHasViewedGeneratedMeals(false);
    
    if (typeof window !== 'undefined') {
      window.mealLoading = true;
      window.mealPlanReady = false;
    }
  };

  // Reset meal generation state
  const resetMealGeneration = () => {
    setIsGenerating(false);
    setMealGenerationComplete(false);
    setCurrentMealPlanId(null);
    setHasViewedGeneratedMeals(false);
    setBackgroundTaskId(null);
    
    if (typeof window !== 'undefined') {
      window.mealLoading = false;
      window.mealPlanReady = false;
      
      // Clear localStorage values to prevent stale state
      localStorage.removeItem('currentMealPlanId');
      
      // Update localStorage state
      const stateToStore = {
        isGenerating: false,
        mealGenerationComplete: false,
        currentMealPlanId: null,
        hasViewedGeneratedMeals: false,
        backgroundTaskId: null
      };
      localStorage.setItem('mealGenerationState', JSON.stringify(stateToStore));
      console.log('[MealContext] Reset meal generation state in localStorage');
    }
  };

  // Context value
  const value = {
    isGenerating,
    setIsGenerating,
    mealGenerationComplete,
    setMealGenerationComplete,
    currentMealPlanId,
    setCurrentMealPlanId,
    hasViewedGeneratedMeals,
    setHasViewedGeneratedMeals,
    backgroundTaskId,
    setBackgroundTaskId,
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