"use client";

import { useMealPlanStore, getTodayDateString } from '../stores/mealPlanStore';
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

// DEPRECATED: This function is deprecated - use useApiGet from swr-client.js instead
export const loadMealCompletions = async (userId) => {
  console.warn("DEPRECATED: loadMealCompletions is deprecated. Use useApiGet from swr-client.js instead.");
  if (!userId) return {};
  
  const apiService = getApiService();
  const today = getTodayDateString();
  
  try {
    // Get completions from API
    const completions = await apiService.makeRequest(`/user-profile/meal-completion/${userId}/${today}`);
    
    // Update the Zustand store
    const mealPlanStore = useMealPlanStore.getState();
    mealPlanStore.setCompletedMeals(completions);
    
    // Also update profileMeals with completion statuses
    const { profileMeals } = mealPlanStore;
    const updatedMealPlan = profileMeals.map(meal => ({
      ...meal,
      completed: completions[meal.type] || false
    }));
    mealPlanStore.setProfileMeals(updatedMealPlan);
    
    return completions;
  } catch (error) {
    console.error('Error loading meal completions:', error);
    return {};
  }
};

// This function is deprecated - use SWR hooks for fetching meal plans
export const fetchUserMealPlans = async (userId) => {
  console.warn("DEPRECATED: fetchUserMealPlans is deprecated. Use useApiGet from swr-client.js instead.");
  if (!userId) return null;
  
  const apiService = getApiService();
  const mealPlanStore = useMealPlanStore.getState();
  
  try {
    mealPlanStore.setIsLoading(true);
    
    // Load completions first
    const completions = await loadMealCompletions(userId);
    
    // Then load plans
    let plans;
    
    try {
      plans = await apiService.makeRequest(`/api/user-plans/user/${userId}`);
      
      if (!Array.isArray(plans)) {
        console.warn("API did not return an array of plans, using empty array");
        plans = [];
      }
    } catch (apiError) {
      console.error("API error fetching plans:", apiError);
      plans = [];
    }
    
    // If we have plans, load the latest one
    if (plans.length > 0) {
      const sortedPlans = [...plans].sort((a, b) => 
        new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      );
      
      // Only proceed if we have a valid plan object
      if (sortedPlans[0] && typeof sortedPlans[0] === 'object') {
        await loadPlanToCalendar(sortedPlans[0], completions);
      } 
    }
    
    return plans;
  } catch (error) {
    console.error('Error fetching user meal plans:', error);
    return null;
  } finally {
    mealPlanStore.setIsLoading(false);
  }
};

