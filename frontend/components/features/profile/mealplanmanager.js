"use client";
import { useState, useEffect, useRef } from 'react';
import { useApiService } from '../../../lib/api-service';
import { toast } from 'react-hot-toast';

export default function MealPlanManager({ 
  user, 
  accessToken,
  initialMealPlan = [],
  onPlanUpdate,
  onPlanLoaded,
  onMealCompletion
}) {
  const { makeAuthenticatedRequest } = useApiService();
  const [activePlanId, setActivePlanId] = useState(null);
  const [userPlans, setUserPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [completedMeals, setCompletedMeals] = useState({});
  const [savingMeals, setSavingMeals] = useState({});
  const autoSaveTimeoutRef = useRef(null);

  const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // API Operations
  const updateMealPlan = async (updatedMealPlan, changeType = 'update', affectedMeals = []) => {
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
      if (!user) {
        toast.error("Please log in to save your meal plan");
        return;
      }
      
      try {
        // Format meals for API
        const formattedMeals = [];
        const today = getTodayDateString();
        
        // Only include today's meals for the profile page
        updatedMealPlan.forEach(meal => {
          if (meal.name) {
            formattedMeals.push({
              date: today,
              mealType: meal.type,
              mealId: meal.id,
              current_day: true
            });
          }
        });
        
        if (formattedMeals.length === 0) {
          // Don't bother saving an empty plan
          return;
        }
        
        // Prepare request data
        const requestData = {
          userId: user.sub,
          planName: `Daily Plan - ${new Date().toLocaleDateString()}`,
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
        }
        
        // Update localStorage to trigger refresh in other components
        localStorage.setItem('mealPlanLastUpdated', new Date().toISOString());
        
        // Show success message for adding/removing meals
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

  const saveMealCompletion = async (mealType, completed) => {
    try {
      await makeAuthenticatedRequest('/user-profile/meal-completion', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.sub,
          date: getTodayDateString(),
          meal_type: mealType,
          completed: completed
        }),
      });
      
      // Update local state
      setCompletedMeals(prev => ({
        ...prev,
        [mealType]: completed
      }));
      
      if (onMealCompletion) {
        onMealCompletion(mealType, completed);
      }
    } catch (error) {
      console.error('Error saving meal completion:', error);
      throw error;
    }
  };

  const loadMealCompletions = async () => {
    try {
      const today = getTodayDateString();
      const completions = await makeAuthenticatedRequest(`/user-profile/meal-completion/${user.sub}/${today}`);
      
      // Update state
      setCompletedMeals(completions);
      
      return completions;
    } catch (error) {
      console.error('Error loading meal completions:', error);
      return {};
    }
  };

  const fetchUserMealPlans = async () => {
    if (!user || !accessToken) return;

    try {
      setIsLoadingPlans(true);
      
      // Load completions FIRST
      const completions = await loadMealCompletions();
      
      // Then load plans
      const userId = user.sub;
      const plans = await makeAuthenticatedRequest(`/api/user-plans/user/${userId}`);
      setUserPlans(plans);
      
      if (plans.length > 0) {
        const sortedPlans = [...plans].sort((a, b) => 
          new Date(b.updated_at) - new Date(a.updated_at)
        );
        await loadPlanToCalendar(sortedPlans[0], completions);
      }
      
    } catch (error) {
      console.error('Error fetching user meal plans:', error);
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const loadPlanToCalendar = async (plan, initialCompletions = {}) => {
    if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
      return;
    }
  
    setActivePlanId(plan.id);
  
    const today = new Date().toISOString().split('T')[0];
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
  
    for (const mealItem of todaysMeals) {
      const { mealType, meal, mealId } = mealItem;
      const recipeId = mealId || (meal && (meal.recipe_id || meal.id));
  
      if (!recipeId) {
        console.error("Invalid meal data for mealType:", mealType);
        continue;
      }
  
      const mealDetails = await makeAuthenticatedRequest(`/mealplan/${recipeId}`);
      const mealIndex = updatedMealPlan.findIndex(m => m.type === mealType);
  
      if (mealIndex !== -1) {
        updatedMealPlan[mealIndex] = {
          ...updatedMealPlan[mealIndex],
          name: mealDetails.title || (meal && meal.title) || "",
          calories: mealDetails.nutrition?.calories || (meal && meal.nutrition?.calories) || 0,
          protein: mealDetails.nutrition?.protein || (meal && meal.nutrition?.protein) || 0,
          carbs: mealDetails.nutrition?.carbs || (meal && meal.nutrition?.carbs) || 0,
          fat: mealDetails.nutrition?.fat || (meal && meal.nutrition?.fat) || 0,
          image: mealDetails.imageUrl || (meal && meal.imageUrl) || "",
          id: recipeId,
          completed: initialCompletions[mealType] || false,
          time: mealItem.time || mealTypeToTime[mealType]
        };
      }
    }
  
    if (onPlanLoaded) {
      onPlanLoaded(updatedMealPlan, completedMeals);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  return {
    activePlanId,
    userPlans,
    isLoadingPlans,
    completedMeals,
    savingMeals,
    updateMealPlan,
    saveMealCompletion,
    loadMealCompletions,
    fetchUserMealPlans,
    loadPlanToCalendar
  };
}