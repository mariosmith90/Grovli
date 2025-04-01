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
    }
  }, [isGenerating, mealGenerationComplete]);

  // Simple function to start meal generation
  const startTaskChecking = (taskId) => {
    setIsGenerating(true);
    setMealGenerationComplete(false);
    setCurrentMealPlanId(taskId);
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
    
    if (typeof window !== 'undefined') {
      window.mealLoading = false;
      window.mealPlanReady = false;
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