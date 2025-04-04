"use client";

import { useProfileStore, getTodayDateString } from '../stores/profileStore';
import { getAuthState } from '../stores/authStore';

/**
 * A service layer for handling profile-related API calls
 * This separates data fetching from UI components
 */

// Helper to get authenticated API service
const getApiService = () => {
  // Access auth state directly - not in a component context
  const authState = getAuthState();
  const headers = authState.getAuthHeaders();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  
  // Return minimal API for making authenticated requests
  return {
    async makeRequest(endpoint, options = {}) {
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        console.log(`ProfileService making request to: ${apiUrl}${endpoint}`);
        console.log(`With options:`, JSON.stringify({
          method: options.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Origin': origin,
            ...headers
          }
        }, null, 2));
        
        // Special handling for update endpoints
        const isUpdateEndpoint = endpoint.includes('update');
        let requestInit = {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Origin': origin,
            ...headers,
            ...(options.headers || {})
          }
        };
        
        let response;
        
        if (isUpdateEndpoint) {
          console.log("Using special CORS configuration for update endpoint");
          response = await fetch(`${apiUrl}${endpoint}`, {
            ...requestInit,
            mode: 'cors',
            // Don't use credentials for update endpoints
            credentials: undefined
          });
        } else {
          response = await fetch(`${apiUrl}${endpoint}`, {
            ...requestInit,
            credentials: 'include',
            mode: 'cors'
          });
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API error ${response.status}: ${errorText}`);
          
          // Try one more approach for update endpoints with CORS errors
          if (isUpdateEndpoint && (response.status === 0 || response.status === 500)) {
            console.log("Trying fallback approach for update endpoint");
            
            // Final fallback for update endpoints - simplest possible fetch
            const fallbackResponse = await fetch(`${apiUrl}${endpoint}`, {
              ...options,
              headers: {
                'Content-Type': 'application/json',
                ...headers,
                ...(options.headers || {})
              }
            });
            
            if (!fallbackResponse.ok) {
              const fallbackErrorText = await fallbackResponse.text();
              console.error(`Fallback API error ${fallbackResponse.status}: ${fallbackErrorText}`);
              throw new Error(`API error: ${fallbackResponse.status}`);
            }
            
            try {
              return await fallbackResponse.json();
            } catch (jsonError) {
              console.log("Fallback response was not JSON, returning empty object");
              return {};
            }
          }
          
          throw new Error(`API error: ${response.status}`);
        }
        
        // Try to parse as JSON, but handle non-JSON responses too
        try {
          return await response.json();
        } catch (jsonError) {
          console.log("Response was not JSON, returning empty object");
          return {};
        }
      } catch (error) {
        console.error(`Request failed: ${error.message}`);
        throw error;
      }
    }
  };
};

// Save a meal completion status to the API
export const saveMealCompletion = async (userId, mealType, completed) => {
  if (!userId) return null;
  
  const apiService = getApiService();
  const today = getTodayDateString();
  
  try {
    return await apiService.makeRequest('/user-profile/meal-completion', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        date: today,
        meal_type: mealType,
        completed: completed
      }),
    });
  } catch (error) {
    console.error('Error saving meal completion:', error);
    throw error;
  }
};

// Load meal completions from the API
export const loadMealCompletions = async (userId) => {
  if (!userId) return {};
  
  const apiService = getApiService();
  const today = getTodayDateString();
  
  try {
    console.log(`Loading meal completions for ${userId} on ${today}`);
    
    // Get completions from API
    const completions = await apiService.makeRequest(`/user-profile/meal-completion/${userId}/${today}`);
    console.log("Loaded meal completions:", completions);
    
    // Update the store
    const profileStore = useProfileStore.getState();
    profileStore.setCompletedMeals(completions);
    
    // Also update meal plan with completion statuses
    const { mealPlan } = profileStore;
    const updatedMealPlan = mealPlan.map(meal => ({
      ...meal,
      completed: completions[meal.type] || false
    }));
    profileStore.setMealPlan(updatedMealPlan);
    
    return completions;
  } catch (error) {
    console.error('Error loading meal completions:', error);
    return {};
  }
};

// Fetch user meal plans from the API
export const fetchUserMealPlans = async (userId) => {
  if (!userId) return null;
  
  const apiService = getApiService();
  const profileStore = useProfileStore.getState();
  
  try {
    console.log("Starting fetchUserMealPlans");
    profileStore.setIsLoadingPlans(true);
    profileStore.setIsDataReady(false);
    
    // Load completions first
    console.log("Loading meal completions for user:", userId);
    const completions = await loadMealCompletions(userId);
    
    // Then load plans
    console.log("Fetching meal plans for user:", userId);
    let plans;
    
    try {
      plans = await apiService.makeRequest(`/api/user-plans/user/${userId}`);
      console.log("Plans API response:", plans);
      
      if (!Array.isArray(plans)) {
        console.warn("API did not return an array of plans, using empty array");
        plans = [];
      }
    } catch (apiError) {
      console.error("API error fetching plans:", apiError);
      plans = [];
    }
    
    // Check for null plans
    if (!plans) {
      console.log("No plans returned from API");
      profileStore.setUserPlans([]);
      profileStore.setIsDataReady(true);
      return null;
    }
    
    console.log(`Retrieved ${plans.length} meal plans`);
    profileStore.setUserPlans(plans);
    
    // If we have plans, load the latest one
    if (plans.length > 0) {
      const sortedPlans = [...plans].sort((a, b) => 
        new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      );
      
      console.log("Loading latest plan to calendar:", sortedPlans[0]?.id);
      
      // Only proceed if we have a valid plan object
      if (sortedPlans[0] && typeof sortedPlans[0] === 'object') {
        await loadPlanToCalendar(sortedPlans[0], completions);
      } else {
        console.error("Invalid plan object:", sortedPlans[0]);
        profileStore.setIsDataReady(true);
      }
    } else {
      console.log("No meal plans found for user");
      profileStore.setIsDataReady(true);
    }
    
    return plans;
  } catch (error) {
    console.error('Error fetching user meal plans:', error);
    
    // Update store on error
    profileStore.setUserPlans([]);
    
    return null;
  } finally {
    // Always update these states no matter what
    profileStore.setIsLoadingPlans(false);
    profileStore.setIsDataReady(true);
  }
};

// Load a plan to the calendar
export const loadPlanToCalendar = async (plan, initialCompletions = {}) => {
  if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
    return null;
  }
  
  const apiService = getApiService();
  const profileStore = useProfileStore.getState();
  
  // Get the plan structure from the store
  const { todaysMeals, updatedMealPlan, mealTypeToTime } = 
    profileStore.setActivePlanWithMeals(plan, initialCompletions);
  
  // Handle no meals case
  if (!todaysMeals || todaysMeals.length === 0) {
    return null;
  }
  
  // Process each meal
  for (const mealItem of todaysMeals) {
    const { mealType, meal, mealId } = mealItem;
    const recipeId = mealId || (meal && (meal.recipe_id || meal.id));
    
    if (!recipeId) {
      console.error("Invalid meal data for mealType:", mealType);
      continue;
    }
    
    try {
      // Fetch meal details
      const mealDetails = await apiService.makeRequest(`/mealplan/${recipeId}`);
      
      // Find matching meal in plan
      const mealIndex = updatedMealPlan.findIndex(m => m.type === mealType);
      
      if (mealIndex !== -1) {
        // Log the full response for debugging
        console.log(`Full mealItem for ${mealType}:`, JSON.stringify(mealItem, null, 2));
        console.log(`Full mealDetails for ${mealType}:`, JSON.stringify(mealDetails, null, 2));
        
        // Get name safely
        const mealName = mealDetails?.title || mealDetails?.name;
        console.log(`Using direct meal name for ${mealType}:`, mealName);
        
        // Update meal plan entry with safe defaults
        updatedMealPlan[mealIndex] = {
          ...updatedMealPlan[mealIndex],
          name: mealName || "Unnamed Meal",
          title: mealName || "Unnamed Meal",
          calories: mealDetails?.nutrition?.calories || (meal && meal?.nutrition?.calories) || 0,
          protein: mealDetails?.nutrition?.protein || (meal && meal?.nutrition?.protein) || 0,
          carbs: mealDetails?.nutrition?.carbs || (meal && meal?.nutrition?.carbs) || 0,
          fat: mealDetails?.nutrition?.fat || (meal && meal?.nutrition?.fat) || 0,
          image: mealDetails?.imageUrl || (meal && meal?.imageUrl) || "",
          id: recipeId,
          completed: initialCompletions[mealType] || false,
          time: mealItem.time || mealTypeToTime[mealType]
        };
      }
    } catch (error) {
      console.error(`Error fetching meal details for ${mealType}:`, error);
    }
  }
  
  // Update the store with the completed meal plan
  profileStore.setMealPlan(updatedMealPlan);
  
  // Update current and next meal info
  const indices = profileStore.getUpdatedMealIndices();
  profileStore.setCurrentMealIndex(indices.currentMealIndex);
  
  // Update next meal card if valid
  const nextIndex = indices.nextMealIndex;
  if (nextIndex >= 0 && nextIndex < updatedMealPlan.length) {
    profileStore.updateNextMealCard(updatedMealPlan[nextIndex]);
  }
  
  // Recalculate calorie counts
  profileStore.updateCalorieCount();
  
  return updatedMealPlan;
};

// Load data for a specific date
export const loadDataForDate = async (date, userId) => {
  if (!userId) return null;
  
  const profileStore = useProfileStore.getState();
  const { userPlans, activePlanId, mealPlan } = profileStore;
  
  try {
    const dateString = date.toISOString().split('T')[0];
    
    // If we have a loaded plan, filter for the selected date
    if (userPlans.length > 0 && activePlanId) {
      const activePlan = userPlans.find(plan => plan.id === activePlanId);
      
      if (activePlan) {
        // Get meals for the selected date
        const dateMeals = activePlan.meals.filter(meal => meal.date === dateString);
        
        // Start with existing meal plan
        const updatedMealPlan = [...mealPlan];
        
        // Reset all meals to default
        updatedMealPlan.forEach(meal => {
          meal.name = '';
          meal.calories = 0;
          meal.protein = 0;
          meal.carbs = 0;
          meal.fat = 0;
          meal.image = '';
          meal.completed = false;
          meal.id = null;
        });
        
        // Log raw data for debugging
        console.log("Raw dateMeals data:", JSON.stringify(dateMeals, null, 2));
        
        // Update with date's meals
        for (const mealItem of dateMeals) {
          const { mealType, meal } = mealItem;
          const mealIndex = updatedMealPlan.findIndex(m => m.type === mealType);
          
          // Log full meal item for debugging
          console.log(`Full mealItem for ${mealType}:`, JSON.stringify(mealItem, null, 2));
          
          if (mealIndex !== -1 && meal) {
            // Use the meal name with fallbacks
            const mealName = meal.title || meal.name;
            console.log(`Using direct meal name for ${mealType}:`, mealName);
            
            // Update the meal
            updatedMealPlan[mealIndex] = {
              ...updatedMealPlan[mealIndex],
              name: mealName || "Unnamed Meal",
              title: mealName || "Unnamed Meal",
              calories: meal.calories || meal.nutrition?.calories || 0,
              protein: meal.protein || meal.nutrition?.protein || 0,
              carbs: meal.carbs || meal.nutrition?.carbs || 0,
              fat: meal.fat || meal.nutrition?.fat || 0,
              image: meal.image || meal.imageUrl || "",
              id: meal.id,
              completed: dateString === getTodayDateString() ? 
                (profileStore.completedMeals[mealType] || false) : false
            };
          }
        }
        
        // Update the store
        profileStore.setMealPlan(updatedMealPlan);
        
        // For today, load completions; otherwise clear them
        if (dateString === getTodayDateString()) {
          await loadMealCompletions(userId);
        } else {
          profileStore.setCompletedMeals({});
        }
        
        // Update indices and calorie counts
        const { currentMealIndex, nextMealIndex } = profileStore.getUpdatedMealIndices();
        profileStore.setCurrentMealIndex(currentMealIndex);
        
        if (nextMealIndex >= 0 && nextMealIndex < updatedMealPlan.length) {
          profileStore.updateNextMealCard(updatedMealPlan[nextMealIndex]);
        }
        
        profileStore.updateCalorieCount();
        
        return updatedMealPlan;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error loading data for date:', error);
    return null;
  }
};

// Fetch saved meals for a specific type
export const fetchSavedMeals = async (mealType) => {
  if (!mealType) return [];
  
  const apiService = getApiService();
  const profileStore = useProfileStore.getState();
  
  // Show loading state
  profileStore.setIsLoadingSavedMeals(true);
  
  try {
    console.log(`Fetching saved meals for ${mealType}...`);
    
    // Fetch saved recipes
    const data = await apiService.makeRequest('/api/user-recipes/saved-recipes/');
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.log('No saved recipes data available');
      return [];
    }
    
    console.log(`Received saved recipes data:`, data);
    
    // Start with existing saved meals
    const categorizedMeals = { ...profileStore.savedMeals };
    const addedMealNames = new Set();
    
    // Clear existing meals for this type
    categorizedMeals[mealType] = [];
    
    // Process each plan
    for (const plan of data) {
      if (!plan.recipes || !Array.isArray(plan.recipes)) {
        console.warn('Plan has no recipes array:', plan);
        continue;
      }
      
      // Process each recipe in the plan
      for (const recipe of plan.recipes) {
        // Skip duplicates
        if (addedMealNames.has(recipe.title)) continue;
        
        // Determine meal category
        const recipeMealType = (recipe.meal_type || '').toLowerCase();
        const category = ['breakfast', 'lunch', 'dinner', 'snack'].includes(recipeMealType) 
          ? recipeMealType : 'snack';
          
        // Only process recipes for the requested type
        if (category !== mealType) continue;
        
        try {
          // Fetch details for this meal
          console.log(`Fetching details for meal ${recipe.title} (${recipe.recipe_id})`);
          const mealDetails = await apiService.makeRequest(`/mealplan/${recipe.recipe_id}`);
          console.log(`Meal details for ${recipe.title}:`, mealDetails);
          
          // Format the meal data
          const formattedMeal = {
            id: recipe.recipe_id,
            name: mealDetails.title || recipe.title || "Unnamed Meal",
            calories: mealDetails.nutrition?.calories || 0,
            protein: mealDetails.nutrition?.protein || 0,
            carbs: mealDetails.nutrition?.carbs || 0,
            fat: mealDetails.nutrition?.fat || 0,
            image: mealDetails.imageUrl || recipe.imageUrl || "",
            ingredients: mealDetails.ingredients || [],
            instructions: mealDetails.instructions || ''
          };
          
          // Ensure the category exists
          if (!categorizedMeals[category]) {
            categorizedMeals[category] = [];
          }
          
          // Add to the appropriate category
          categorizedMeals[category].push(formattedMeal);
          addedMealNames.add(recipe.title);
        } catch (detailError) {
          console.error(`Error fetching details for meal ${recipe.title}:`, detailError);
        }
      }
    }
    
    console.log(`Setting saved meals for ${mealType}:`, categorizedMeals[mealType]);
    
    // Update the store
    profileStore.setSavedMeals(categorizedMeals);
    
    return categorizedMeals[mealType];
  } catch (error) {
    console.error('Error fetching saved meals:', error);
    return [];
  } finally {
    // Clear loading state
    profileStore.setIsLoadingSavedMeals(false);
  }
};

// Load user settings from API
export const loadUserSettings = async (userId) => {
  if (!userId) return null;
  
  const apiService = getApiService();
  const profileStore = useProfileStore.getState();
  
  try {
    console.log("Fetching user settings from server");
    const serverSettings = await apiService.makeRequest(`/user-settings/${userId}`);
    
    console.log("Received server settings:", serverSettings);
    
    // Update store
    profileStore.setGlobalSettings(serverSettings);
    profileStore.setCalorieData({
      ...profileStore.calorieData,
      target: serverSettings.calories || 2000
    });
    
    return serverSettings;
  } catch (error) {
    console.error("Error fetching user settings:", error);
    return null;
  }
};