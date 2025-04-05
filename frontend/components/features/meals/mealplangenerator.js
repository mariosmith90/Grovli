"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../../lib/stores/authStore';
import { useMealStore, useMealNotifications } from '../../../lib/stores/mealStore';
import { useMealPlanGenerator, useApiMutation } from '../../../lib/swr-client';

/**
 * Enhanced meal plan generator component that uses SWR for API requests
 * and notification handling
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
  const [polling, setPolling] = useState(false);
  
  // Get global store methods
  const { 
    resetMealGeneration,
    setIsGenerating,
    setMealGenerationComplete,
    setCurrentMealPlanId,
    setHasViewedGeneratedMeals
  } = useMealStore();
  
  // Get auth context for user ID
  const auth = useAuth();
  const userId = auth.userId;
  
  // Use SWR hooks
  const { generateMealPlan: swrGenerateMealPlan } = useMealPlanGenerator();
  const apiMutation = useApiMutation();
  
  // Use the new notification hook
  const { 
    notifyMealPlanReady, 
    mealPlanReady, 
    notification,
    checkForNotifications
  } = useMealNotifications(userId);
  
  // Set up polling for notifications when needed
  useEffect(() => {
    if (polling && userId) {
      console.log('[MealPlanGenerator] Starting SWR notification polling');
      
      // Check immediately
      checkForNotifications();
      
      // Set intervals for checking
      const initialCheck = setTimeout(() => {
        notifyMealPlanReady();
      }, 5000);
      
      const pollingInterval = setInterval(() => {
        notifyMealPlanReady();
      }, 15000);
      
      return () => {
        clearTimeout(initialCheck);
        clearInterval(pollingInterval);
      };
    }
  }, [polling, userId, notifyMealPlanReady, checkForNotifications]);
  
  // Handle notifications when received
  useEffect(() => {
    if (mealPlanReady && notification?.meal_plan_id) {
      console.log(`[MealPlanGenerator] SWR notification received for: ${notification.meal_plan_id}`);
      
      // Stop polling
      setPolling(false);
      
      // Fetch the meal plan if needed
      if (!useMealStore.getState().mealPlan?.length) {
        fetchMealPlanById(notification.meal_plan_id);
      }
    }
  }, [mealPlanReady, notification]);
  
  // Function to fetch meal plan by ID
  const fetchMealPlanById = useCallback(async (mealPlanId) => {
    if (!mealPlanId) return null;
    
    try {
      // Use API mutation for fetching
      const response = await apiMutation.trigger(`/mealplan/by_id/${mealPlanId}`, {
        method: 'GET'
      });
      
      if (response?.meal_plan && Array.isArray(response.meal_plan)) {
        console.log(`[MealPlanGenerator] Fetched meal plan with ${response.meal_plan.length} meals`);
        
        // Process the meal plan with Zustand
        useMealStore.getState().handleMealPlanSuccess(
          response.meal_plan,
          mealPlanId
        );
        
        return response.meal_plan;
      }
    } catch (error) {
      console.error('[MealPlanGenerator] Error fetching meal plan:', error);
    }
    
    return null;
  }, [apiMutation]);

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
        
        // Start SWR polling for notifications
        setPolling(true);
        
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
    loading,
    fetchMealPlanById,
    mealPlanReady,
    notification
  };
}