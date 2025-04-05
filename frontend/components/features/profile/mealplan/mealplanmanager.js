"use client";
import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { useApiGet, useApiMutation } from '../../../../lib/swr-client';

export default function MealPlanManager({ 
  user, 
  accessToken,
  initialMealPlan = [],
  onPlanUpdate,
  onPlanLoaded,
  onMealCompletion
}) {
  // Component state
  const [activePlanId, setActivePlanId] = useState(null);
  const [userPlans, setUserPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [completedMeals, setCompletedMeals] = useState({});
  const [savingMeals, setSavingMeals] = useState({});
  const autoSaveTimeoutRef = useRef(null);

  // Use SWR mutations (IMPORTANT: all hook calls at the component level)
  const apiMutation = useApiMutation();

  // Get user ID safely
  const userId = user?.sub;
  const today = getTodayDateString();

  // Fetch user's meal plans with SWR
  const { 
    data: fetchedUserPlans,
    error: userPlansError,
    mutate: mutatePlans
  } = useApiGet(
    userId ? `/api/user-plans/user/${userId}` : null,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      onSuccess: (data) => {
        if (data && Array.isArray(data)) {
          setUserPlans(data);
          setIsLoadingPlans(false);
          
          // If we have plans but no active plan, use the most recent one
          if (data.length > 0 && !activePlanId) {
            const sortedPlans = [...data].sort((a, b) => 
              new Date(b.updated_at) - new Date(a.updated_at)
            );
            const newestPlan = sortedPlans[0];
            setActivePlanId(newestPlan.id);
            
            // Load today's meals from this plan
            loadPlanToCalendar(newestPlan);
          }
        }
      },
      onError: (error) => {
        console.error("Error fetching user plans:", error);
        setIsLoadingPlans(false);
      }
    }
  );

  // Fetch active plan details with SWR when we have an ID
  const { 
    data: activePlanData,
    error: activePlanError,
    mutate: mutateActivePlan
  } = useApiGet(
    activePlanId ? `/api/user-plans/${activePlanId}` : null,
    {
      revalidateOnFocus: false,
      onSuccess: (planData) => {
        if (planData && planData.meals) {
          console.log("Active plan loaded:", planData.id);
        }
      }
    }
  );

  // Fetch meal completions for today
  const {
    data: completionData,
    error: completionError,
    mutate: mutateCompletions
  } = useApiGet(
    userId && today ? `/user-profile/meal-completion/${userId}/${today}` : null,
    {
      revalidateOnFocus: false,
      onSuccess: (data) => {
        if (data) {
          setCompletedMeals(data);
        }
      }
    }
  );

  // Helper for date formatting
  function getTodayDateString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  // Update meal plan with debounced autosave
  const updateMealPlan = async (updatedMealPlan, changeType = 'update', affectedMeals = []) => {
    // Call onPlanUpdate callback if provided
    if (onPlanUpdate) {
      onPlanUpdate(updatedMealPlan);
    }
    
    // Mark the affected meals as saving
    const newSavingState = {};
    affectedMeals.forEach(meal => {
      newSavingState[`${meal.dateKey}-${meal.mealType}`] = true;
    });
    setSavingMeals(prev => ({ ...prev, ...newSavingState }));
    
    // Clear any existing timeout to prevent multiple saves
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Set a short delay before auto-saving to avoid rapid successive saves
    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (!userId) {
        toast.error("Please log in to save your meal plan");
        return;
      }
      
      try {
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
          return;
        }

        // Prepare request data
        let result;
        
        if (activePlanId) {
          // For existing plans, use updateMealPlan
          const updateData = {
            planId: activePlanId,
            meals: formattedMeals
          };
          
          // Use SWR mutation hook to send the update
          result = await apiMutation.updateMealPlan(updateData, { 
            userId
          });
        } else {
          // For new plans, create a new one
          const newPlanData = {
            userId,
            planName: `Daily Plan - ${new Date().toLocaleDateString()}`,
            meals: formattedMeals
          };
          
          // Use SWR mutation to create the plan
          result = await apiMutation.post('/api/user-plans/save', newPlanData, {
            invalidateUrls: [
              '/api/user-plans',
              `/api/user-plans/user/${userId}`
            ]
          });
        }
        
        // If it was a new plan, update the activePlanId
        if (!activePlanId && result && result.id) {
          setActivePlanId(result.id);
        }
        
        // Invalidate cached data to refresh views
        if (userId) {
          mutatePlans();
          
          if (activePlanId) {
            mutateActivePlan();
          }
        }
        
        // Show success message for specific actions
        if (changeType === 'add') {
          toast.success("Meal added to plan");
        } else if (changeType === 'remove') {
          toast.success("Meal removed from plan");
        }
        
      } catch (error) {
        console.error('Error auto-saving meal plan:', error);
        toast.error("Failed to save changes");
      } finally {
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

  // Save meal completion status
  const saveMealCompletion = async (mealType, completed) => {
    try {
      // Update local state immediately for UI feedback (optimistic update)
      const previousState = { ...completedMeals };
      
      // Update local state
      setCompletedMeals(prev => ({
        ...prev,
        [mealType]: completed
      }));
      
      // Call the callback immediately for optimistic UI update
      if (onMealCompletion) {
        onMealCompletion(mealType, completed);
      }
      
      // Save to API using SWR mutation
      await apiMutation.saveMealCompletion(userId, mealType, completed);
      
      // Trigger SWR revalidation after successful save
      mutateCompletions();
    } catch (error) {
      console.error('Error saving meal completion:', error);
      
      // Revert to previous state on error
      setCompletedMeals(prev => ({ ...prev, [mealType]: !completed }));
      
      // Call callback with reverted state
      if (onMealCompletion) {
        onMealCompletion(mealType, !completed);
      }
      
      throw error;
    }
  };

  // Fetch meal details for a recipe ID - using SWR pattern
  const fetchMealDetails = async (recipeId) => {
    if (!recipeId) return null;
    
    try {
      // Using SWR's mutation with a consistent key for caching
      const mealDetailKey = `/mealplan/${recipeId}`;
      
      // Prefetch and cache in one step following SWR patterns
      const result = await apiMutation.trigger(mealDetailKey, { 
        method: 'GET',
        // These parameters tell SWR to update its cache
        invalidateUrls: []
      });
      
      return result.data || null;
    } catch (error) {
      console.error(`Error fetching meal details for ${recipeId}:`, error);
      return null;
    }
  };

  // Load plan data into the calendar
  const loadPlanToCalendar = async (plan, initialCompletions = {}) => {
    if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
      return;
    }
  
    setActivePlanId(plan.id);
  
    const today = getTodayDateString();
    const todaysMeals = plan.meals.filter(mealItem => mealItem.date === today || mealItem.current_day === true);
  
    if (todaysMeals.length === 0) {
      console.log("No meals planned for today");
      return;
    }
  
    const updatedMealPlan = [...initialMealPlan];
    const mealTypeToTime = {
      breakfast: '8:00 AM',
      lunch: '12:30 PM',
      snack: '3:30 PM',
      dinner: '7:00 PM'
    };
    
    // Merge completion data from multiple sources with priority
    // 1. API completion data (completionData)
    // 2. Provided initial completions 
    // 3. Default to false
    const mergedCompletions = {
      ...initialCompletions,
      ...completionData
    };
    
    // Update local completion state
    if (Object.keys(mergedCompletions).length > 0) {
      setCompletedMeals(mergedCompletions);
    }
  
    // For each meal in today's plan, fetch details and update the meal plan
    for (const mealItem of todaysMeals) {
      const { mealType, meal, mealId } = mealItem;
      const recipeId = mealId || (meal && (meal.recipe_id || meal.id));
      
      if (!recipeId) {
        console.error("Invalid meal data for mealType:", mealType);
        continue;
      }
      
      try {
        // Check if we already have the meal details in the meal object
        if (meal && meal.title) {
          const mealIndex = updatedMealPlan.findIndex(m => m.type === mealType);
          
          if (mealIndex !== -1) {
            // Use the saved meal data directly with proper completion status
            const isCompleted = mergedCompletions[mealType] === true;
            
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
              recipe_id: meal.recipe_id || recipeId,
              id: recipeId,
              completed: isCompleted,
              time: mealItem.time || mealTypeToTime[mealType]
            };
          }
        } else {
          // Fetch from SWR as we don't have the data
          const { data: mealDetails } = await apiMutation.trigger(`/mealplan/${recipeId}`, { 
            method: 'GET',
            // Add to SWR cache for future requests
            cacheKey: `/mealplan/${recipeId}`
          });
          
          if (mealDetails) {
            const mealIndex = updatedMealPlan.findIndex(m => m.type === mealType);
            
            if (mealIndex !== -1) {
              // Use freshly fetched data with proper completion status
              const isCompleted = mergedCompletions[mealType] === true;
              
              updatedMealPlan[mealIndex] = {
                ...updatedMealPlan[mealIndex],
                name: mealDetails.title || mealDetails.name || "",
                title: mealDetails.title || mealDetails.name || "",
                type: mealType,
                meal_type: mealType,
                nutrition: mealDetails.nutrition || {
                  calories: 0,
                  protein: 0,
                  carbs: 0,
                  fat: 0
                },
                image: mealDetails.imageUrl || mealDetails.image || "",
                imageUrl: mealDetails.imageUrl || mealDetails.image || "",
                recipe_id: mealDetails.recipe_id || recipeId,
                id: recipeId,
                completed: isCompleted,
                time: mealItem.time || mealTypeToTime[mealType]
              };
            }
          }
        }
      } catch (error) {
        console.error(`Error processing meal ${recipeId} for ${mealType}:`, error);
      }
    }
    
    // Call the callback with the updated plan and completion data
    if (onPlanLoaded) {
      onPlanLoaded(updatedMealPlan, mergedCompletions);
    }
  };

  // Initialize meal plan on component mount
  useEffect(() => {
    if (userId && fetchedUserPlans && fetchedUserPlans.length > 0 && completionData) {
      // When both data sources are available, initialize
      if (!activePlanId) {
        const sortedPlans = [...fetchedUserPlans].sort((a, b) => 
          new Date(b.updated_at) - new Date(a.updated_at)
        );
        
        // Load the most recent plan
        loadPlanToCalendar(sortedPlans[0], completionData);
      }
    }
  }, [userId, fetchedUserPlans, completionData]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Return functions and state for use in parent component
  return {
    activePlanId,
    userPlans: userPlans || fetchedUserPlans || [],
    isLoadingPlans,
    completedMeals: completedMeals || completionData || {},
    savingMeals,
    updateMealPlan,
    saveMealCompletion,
    // Use SWR's mutate function directly instead of fetchUserMealPlans
    refreshUserMealPlans: () => mutatePlans(),
    loadPlanToCalendar
  };
}