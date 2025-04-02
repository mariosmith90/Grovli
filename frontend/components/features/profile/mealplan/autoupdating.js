"use client";

import { useEffect, useRef, useState } from 'react';
import { getAccessToken } from "@auth0/nextjs-auth0";
import { toast } from 'react-hot-toast';

/**
 * AutoUpdatingComponent provides common functionality for meal plan auto-updating and auto-deletion
 * to be shared between the profile page and planner page.
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
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimeoutRef = useRef(null);

  // Helper function to format date as YYYY-MM-DD
  const formatDateKey = (date) => {
    if (typeof date === 'string') return date;
    return date.toISOString().split('T')[0];
  };

  // Get today's date in YYYY-MM-DD format
  const getTodayDateString = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Add a meal to the plan
  const addMealToPlan = (meal, mealType, date = new Date()) => {
    const dateKey = formatDateKey(date);
    
    // Mark meal as being processed
    setSavingMeals(prev => ({
      ...prev,
      [`${dateKey}-${mealType}`]: true
    }));
    
    try {
      // If we have the array-based meal plan (profile page)
      if (Array.isArray(mealPlan)) {
        const mealIndex = mealPlan.findIndex(m => m.type === mealType);
        if (mealIndex !== -1) {
          const updatedMealPlan = [...mealPlan];
          updatedMealPlan[mealIndex] = {
            ...updatedMealPlan[mealIndex],
            name: meal.name,
            title: meal.title || meal.name, // Ensure title is present for compatibility
            calories: meal.calories,
            protein: meal.protein,
            carbs: meal.carbs,
            fat: meal.fat,
            image: meal.image,
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
        
        // Add the meal to this date
        updatedMealPlan[dateKey][mealType] = {
          ...meal,
          // Ensure both name and title are present
          name: meal.name || meal.title || "Unnamed Meal",
          title: meal.title || meal.name || "Unnamed Meal"
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

  // Remove meal from view (not from database)
  const removeMealFromView = (date, mealType) => {
    const dateKey = typeof date === 'string' ? date : formatDateKey(date);
    
    // Mark meal as being processed
    setSavingMeals(prev => ({
      ...prev,
      [`${dateKey}-${mealType}`]: true
    }));
    
    try {
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
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            image: '',
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

  // Create or update a meal plan
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
        
        // Try to get token from various sources
        let accessToken;
        
        // First try window.latestAuthToken which might be more up-to-date
        if (typeof window !== 'undefined' && window.latestAuthToken) {
          console.log("AutoUpdater: Using token from window.latestAuthToken");
          accessToken = window.latestAuthToken;
        }
        // Then try window.__auth0_token
        else if (typeof window !== 'undefined' && window.__auth0_token) {
          console.log("AutoUpdater: Using token from window.__auth0_token");
          accessToken = window.__auth0_token;
        }
        // Then try localStorage
        else if (typeof window !== 'undefined' && localStorage.getItem('accessToken')) {
          console.log("AutoUpdater: Using token from localStorage");
          accessToken = localStorage.getItem('accessToken');
        }
        // Finally, get a fresh token from Auth0 as last resort
        else {
          console.log("AutoUpdater: Getting fresh token from Auth0");
          accessToken = await getAccessToken({
            authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
          });
          
          // Save to all locations
          if (accessToken && typeof window !== 'undefined') {
            window.__auth0_token = accessToken;
            window.latestAuthToken = accessToken;
            localStorage.setItem('accessToken', accessToken);
            console.log("AutoUpdater: Saved fresh token to all locations");
          }
        }
        
        // Format meals for API
        const formattedMeals = [];
        
        // This handles both profile page format (array of meal objects) and planner page format (object by date)
        if (Array.isArray(updatedMealPlan)) {
          // Profile page format - array of meals for today
          const today = getTodayDateString();
          
          updatedMealPlan.forEach(meal => {
            if (meal.name) {
              formattedMeals.push({
                date: today,
                mealType: meal.type,
                mealId: meal.id,
                current_day: true,
                meal_name: meal.name || meal.title || "Unnamed Meal" // Add the meal name to ensure it's preserved
              });
            }
          });
        } else {
          // Planner page format - object by date
          Object.keys(updatedMealPlan).forEach(dateKey => {
            const dateMeals = updatedMealPlan[dateKey];
            
            Object.keys(dateMeals).forEach(mealType => {
              const meal = dateMeals[mealType];
              formattedMeals.push({
                date: dateKey,
                mealType: mealType,
                mealId: meal.id,
                meal_name: meal.name || meal.title || "Unnamed Meal" // Add the meal name to ensure it's preserved
              });
            });
          });
        }
        
        if (formattedMeals.length === 0) {
          // Don't bother saving an empty plan
          setIsAutoSaving(false);
          return;
        }
        
        // Prepare request data
        const requestData = {
          userId: user.sub,
          planName: planName || `Meal Plan - ${new Date().toLocaleDateString()}`,
          meals: formattedMeals
        };
        
        // If we don't have an active plan yet and we're adding the first meal,
        // create a new plan, otherwise update the existing one
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const endpoint = activePlanId 
          ? `${apiUrl}/api/user-plans/update`
          : `${apiUrl}/api/user-plans/save`;
        
        // Add planId if updating
        if (activePlanId) {
          requestData.planId = activePlanId;
        }
        
        // API request
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
          throw new Error(`Failed to save: ${response.status}`);
        }
        
        const result = await response.json();
        
        // If it was a new plan, update the activePlanId
        if (!activePlanId && result.id) {
          setActivePlanId(result.id);
          if (setPlanName) {
            setPlanName(result.name);
          }
        }
        
        // Update localStorage to trigger refresh in other components
        localStorage.setItem('mealPlanLastUpdated', new Date().toISOString());
        
        // Show success message for adding/removing meals
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

  // Note: duplicateDayMeals has been removed from this component as it's specific to the planner page

  // Toggle meal completion status
  const toggleMealCompletion = (mealType, date = new Date()) => {
    const dateKey = formatDateKey(date);
    
    // For profile page (array-based meal plan)
    if (Array.isArray(mealPlan)) {
      const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
      if (mealIndex === -1) return;
      
      const currentCompleted = mealPlan[mealIndex].completed;
      const newCompleted = !currentCompleted;
      
      const updatedMealPlan = [...mealPlan];
      updatedMealPlan[mealIndex] = {
        ...updatedMealPlan[mealIndex],
        completed: newCompleted
      };
      
      setMealPlan(updatedMealPlan);
      
      // Update through the normal plan update mechanism
      updateMealPlan(updatedMealPlan, 'update', [{ dateKey, mealType }]);
      
      return newCompleted;
    }
    // For planner page (object-based meal plan)
    else if (typeof mealPlan === 'object' && mealPlan[dateKey]?.[mealType]) {
      const currentCompleted = mealPlan[dateKey][mealType].completed || false;
      const newCompleted = !currentCompleted;
      
      const updatedMealPlan = { ...mealPlan };
      updatedMealPlan[dateKey][mealType] = {
        ...updatedMealPlan[dateKey][mealType],
        completed: newCompleted
      };
      
      setMealPlan(updatedMealPlan);
      
      // Update through the normal plan update mechanism
      updateMealPlan(updatedMealPlan, 'update', [{ dateKey, mealType }]);
      
      return newCompleted;
    }
    
    return false;
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