// Load a plan to the calendar
export const loadPlanToCalendar = async (plan, initialCompletions = {}) => {
  if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
    return null;
  }
  
  const apiService = getApiService();
  const mealPlanStore = useMealPlanStore.getState();
  
  // Set active plan in the Zustand store
  mealPlanStore.setActivePlanId(plan.id);
  mealPlanStore.setPlanName(plan.name || "My Meal Plan");
  
  // Default meal type to time mapping
  const mealTypeToTime = {
    breakfast: '8:00 AM',
    lunch: '12:30 PM',
    snack: '3:30 PM',
    dinner: '7:00 PM'
  };
  
  // Get today's date
  const today = getTodayDateString();
  
  // Filter for today's meals
  const todaysMeals = plan.meals.filter(mealItem => 
    mealItem.date === today || mealItem.current_day === true
  );
  
  // Create updated meal plan based on default structure
  const updatedMealPlan = mealPlanStore.profileMeals.map(meal => ({
    ...meal,
    completed: initialCompletions[meal.type] || false
  }));
  
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
        // Get name safely
        const mealName = mealDetails?.title || mealDetails?.name;
        
        // Prepare the meal object with all needed properties
        const normalizedMeal = {
          id: recipeId,
          mealId: recipeId,
          name: mealName,
          title: mealName,
          nutrition: {
            calories: mealDetails?.nutrition?.calories || (meal && meal?.nutrition?.calories) || 0,
            protein: mealDetails?.nutrition?.protein || (meal && meal?.nutrition?.protein) || 0,
            carbs: mealDetails?.nutrition?.carbs || (meal && meal?.nutrition?.carbs) || 0,
            fat: mealDetails?.nutrition?.fat || (meal && meal?.nutrition?.fat) || 0
          },
          image: mealDetails?.imageUrl || (meal && meal?.imageUrl) || "",
          imageUrl: mealDetails?.imageUrl || (meal && meal?.imageUrl) || "",
          completed: initialCompletions[mealType] || false,
          time: mealItem.time || mealTypeToTime[mealType]
        };
        
        // Update the updatedMealPlan array (for profile format)
        updatedMealPlan[mealIndex] = {
          ...updatedMealPlan[mealIndex],
          ...normalizedMeal
        };
        
        // Also update the planner format in the store
        mealPlanStore.updateMeal(normalizedMeal, mealType, today);
      }
    } catch (error) {
      console.error(`Error fetching meal details for ${mealType}:`, error);
    }
  }
  
  // Update the store with the completed meal plan (profile format)
  mealPlanStore.setProfileMeals(updatedMealPlan);
  
  // Update meal times to find current/next meal
  mealPlanStore.updateMealTimes();
  
  // Recalculate calorie counts
  mealPlanStore.updateCalorieCount();
  
  // We no longer need to dispatch events since we're using Zustand's store
  // to notify other components of changes. The subscribeWithSelector middleware
  // will automatically notify subscribers when the store changes.
  console.log("Profile service: Updated plan via Zustand store, planId:", plan.id);
  
  return updatedMealPlan;
};

// Load data for a specific date
export const loadDataForDate = async (date, userId) => {
  if (!userId) return null;
  
  const mealPlanStore = useMealPlanStore.getState();
  const { activePlanId, profileMeals } = mealPlanStore;
  
  try {
    // Ensure date is a proper Date object
    const safeDate = date instanceof Date ? date : new Date(date);
    const dateString = safeDate.toISOString().split('T')[0];
    const apiService = getApiService();
    
    // Check if we have the planner meals for this date
    const plannerMeals = mealPlanStore.plannerMeals?.[dateString] || {};
    
    // Start with existing profile meals
    const updatedProfileMeals = [...profileMeals];
    
    // Reset all meals to default
    updatedProfileMeals.forEach(meal => {
      if (!meal) return;
      
      meal.name = '';
      meal.nutrition = {
        calories: 0,
        protein: 0,
        carbs: 0, 
        fat: 0
      };
      meal.image = '';
      meal.imageUrl = '';
      meal.completed = false;
      meal.id = null;
    });
    
    // Check if we have any meals for this date (handle empty object)
    const hasMeals = Object.keys(plannerMeals).length > 0;
    
    // If we have planner meals for this date, use them
    if (hasMeals) {
      console.log("Using planner meals for date:", dateString);
      
      // Update profileMeals with data from plannerMeals (with safety checks)
      Object.entries(plannerMeals).forEach(([mealType, meal]) => {
        // Skip if meal is null or undefined
        if (!meal) return;
        
        const mealIndex = updatedProfileMeals.findIndex(m => m?.type === mealType);
        
        if (mealIndex !== -1) {
          // Get name with fallbacks
          const mealName = meal.title || meal.name || "";
          
          // Update the meal in profile format
          updatedProfileMeals[mealIndex] = {
            ...updatedProfileMeals[mealIndex],
            type: mealType, // Ensure type is preserved
            time: updatedProfileMeals[mealIndex].time, // Preserve time
            name: mealName,
            title: mealName,
            nutrition: {
              calories: meal.nutrition?.calories || 0,
              protein: meal.nutrition?.protein || 0,
              carbs: meal.nutrition?.carbs || 0,
              fat: meal.nutrition?.fat || 0
            },
            image: meal.image || meal.imageUrl || "",
            imageUrl: meal.imageUrl || meal.image || "",
            id: meal.id,
            completed: dateString === getTodayDateString() ? 
              (mealPlanStore.completedMeals[mealType] || false) : false
          };
        }
      });
      
      console.log("Updated profile meals:", updatedProfileMeals);
      
      // Update the store with profile format meals
      try {
        mealPlanStore.setProfileMeals(updatedProfileMeals);
      } catch (err) {
        console.error("Error updating profile meals:", err);
      }
      
      // For today, load completions; otherwise clear them
      if (dateString === getTodayDateString()) {
        try {
          await loadMealCompletions(userId);
        } catch (err) {
          console.error("Error loading meal completions:", err);
        }
      }
      
      // Update meal times and calorie counts (with error handling)
      try {
        mealPlanStore.updateMealTimes();
        mealPlanStore.updateCalorieCount();
      } catch (err) {
        console.error("Error updating meal times or calorie count:", err);
      }
      
      // We'll skip event dispatch here to prevent loops since we're already
      // using Zustand to notify other components of changes
      console.log("Profile service: Updated profile meals via Zustand store for date:", dateString);
      
      return updatedProfileMeals;
    }
    
    // If we don't have planner meals for this date, just update the store with empty meals
    try {
      mealPlanStore.setProfileMeals(updatedProfileMeals);
    } catch (err) {
      console.error("Error updating empty profile meals:", err);
    }
    
    return updatedProfileMeals;
  } catch (error) {
    console.error('Error loading data for date:', error);
    return null;
  }
};

