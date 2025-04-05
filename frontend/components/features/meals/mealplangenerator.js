"use client";
import { useState } from 'react';
import { useMealStore } from '../../../lib/stores/mealStore';
import { useMealPlanGenerator } from '../../../lib/swr-client';

/**
 * Enhanced meal plan generator component that uses SWR for API requests
 */
export default function MealPlanGenerator({
  preferences,
  mealType,
  numDays,
  globalSettings,
  isPro,
  getAuthHeaders,
  onError,
  onProcessingStarted,
  showChatbot
}) {
  const [loading, setLoading] = useState(false);
  
  // Get global store methods
  const { 
    resetMealGeneration,
    setIsGenerating,
    setMealGenerationComplete,
    setCurrentMealPlanId,
    setHasViewedGeneratedMeals
  } = useMealStore();
  
  // Get SWR meal plan generator hook
  const { generateMealPlan: swrGenerateMealPlan } = useMealPlanGenerator();

  // Main function to generate a meal plan
  const generateMealPlan = async () => {
    // Final Pro status check before generating meal plan
    if (!isPro && (mealType === "Full Day" || numDays > 1)) {
      onError("Pro subscription required for this feature");
      return { error: "Pro subscription required for this feature" };
    }
  
    // Reset previous states and start generation in one atomic action
    useMealStore.getState().startMealGeneration({
      mealType,
      numDays,
      preferences
    });
    setLoading(true);
    
    try {
      // Use the SWR generator
      const result = await swrGenerateMealPlan({
        preferences,
        mealType,
        numDays,
        globalSettings,
        isPro,
        onError,
        onProcessingStarted,
        getAuthHeaders
      });
      
      console.log("[MealPlanGenerator] SWR Result:", result);
      
      // Handle error case
      if (result.error) {
        onError(`Error: ${result.error}`);
        setIsGenerating(false);
        return { error: result.error };
      }
      
      // Case 1: Immediate meal plan data
      if (result.immediate && result.mealPlan) {
        console.log("[MealPlanGenerator] Received immediate meal plan");
        
        // Use the Zustand action for atomic state update
        useMealStore.getState().handleMealPlanSuccess(
          result.mealPlan,
          result.mealPlanId || `${mealType}_${Date.now()}`
        );
        
        return {
          immediate: true,
          mealPlan: result.mealPlan
        };
      }
      
      // Case 2: Background processing response
      if (result.mealPlanId) {
        console.log("[MealPlanGenerator] Meal plan processing in background");
        
        // Use request_hash if available, otherwise fallback to meal_plan_id
        const taskIdentifier = result.taskId || result.mealPlanId;
        setCurrentMealPlanId(result.mealPlanId);
        
        // Start tracking background task using Zustand's startTaskChecking method
        console.log(`[MealPlanGenerator] Starting task tracking for ID: ${result.mealPlanId}`);
        
        // Use the store's combined action for task checking
        useMealStore.getState().startTaskChecking(taskIdentifier);
        
        return {
          immediate: false,
          mealPlanId: result.mealPlanId,
          taskId: taskIdentifier
        };
      }
      
      // Case 3: Unexpected response format
      throw new Error("Invalid API response format");
      
    } catch (error) {
      console.error('[MealPlanGenerator] Error generating meal plan:', error);
      onError(`Error: ${error.message}`);
      setIsGenerating(false);
      return { error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Return the meal plan generation function and loading state
  return { 
    generateMealPlan,
    loading
  };
}