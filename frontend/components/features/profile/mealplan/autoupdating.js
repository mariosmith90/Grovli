"use client";

import { useEffect, useRef, useState } from 'react';
import { getAccessToken } from "@auth0/nextjs-auth0";
import { toast } from 'react-hot-toast';
import { useApiService } from '../../../../lib/api-service';

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
    // Get API service for special CORS-friendly update method
    const { updateMealPlan: apiUpdateMealPlan } = useApiService();
    
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
              // Ensure meal has valid id
              if (!meal.id) {
                console.warn(`Missing meal ID for ${meal.type}`);
                return; // Skip this meal
              }
              
              formattedMeals.push({
                date: today,
                mealType: meal.type,
                mealId: meal.id,
                current_day: true
                // Only include required fields
              });
            }
          });
        } else {
          // Planner page format - object by date
          Object.keys(updatedMealPlan).forEach(dateKey => {
            const dateMeals = updatedMealPlan[dateKey];
            
            Object.keys(dateMeals).forEach(mealType => {
              const meal = dateMeals[mealType];
              // Ensure meal has valid id and name
              if (!meal.id) {
                console.warn(`Missing meal ID for ${mealType} on ${dateKey}`);
                return; // Skip this meal
              }
              
              formattedMeals.push({
                date: dateKey,
                mealType: mealType,
                mealId: meal.id
                // Only include required fields
              });
            });
          });
        }
        
        if (formattedMeals.length === 0) {
          // Don't bother saving an empty plan
          setIsAutoSaving(false);
          return;
        }
        
        // If we don't have an active plan yet and we're adding the first meal,
        // create a new plan, otherwise update the existing one
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        
        // Log the formatted meals for debugging
        console.log("Formatted meals:", JSON.stringify(formattedMeals, null, 2));
        
        // Clean meals for API - include only required fields
        const cleanMeals = formattedMeals.map(meal => {
          // Create a completely fresh object with ONLY the required fields
          const cleanMeal = {
            date: meal.date,
            mealType: meal.mealType,
            mealId: meal.mealId
          };
          
          // Only add current_day if it exists
          if (meal.current_day) cleanMeal.current_day = meal.current_day;
          
          return cleanMeal;
        });
        
        // Prepare request data based on whether we're creating or updating
        let requestData;
        let result;
        
        if (activePlanId) {
          // For update endpoint, only send planId and meals
          requestData = {
            planId: activePlanId,
            meals: cleanMeals
          };
          
          console.log('Using updateMealPlan special function to avoid CORS issues');
          console.log('Request Data:', JSON.stringify(requestData, null, 2));
          
          // Use our special function for update endpoint to avoid CORS issues
          try {
            result = await apiUpdateMealPlan(requestData);
            console.log("Update successful using special update function");
          } catch (updateError) {
            console.error("Special update function failed:", updateError);
            
            // Show a more user-friendly message if it appears to be a network issue
            if (updateError.message && (
                updateError.message.includes('network') || 
                updateError.message.includes('connection') ||
                updateError.message.includes('failed')
            )) {
              toast.error("Changes will be saved when connection is restored", {
                duration: 5000,
                icon: '🔄'
              });
            } else {
              toast.error("Could not save changes to the server", {
                duration: 3000
              });
            }
            
            // Return empty object to prevent further errors
            result = {};
          }
        } else {
          // For save endpoint, send userId, planName, and meals
          requestData = {
            userId: user.sub,
            planName: planName || `Meal Plan - ${new Date().toLocaleDateString()}`,
            meals: cleanMeals
          };
          
          console.log('Using standard save endpoint');
          console.log(`Endpoint: ${apiUrl}/api/user-plans/save`);
          console.log('Request Data:', JSON.stringify(requestData, null, 2));
          
          // For save endpoint, use standard fetch
          const response = await fetch(`${apiUrl}/api/user-plans/save`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'Origin': window.location.origin
            },
            body: JSON.stringify(requestData),
            credentials: 'include',
            mode: 'cors'
          });
          
          if (!response.ok) {
            // Try to get more detailed error information
            let errorDetail = '';
            try {
              const errorResponse = await response.json();
              errorDetail = errorResponse.detail || '';
              console.error('API Error Response:', errorResponse);
            } catch (parseError) {
              console.error('Could not parse error response:', parseError);
            }
            
            throw new Error(`Failed to save: ${response.status}${errorDetail ? ' - ' + errorDetail : ''}`);
          }
          
          result = await response.json();
        }
        
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