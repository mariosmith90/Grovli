"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../../lib/stores/authStore';
import { useMealPlanStore, formatDateKey, getTodayDateString } from '../../../../lib/stores/mealPlanStore';
import { useApiMutation } from '../../../../lib/swr-client';

/**
 * AutoUpdatingComponent provides common functionality for meal plan auto-updating and auto-deletion
 * using SWR for data fetching while maintaining Zustand for UI state
 */
const AutoUpdatingComponent = ({ 
  user, 
  activePlanId,
  setActivePlanId,
  mealPlan,
  setMealPlan,
  savingMeals,
  setSavingMeals,
  planName = "",
  setPlanName = null,
  onAfterSave = null,
  defaultMeal = null
}) => {
  // Component state
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimeoutRef = useRef(null);
  
  // All hooks at component level (fixing Rules of Hooks violations)
  const auth = useAuth();
  const mealPlanStoreState = useMealPlanStore();
  const apiMutation = useApiMutation();
  
  // Get user ID safely
  const userId = user?.sub;
  
  // Create or update a meal plan with SWR
  const updateMealPlan = useCallback(async (updatedMealPlan, changeType = 'update', affectedMeals = []) => {
    // Save the updated plan to state
    setMealPlan(updatedMealPlan);
    
    // Some implementation details omitted for clarity
    setIsAutoSaving(true);
    
    try {
      // Call API to save meal plan
      setIsAutoSaving(false);
    } catch (error) {
      console.error('Error auto-saving meal plan:', error);
      toast.error("Failed to save changes");
      setIsAutoSaving(false);
    }
  }, [user, apiMutation, setMealPlan, setIsAutoSaving, activePlanId, setActivePlanId, 
      setPlanName, onAfterSave, planName, setSavingMeals]);

  // Add a meal to the plan
  const addMealToPlan = useCallback((meal, mealType, date = new Date()) => {
    const dateKey = formatDateKey(date);
    
    try {
      // Implementation omitted for brevity
      toast.success("Meal added");
    } catch (error) {
      console.error('Error adding meal to plan:', error);
      toast.error("Failed to add meal to plan");
    }
  }, [formatDateKey, mealPlan, mealPlanStoreState, updateMealPlan]);

  // Remove meal from the plan
  const removeMealFromView = useCallback((date, mealType) => {
    const dateKey = typeof date === 'string' ? date : formatDateKey(date);
    
    try {
      // Implementation omitted for brevity
      toast.success("Meal removed");
    } catch (error) {
      console.error('Error removing meal:', error);
      toast.error("Failed to remove meal");
    }
  }, [formatDateKey, mealPlan, mealPlanStoreState, updateMealPlan, defaultMeal]);

  // Create a new meal plan
  const createNewPlan = useCallback(() => {
    // Implementation omitted for brevity
    toast.success("Started a new meal plan");
  }, [mealPlanStoreState, mealPlan, defaultMeal, setMealPlan, setActivePlanId, setPlanName]);

  // Toggle meal completion status with SWR
  const toggleMealCompletion = useCallback((mealType, date = new Date()) => {
    const dateKey = formatDateKey(date);
    
    try {
      // Implementation omitted for brevity
      return true;
    } catch (error) {
      console.error("Error toggling meal completion:", error);
      return false;
    }
  }, [formatDateKey, mealPlan, mealPlanStoreState, setMealPlan, apiMutation, updateMealPlan, user]);

  return {
    updateMealPlan,
    removeMealFromView,
    addMealToPlan,
    createNewPlan,
    toggleMealCompletion,
    isAutoSaving,
    formatDateKey,
    getTodayDateString
  };
};

export default AutoUpdatingComponent;
