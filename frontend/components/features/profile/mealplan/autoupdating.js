"use client";

import { useEffect, useRef, useState } from 'react';
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
  
  // Add a meal to the plan
  const addMealToPlan = (meal, mealType, date = new Date()) => {
    const dateKey = formatDateKey(date);
    
    // Mark meal as being processed
    setSavingMeals(prev => ({
      ...prev,
      [`${dateKey}-${mealType}`]: true
    }));
    
    try {
      // Add to Zustand store - this handles both formats internally
      mealPlanStoreState.updateMeal(meal, mealType, date);
      
      // If we have the array-based meal plan (profile page)
      if (Array.isArray(mealPlan)) {
        const mealIndex = mealPlan.findIndex(m => m.type === mealType);
        if (mealIndex !== -1) {
          const updatedMealPlan = [...mealPlan];
          updatedMealPlan[mealIndex] = {
            ...updatedMealPlan[mealIndex],
            name: meal.title || meal.name || "",
            title: meal.title || meal.name || "",
            type: mealType,
            meal_type: mealType,
            nutrition: meal.nutrition || {
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0
            },
            image: meal.imageUrl || meal.image || "",
            imageUrl: meal.imageUrl || meal.image || "",
            recipe_id: meal.recipe_id || meal.id,
            id: meal.id
          };
          
          // Update through the normal plan update mechanism
          updateMealPlan(updatedMealPlan, 'add', [{ dateKey, mealType }]);
        }
      } 
      // Object-based meal plan (planner page)
      else if (typeof mealPlan === 'object') {
        const updatedMealPlan = { ...mealPlan };
        
        // Create date entry if it doesn't exist
        if (!updatedMealPlan[dateKey]) {
          updatedMealPlan[dateKey] = {};
        }
        
        // Add the meal to this date with fully standardized fields
        updatedMealPlan[dateKey][mealType] = {
          ...meal,
          name: meal.title || meal.name || "",
          title: meal.title || meal.name || "",
          type: mealType,
          meal_type: mealType,
          nutrition: meal.nutrition || {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0
          },
          image: meal.imageUrl || meal.image || "",
          imageUrl: meal.imageUrl || meal.image || "",
          recipe_id: meal.recipe_id || meal.id,
          id: meal.id
        };
        
        // Update through the normal plan update mechanism
        updateMealPlan(updatedMealPlan, 'add', [{ dateKey, mealType }]);
      }
    } catch (error) {
      console.error('Error adding meal to plan:', error);
      toast.error("Failed to add meal to plan");
    } finally {
      // Clear the saving state
      setSavingMeals(prev => {
        const updated = { ...prev };
        delete updated[`${dateKey}-${mealType}`];
        return updated;
      });
    }
  };

  // Remove meal from the plan
  const removeMealFromView = (date, mealType) => {
    const dateKey = typeof date === 'string' ? date : formatDateKey(date);
    
    // Mark meal as being processed
    setSavingMeals(prev => ({
      ...prev,
      [`${dateKey}-${mealType}`]: true
    }));
    
    try {
      // Remove from Zustand store - this handles both formats internally
      mealPlanStoreState.removeMeal(mealType, date);
      
      // If we have the array-based meal plan (profile page)
      if (Array.isArray(mealPlan)) {
        const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
        if (mealIndex !== -1) {
          const updatedMealPlan = [...mealPlan];
          
          // Reset the meal properties but keep the type and time
          const currentMealType = updatedMealPlan[mealIndex].type;
          const mealTime = updatedMealPlan[mealIndex].time;
          
          // Use provided defaultMeal object if available, otherwise create a generic empty meal
          const emptyMeal = defaultMeal || {
            name: '',
            nutrition: {
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0
            },
            image: '',
            imageUrl: '',
            id: null,
            completed: false
          };
          
          updatedMealPlan[mealIndex] = {
            ...emptyMeal,
            type: currentMealType,
            time: mealTime
          };
          
          // Update meal plan state
          setMealPlan(updatedMealPlan);
          
          // Update through the normal plan update mechanism
          updateMealPlan(updatedMealPlan, 'remove', [{ dateKey, mealType }]);
        }
      } 
      // Object-based meal plan (planner page)
      else if (typeof mealPlan === 'object') {
        // Only update if the meal exists
        if (mealPlan[dateKey] && mealPlan[dateKey][mealType]) {
          const updatedMealPlan = { ...mealPlan };
          const updatedDate = { ...updatedMealPlan[dateKey] };
          
          // Remove the meal from this date
          delete updatedDate[mealType];
          
          // If no more meals for this date, remove the date entry
          if (Object.keys(updatedDate).length === 0) {
            delete updatedMealPlan[dateKey];
          } else {
            updatedMealPlan[dateKey] = updatedDate;
          }
          
          // Update meal plan state
          setMealPlan(updatedMealPlan);
          
          // Update through the normal plan update mechanism
          updateMealPlan(updatedMealPlan, 'remove', [{ dateKey, mealType }]);
        }
      }
    } catch (error) {
      console.error('Error removing meal from view:', error);
      toast.error("Failed to remove meal from plan");
    } finally {
      // Clear the saving state
      setSavingMeals(prev => {
        const updated = { ...prev };
        delete updated[`${dateKey}-${mealType}`];
        return updated;
      });
    }
  };

  // Create or update a meal plan with SWR
  const updateMealPlan = async (updatedMealPlan, changeType = 'update', affectedMeals = []) => {
    // Save the updated plan to state
    setMealPlan(updatedMealPlan);
    
    // Mark the affected meals as saving
    const newSavingState = {};
    affectedMeals.forEach(meal => {
      newSavingState[`${meal.dateKey}-${meal.mealType}`] = true;
    });
    
    if (Object.keys(newSavingState).length > 0) {
      setSavingMeals(prev => ({ ...prev, ...newSavingState }));
    }
    
    // Clear any existing timeout to prevent multiple saves
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Set a short delay before auto-saving to avoid rapid successive saves
    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (!user) {
        toast.error("Please log in to save your meal plan");
        return;
      }
      
      try {
        setIsAutoSaving(true);
        
        // Format meals for API consistently
        const formattedMeals = [];
        
        // For array-based plan (profile page)
        if (Array.isArray(updatedMealPlan)) {
          updatedMealPlan.forEach(meal => {
            if (meal.id) {
              formattedMeals.push({
                date: getTodayDateString(),
                mealType: meal.type,
                mealId: meal.id
              });
            }
          });
        } 
        // For object-based plan (planner page)
        else if (typeof updatedMealPlan === 'object') {
          Object.entries(updatedMealPlan).forEach(([date, meals]) => {
            Object.entries(meals).forEach(([mealType, meal]) => {
              if (meal && meal.id) {
                formattedMeals.push({
                  date,
                  mealType,
                  mealId: meal.id
                });
              }
            });
          });
        }
        
        if (formattedMeals.length === 0) {
          // Don't bother saving an empty plan
          setIsAutoSaving(false);
          return;
        }
        
        // Prepare request data
        let result;
        
        if (activePlanId) {
          // For existing plans, use SWR updateMealPlan
          const updateData = {
            planId: activePlanId,
            meals: formattedMeals
          };
          
          // Use the SWR mutation for meal plan updates
          result = await apiMutation.updateMealPlan(updateData, { 
            userId: user.sub
          });
        } else {
          // For new plans, create a new one via SWR
          const newPlanData = {
            userId: user.sub,
            planName: planName || `Meal Plan - ${new Date().toLocaleDateString()}`,
            meals: formattedMeals
          };
          
          // Use SWR post method to create the plan
          result = await apiMutation.post('/api/user-plans/save', newPlanData, {
            invalidateUrls: [
              '/api/user-plans',
              `/api/user-plans/user/${user.sub}`
            ]
          });
        }
        
        // If it was a new plan, update the activePlanId
        if (!activePlanId && result && result.id) {
          setActivePlanId(result.id);
          
          if (setPlanName && result.name) {
            setPlanName(result.name);
          }
        }
        
        // Show success message for specific changes
        if (changeType === 'add') {
          toast.success("Meal added to plan");
        } else if (changeType === 'remove') {
          toast.success("Meal removed from plan");
        } else if (changeType === 'duplicate') {
          toast.success("Meals duplicated successfully");
        } else {
          // For other updates, show a more subtle message
          toast.success("Plan updated", { duration: 2000 });
        }
        
        // Call the callback if provided
        if (onAfterSave) {
          onAfterSave(result);
        }
        
      } catch (error) {
        console.error('Error auto-saving meal plan:', error);
        toast.error("Failed to save changes");
      } finally {
        setIsAutoSaving(false);
        
        // Clear the saving state for affected meals
        setSavingMeals(prev => {
          const updated = { ...prev };
          affectedMeals.forEach(meal => {
            delete updated[`${meal.dateKey}-${meal.mealType}`];
          });
          return updated;
        });
      }
    }, 500); // 500ms delay before auto-saving
  };

  // Create a new meal plan
  const createNewPlan = () => {
    // Update the Zustand store
    mealPlanStoreState.clearAllMeals();
    
    // Reset the meal plan based on its type
    if (Array.isArray(mealPlan)) {
      // Reset to empty array with proper structure for profile page
      const resetMealPlan = mealPlan.map(meal => ({
        ...defaultMeal,
        type: meal.type,
        time: meal.time,
        completed: false
      }));
      setMealPlan(resetMealPlan);
    } else {
      // Reset to empty object for planner page
      setMealPlan({});
    }
    
    // Reset plan ID and name
    setActivePlanId(null);
    
    if (setPlanName) {
      setPlanName("");
    }
    
    toast.success("Started a new meal plan");
  };

  // Toggle meal completion status with SWR
  const toggleMealCompletion = (mealType, date = new Date()) => {
    const dateKey = formatDateKey(date);
    
    // Update in Zustand store first
    const newCompleted = mealPlanStoreState.toggleMealCompletion(mealType, date);
    
    // For profile page (array-based meal plan)
    if (Array.isArray(mealPlan)) {
      const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
      if (mealIndex === -1) return false;
      
      const updatedMealPlan = [...mealPlan];
      updatedMealPlan[mealIndex] = {
        ...updatedMealPlan[mealIndex],
        completed: newCompleted
      };
      
      setMealPlan(updatedMealPlan);
      
      // Update through the normal plan update mechanism
      updateMealPlan(updatedMealPlan, 'update', [{ dateKey, mealType }]);
      
      // Also update meal completion via SWR
      if (user?.sub) {
        apiMutation.saveMealCompletion(user.sub, mealType, newCompleted)
          .catch(err => console.error("Error saving meal completion:", err));
      }
    }
    // For planner page (object-based meal plan)
    else if (typeof mealPlan === 'object' && mealPlan[dateKey]?.[mealType]) {
      const updatedMealPlan = { ...mealPlan };
      updatedMealPlan[dateKey][mealType] = {
        ...updatedMealPlan[dateKey][mealType],
        completed: newCompleted
      };
      
      setMealPlan(updatedMealPlan);
      
      // Update through the normal plan update mechanism
      updateMealPlan(updatedMealPlan, 'update', [{ dateKey, mealType }]);
      
      // Also update meal completion via SWR
      if (user?.sub) {
        apiMutation.saveMealCompletion(user.sub, mealType, newCompleted, dateKey)
          .catch(err => console.error("Error saving meal completion:", err));
      }
    }
    
    return newCompleted;
  };

  // Set up auto-reload when tab becomes visible again
  useEffect(() => {
    if (!user) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user?.sub) {
        console.log('Page became visible, updating data...');
        if (onAfterSave) {
          onAfterSave();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, onAfterSave]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

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