// Fetch saved meals for a specific type
export const fetchSavedMeals = async (mealType) => {
  if (!mealType) return [];
  
  const apiService = getApiService();
  const mealPlanStore = useMealPlanStore.getState();
  
  // Show loading state
  mealPlanStore.setIsLoadingSavedMeals(true);
  
  try {
    console.log(`Fetching saved meals for ${mealType}...`);
    
    // Check if we have a recent cache (within last 2 minutes)
    if (typeof window !== 'undefined') {
      const timestamp = localStorage.getItem('grovli_savedmeals_timestamp');
      if (timestamp) {
        const timeDiff = Date.now() - parseInt(timestamp, 10);
        // If cached within last 2 minutes, use cached data
        if (timeDiff < 2 * 60 * 1000) {
          console.log(`Using cached saved meals (${timeDiff}ms old)`);
          // If we already have data in the store for this meal type
          if (mealPlanStore.savedMeals[mealType]?.length > 0) {
            console.log(`Found ${mealPlanStore.savedMeals[mealType].length} cached meals for ${mealType}`);
            mealPlanStore.setIsLoadingSavedMeals(false);
            return mealPlanStore.savedMeals[mealType];
          }
        }
      }
    }
    
    // Fetch saved recipes with enhanced error handling and retries
    let data = [];
    let attemptCount = 0;
    const maxAttempts = 2;
    
    while (attemptCount < maxAttempts) {
      try {
        attemptCount++;
        console.log(`Fetching saved recipes attempt ${attemptCount}/${maxAttempts}`);
        
        // Create controller with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log("API request timeout, aborting");
          controller.abort();
        }, 8000); // 8 second timeout
        
        const response = await apiService.makeRequest('/api/user-recipes/saved-recipes/', {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Extensive validation
        if (!response) {
          console.warn('API returned null or undefined data');
          // Initialize with empty array but continue
          data = [];
        } else if (!Array.isArray(response)) {
          console.warn('API returned non-array data:', response);
          
          // Try to extract data from non-array response
          if (response.recipes && Array.isArray(response.recipes)) {
            console.log('Found recipes array in response object');
            data = [...response.recipes];
            break; // Success, exit retry loop
          } else if (response.data && Array.isArray(response.data)) {
            console.log('Found data array in response object');
            data = [...response.data];
            break; // Success, exit retry loop
          } else {
            // Initialize with empty array but continue to retry
            data = [];
          }
        } else if (response.length === 0) {
          console.log('No saved recipes data available (empty array)');
          data = [];
          break; // Empty is valid, exit retry loop
        } else {
          // Valid data - use it
          console.log(`Found ${response.length} recipes in response`);
          data = [...response]; // Make a copy to be safe
          break; // Success, exit retry loop
        }
        
        // Only retry if we didn't break out of the loop
        if (attemptCount < maxAttempts) {
          console.log(`Retrying saved recipes fetch (attempt ${attemptCount+1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
      } catch (apiError) {
        console.error(`Error fetching saved recipes (attempt ${attemptCount}):`, apiError);
        
        // Continue with empty data rather than failing completely
        data = [];
        
        // Only retry if we have attempts left
        if (attemptCount < maxAttempts) {
          console.log(`Retrying after error (attempt ${attemptCount+1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
      }
    }
    
    console.log(`Received saved recipes data:`, data);
    
    // Start with existing saved meals
    const savedMeals = { ...mealPlanStore.savedMeals };
    const addedMealNames = new Set();
    
    // Clear existing meals for this type
    savedMeals[mealType] = [];
    
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
        
        // Format the meal data directly from the API response
        const formattedMeal = {
          id: recipe.recipe_id || recipe.id,
          name: recipe.title,
          title: recipe.title,
          meal_type: recipe.meal_type,
          nutrition: recipe.nutrition || {},  // Use nutrition directly from recipe
          image: recipe.imageUrl || "",
          imageUrl: recipe.imageUrl || ""
        };
          
        // Ensure the category exists
        if (!savedMeals[category]) {
          savedMeals[category] = [];
        }
        
        // Add to the appropriate category
        savedMeals[category].push(formattedMeal);
        addedMealNames.add(recipe.title);
      }
    }
    
    console.log(`Setting saved meals for ${mealType}:`, savedMeals[mealType]);
    
    // Update the store - use the proper function from Zustand store
    mealPlanStore.setSavedMeals(mealType, savedMeals[mealType]);
    
    // Store last update timestamp in localStorage for caching
    if (typeof window !== 'undefined') {
      localStorage.setItem('grovli_savedmeals_timestamp', Date.now().toString());
      localStorage.setItem(`grovli_savedmeals_${mealType}_count`, (savedMeals[mealType]?.length || 0).toString());
    }
    
    return savedMeals[mealType];
  } catch (error) {
    console.error('Error fetching saved meals:', error);
    
    // Even on error, make sure we have an entry for this meal type in savedMeals
    const currentSavedMeals = mealPlanStore.savedMeals;
    const fallbackMeals = currentSavedMeals[mealType] || [];
    
    // Make sure we have this meal type in the store
    mealPlanStore.setSavedMeals(mealType, fallbackMeals);
    
    return fallbackMeals;
  } finally {
    // Always clear loading state
    mealPlanStore.setIsLoadingSavedMeals(false);
  }
};

// Load user settings from API
export const loadUserSettings = async (userId) => {
  if (!userId) return null;
  
  const apiService = getApiService();
  const mealPlanStore = useMealPlanStore.getState();
  
  try {
    console.log("Fetching user settings from server");
    const serverSettings = await apiService.makeRequest(`/user-settings/${userId}`);
    
    console.log("Received server settings:", serverSettings);
    
    // Update store using Zustand actions
    mealPlanStore.setGlobalSettings(serverSettings);
    mealPlanStore.setCalorieData({
      ...mealPlanStore.calorieData,
      target: serverSettings.calories || 2000
    });
    
    return serverSettings;
  } catch (error) {
    console.error("Error fetching user settings:", error);
    return null;
  }
};