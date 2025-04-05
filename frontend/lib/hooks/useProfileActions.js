"use client";

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useUser } from "@auth0/nextjs-auth0";
import { useSWRConfig } from 'swr';

// Import SWR hooks for data fetching
import { useApiGet, useApiMutation } from '../swr-client';

// Import Zustand store for local state management
import { useMealPlanStore, initializeMealPlanStore, defaultMealPlan } from '../stores/mealPlanStore';

// Create a key generator for SWR queries
const createUserKey = (userId, endpoint) => userId ? `${endpoint}/${userId}` : null;

/**
 * Hook that provides all the profile actions needed in components
 * A clean way to access Zustand state and actions while adding API integration
 */
export function useProfileActions() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  
  // Get auth state from Auth0
  const { user, isLoading: isAuthLoading } = useUser();
  
  // Set up API mutation hooks
  const apiMutation = useApiMutation();
  
  // Set up SWR data fetching hooks
  const userPlansKey = createUserKey(user?.sub, '/api/user-plans/user');
  const userSettingsKey = createUserKey(user?.sub, '/user-settings');
  const todayStr = new Date().toISOString().split('T')[0];
  const mealCompletionsKey = user?.sub ? `/user-profile/meal-completion/${user.sub}/${todayStr}` : null;
  
  // Fetch data using SWR with improved configuration
  const { data: userPlans, isLoading: isLoadingPlans } = useApiGet(userPlansKey, {
    // Revalidation configuration
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateIfStale: true,
    // Deduplicate requests within this time window
    dedupingInterval: 5000,
    // Add error handling
    onError: (error) => {
      console.error("Error fetching user plans:", error);
    },
    // Success handler
    onSuccess: (data) => {
      // If plans data exists, load the most recent plan
      if (data && data.length > 0) {
        const sortedPlans = [...data].sort((a, b) => 
          new Date(b.updated_at) - new Date(a.updated_at)
        );
        // Let Zustand handle the data directly
        handleLoadPlan(sortedPlans[0]);
      }
    }
  });
  
  const { data: userSettings } = useApiGet(userSettingsKey, {
    // User settings don't change often, so we can use a longer cache time
    dedupingInterval: 60000, // 1 minute
    // Less aggressive revalidation for settings
    revalidateOnFocus: false,
    revalidateIfStale: true,
    // Success handler
    onSuccess: (data) => {
      if (data) {
        mealPlanStore.setGlobalSettings(data);
        mealPlanStore.setCalorieData({
          ...mealPlanStore.calorieData,
          target: data.calories || 2000
        });
      }
    }
  });
  
  const { data: completionsData, mutate: mutateCompletions } = useApiGet(mealCompletionsKey, {
    // These can change frequently, so more aggressive revalidation
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    // Deduplicate requests within this time window
    dedupingInterval: 2000,
    // Success handler
    onSuccess: (data) => {
      if (data) {
        mealPlanStore.setCompletedMeals(data);
        
        // Also update profileMeals with completion statuses
        const { profileMeals } = mealPlanStore;
        const updatedMealPlan = profileMeals.map(meal => ({
          ...meal,
          completed: data[meal.type] || false
        }));
        mealPlanStore.setProfileMeals(updatedMealPlan);
      }
    }
  });
  
  // Get Zustand store state and actions
  const {
    // Core data
    profileMeals: mealPlan,
    setProfileMeals: setMealPlan,
    
    // UI state
    activeSection,
    setActiveSection,
    isLoadingSavedMeals,
    setIsLoadingSavedMeals,
    selectedDate,
    setSelectedDate,
    selectedMealType,
    setSelectedMealType,
    nextMeal,
    updateNextMealCard,
    currentMealIndex,
    setCurrentMealIndex,
    
    // Calculations & Actions
    updateCalorieCount,
    toggleMealCompletion,
    markMealAsEaten,
    updateMealTimes,
    
    // Data
    completedMeals,
    calorieData,
    savedMeals,
    globalSettings
  } = useMealPlanStore();
  
  // Get access to the shared meal plan store
  const mealPlanStore = useMealPlanStore();
  
  // Load initial data on component mount - with SWR-compatible caching
  useEffect(() => {
    // Skip if auth is still loading or no user
    if (!user?.sub || isAuthLoading) return;
    
    // Initialize the meal plan store with default meals if needed
    if (mealPlan.length === 0) {
      initializeMealPlanStore(defaultMealPlan);
    } else {
      initializeMealPlanStore();
    }
    
    // Load settings from localStorage first
    mealPlanStore.loadSettingsFromStorage();
    
    // Create a function to synchronize SWR cache with Zustand store
    const syncStoreWithSWRCache = async () => {
      try {
        // First check if there's data in the SWR cache already
        const cachedPlans = await mutate(userPlansKey, undefined, { 
          revalidate: false, // Just check cache without revalidating
          populateCache: false // Don't update cache
        });
        
        // If we have cached data, use it to initialize the store
        if (cachedPlans && Array.isArray(cachedPlans) && cachedPlans.length > 0) {
          console.log("[ProfileActions] Found SWR cached plans, initializing store");
          const sortedPlans = [...cachedPlans].sort((a, b) => 
            new Date(b.updated_at) - new Date(a.updated_at)
          );
          handleLoadPlan(sortedPlans[0]);
        }
        
        // Also check for cached completion data
        const cachedCompletions = await mutate(mealCompletionsKey, undefined, {
          revalidate: false,
          populateCache: false
        });
        
        if (cachedCompletions) {
          console.log("[ProfileActions] Found SWR cached completions, initializing store");
          mealPlanStore.setCompletedMeals(cachedCompletions);
        }
      } catch (err) {
        console.warn("[ProfileActions] Error initializing from SWR cache:", err);
      }
    };
    
    // Try to initialize from SWR cache
    syncStoreWithSWRCache();
    
    // SWR will automatically load the necessary data based on the keys if cache is empty
    
  }, [user, isAuthLoading, mealPlan, userPlansKey, mealCompletionsKey, mutate]);
  
  // Helper function to load a plan into the Zustand store - SWR optimized
  const handleLoadPlan = useCallback(async (plan) => {
    if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
      return;
    }
    
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
    const today = new Date().toISOString().split('T')[0];
    
    // Filter for today's meals
    const todaysMeals = plan.meals.filter(mealItem => 
      mealItem.date === today || mealItem.current_day === true
    );
    
    // Create updated meal plan based on default structure
    const updatedMealPlan = [...mealPlan];
    
    // Batch all recipe IDs needed - for prefetching with SWR
    const recipeIds = todaysMeals
      .map(mealItem => mealItem.mealId || (mealItem.meal && (mealItem.meal.recipe_id || mealItem.meal.id)))
      .filter(Boolean); // Remove undefined/null
      
    // Prefetch all recipes in parallel using SWR's pattern
    if (recipeIds.length > 0) {
      console.log(`[ProfileActions] Prefetching ${recipeIds.length} recipes for meal plan`);
      
      // Batch prefetch meals in parallel
      await Promise.all(
        recipeIds.map(recipeId => {
          const mealKey = `/mealplan/${recipeId}`;
          
          // Use SWR's prefetching pattern
          return mutate(
            mealKey,
            // Fetch the data
            apiMutation.trigger(mealKey, { method: 'GET' })
              .catch(err => {
                console.warn(`[ProfileActions] Error prefetching recipe ${recipeId}:`, err);
                return null;
              }),
            // Don't revalidate after prefetching
            false
          );
        })
      );
    }
    
    // Process each meal
    for (const mealItem of todaysMeals) {
      const { mealType, meal, mealId } = mealItem;
      const recipeId = mealId || (meal && (meal.recipe_id || meal.id));
      
      if (!recipeId) continue;
      
      try {
        // Use cached data if available from our prefetch
        const mealKey = `/mealplan/${recipeId}`;
        
        // Get meal details from SWR cache or fetch if needed
        const mealDetails = await mutate(
          mealKey, 
          // If not in cache, fetch it
          (cachedData) => cachedData || apiMutation.trigger(mealKey, { method: 'GET' }),
          { revalidate: false } // Don't revalidate
        );
        
        // Skip if no data
        if (!mealDetails) continue;
        
        // Find matching meal in plan
        const mealIndex = updatedMealPlan.findIndex(m => m.type === mealType);
        
        if (mealIndex !== -1) {
          // Format meal with the correct structure
          const formattedMeal = {
            ...updatedMealPlan[mealIndex],
            name: mealDetails.title || (meal && meal.title) || "",
            title: mealDetails.title || (meal && meal.title) || "",
            nutrition: {
              calories: mealDetails.nutrition?.calories || (meal && meal.nutrition?.calories) || 0,
              protein: mealDetails.nutrition?.protein || (meal && meal.nutrition?.protein) || 0,
              carbs: mealDetails.nutrition?.carbs || (meal && meal.nutrition?.carbs) || 0,
              fat: mealDetails.nutrition?.fat || (meal && meal.nutrition?.fat) || 0
            },
            image: mealDetails.imageUrl || (meal && meal.imageUrl) || "",
            imageUrl: mealDetails.imageUrl || (meal && meal.imageUrl) || "",
            id: recipeId,
            completed: completedMeals[mealType] || false,
            time: mealItem.time || mealTypeToTime[mealType]
          };
          
          // Update the meal plan array
          updatedMealPlan[mealIndex] = formattedMeal;
          
          // Also update the planner format in the store
          mealPlanStore.updateMeal(formattedMeal, mealType, today);
        }
      } catch (error) {
        console.error(`Error processing meal details for ${mealType}:`, error);
      }
    }
    
    // Update the store with the completed meal plan
    mealPlanStore.setProfileMeals(updatedMealPlan);
    
    // Update meal times to find current/next meal
    mealPlanStore.updateMealTimes();
    
    // Recalculate calorie counts
    mealPlanStore.updateCalorieCount();
    
    console.log(`[ProfileActions] Successfully loaded meal plan with ${todaysMeals.length} meals for today`);
  }, [mealPlan, completedMeals, apiMutation, mealPlanStore, mutate]);
  
  // Set up event listeners for refreshing data - using SWR's built-in focus revalidation
  // The event listeners have been removed because SWR handles this automatically with:
  // - revalidateOnFocus: true
  // - revalidateOnReconnect: true
  // - revalidateIfStale: true
  // These options are already set in the useApiGet hooks above
  
  // We only add a custom handler for manually revalidating multiple keys at once
  // for more complex visibility-based scenarios
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.sub) return;
    
    // Custom handler for more complex cases only
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user?.sub) {
        // Check if we've been invisible for a long time (> 5 minutes)
        const lastVisibleTime = parseInt(sessionStorage.getItem('lastVisibleTime') || '0', 10);
        const now = Date.now();
        const invisibleDuration = now - lastVisibleTime;
        
        if (invisibleDuration > 5 * 60 * 1000) {
          console.log('[ProfileActions] Page was hidden for over 5 minutes, forcing revalidation');
          // Force revalidate all key data
          mutate(userPlansKey);
          mutateCompletions();
        }
      } else if (document.visibilityState !== 'visible') {
        // Store the time we became invisible
        sessionStorage.setItem('lastVisibleTime', Date.now().toString());
      }
    };
    
    // We only need the visibility event for tracking time away
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, userPlansKey, mutate, mutateCompletions]);
  
  // Update meals based on current time periodically
  useEffect(() => {
    // Get from meal plan store directly to avoid stale closures
    const { profileMeals } = useMealPlanStore.getState();
    if (!Array.isArray(profileMeals) || profileMeals.length === 0) return;
    
    // Update now
    updateMealTimes();
    
    // Set interval for periodic updates
    const intervalTime = typeof window !== 'undefined' && 
                        window.navigator.userAgent.includes('Mobile') ? 120000 : 60000;
    const intervalId = setInterval(updateMealTimes, intervalTime);
    
    return () => clearInterval(intervalId);
  }, [updateMealTimes]);
  
  // No need for throttling refs anymore - SWR handles this for us
  
  // Listen for Zustand store changes and update the server using SWR with optimistic updates
  useEffect(() => {
    if (!user?.sub) return;
    
    // Track last updated time to implement minimal debounce
    let lastUpdateTime = 0;
    const DEBOUNCE_TIME = 500; // ms
    
    // With subscribeWithSelector middleware, we can use a selector function
    // Subscribe to changes in the meal plan store
    const unsubscribe = useMealPlanStore.subscribe(
      // Select specific parts of state to monitor
      (state) => [state.plannerMeals, state.activePlanId],
      // This function runs when the selected state changes
      async ([plannerMeals, activePlanId]) => {
        // Implement minimal debounce for rapid changes
        const now = Date.now();
        if (now - lastUpdateTime < DEBOUNCE_TIME) {
          return;
        }
        lastUpdateTime = now;
        
        console.log("[ProfileActions] Detected meal plan store update");
        
        // Format meal plan data for the API
        const mealPlanData = mealPlanStore.formatMealsForApi();
        
        // Check if we have a valid plan to update
        if (mealPlanData.planId && mealPlanData.meals.length > 0) {
          // Skip updates when the page is not visible to avoid wasted API calls
          if (document.visibilityState !== 'visible') {
            console.log('[ProfileActions] Page not visible, queueing update for later');
            // Store the pending update to be processed when visibility changes
            try {
              const pendingUpdates = JSON.parse(localStorage.getItem('pendingMealPlanUpdates') || '[]');
              pendingUpdates.push({
                data: mealPlanData,
                timestamp: Date.now()
              });
              localStorage.setItem('pendingMealPlanUpdates', JSON.stringify(pendingUpdates));
            } catch (err) {
              console.error('[ProfileActions] Error storing pending update:', err);
            }
            return;
          }
          
          // Create the API endpoint
          const updateEndpoint = '/api/user-plans/update';
          
          // Use SWR's optimistic update pattern
          try {
            // Define the current data for rollback if needed
            const currentData = await apiMutation.trigger(updateEndpoint, { 
              method: 'GET'
            }).catch(() => null);
            
            // Optimistically update the SWR cache
            mutate(
              userPlansKey, 
              // Update function that incorporates the new meal plan
              async (currentPlans) => {
                if (!Array.isArray(currentPlans)) return currentPlans;
                
                // Find and update the active plan
                return currentPlans.map(plan => 
                  plan.id === mealPlanData.planId
                    ? { ...plan, meals: mealPlanData.meals }
                    : plan
                );
              },
              { revalidate: false } // Don't revalidate immediately
            );
            
            // Perform the actual API update
            await apiMutation.updateMealPlan(mealPlanData, {
              userId: user.sub
            });
            
            // Revalidate after a short delay to ensure data consistency
            setTimeout(() => {
              mutate(userPlansKey);
            }, 1000);
          } catch (error) {
            // Only log errors when page is visible
            if (document.visibilityState === 'visible') {
              console.error("Error updating meal plan:", error);
              // Revalidate to restore correct data after error
              mutate(userPlansKey);
            }
          }
        }
      }
    );
    
    // Clean up subscription
    return unsubscribe;
  }, [user, apiMutation, userPlansKey, mutate, mealPlanStore]);
  
  // Save completions when component unmounts
  useEffect(() => {
    // Create a reference to the current visibility state
    let currentlyVisible = document.visibilityState === 'visible';
    
    // Set up visibility change listener to track when page is visible/hidden
    const handleVisibilityChange = () => {
      currentlyVisible = document.visibilityState === 'visible';
      console.log(`[ProfileActions] Visibility changed to: ${currentlyVisible ? 'visible' : 'hidden'}`);
    };
    
    // Add the visibility listener
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup function runs on unmount
    return () => {
      // Remove the visibility listener
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Only run if user exists and we're actually unmounting
      if (user?.sub) {
        console.log('[ProfileActions] Component unmounting, saving meal completions');
        
        // If the page is not visible (navigating away), skip API calls completely
        if (!currentlyVisible) {
          console.log('[ProfileActions] Page not visible during unmount, skipping API calls');
          return;
        }
        
        // Get fresh state at unmount time
        const { completedMeals } = useMealPlanStore.getState();
        const today = new Date().toISOString().split('T')[0];
        
        // Queue meals to be saved once we're back to visible state
        const mealsToSave = Object.entries(completedMeals).map(([mealType, completed]) => ({
          mealType,
          completed
        }));
        
        // If we have meals to save and the page is visible, save them to localStorage
        // This ensures they can be processed later if the actual API calls fail
        if (mealsToSave.length > 0) {
          try {
            const pendingSaves = JSON.parse(localStorage.getItem('pendingMealCompletions') || '[]');
            const updatedPendingSaves = [
              ...pendingSaves,
              {
                userId: user.sub,
                date: today,
                meals: mealsToSave,
                timestamp: Date.now()
              }
            ];
            localStorage.setItem('pendingMealCompletions', JSON.stringify(updatedPendingSaves));
            console.log(`[ProfileActions] Queued ${mealsToSave.length} meal completions for saving`);
          } catch (err) {
            console.error('[ProfileActions] Error queuing meal completions:', err);
          }
        }
        
        // No need to make API calls directly here - we'll process them on the next page load
      }
    };
  }, [user]);
  
  // Process any pending meal completions from localStorage with SWR optimistic updates
  useEffect(() => {
    if (!user?.sub || !apiMutation.saveMealCompletion) return;
    
    const processPendingMealCompletions = async () => {
      try {
        // Also check for and process pending meal plan updates
        const pendingPlanUpdates = JSON.parse(localStorage.getItem('pendingMealPlanUpdates') || '[]');
        if (pendingPlanUpdates.length > 0) {
          console.log(`[ProfileActions] Processing ${pendingPlanUpdates.length} pending meal plan updates`);
          
          // Process only the most recent update to avoid wasted API calls
          const mostRecentUpdate = pendingPlanUpdates.reduce((latest, current) => 
            !latest || current.timestamp > latest.timestamp ? current : latest
          , null);
          
          if (mostRecentUpdate?.data) {
            try {
              // Optimistically update cache first
              mutate(userPlansKey, async (currentPlans) => {
                if (!Array.isArray(currentPlans)) return currentPlans;
                
                return currentPlans.map(plan => 
                  plan.id === mostRecentUpdate.data.planId
                    ? { ...plan, meals: mostRecentUpdate.data.meals }
                    : plan
                );
              }, { revalidate: false });
              
              // Perform the actual API update
              await apiMutation.updateMealPlan(mostRecentUpdate.data, { userId: user.sub });
              console.log('[ProfileActions] Successfully processed pending meal plan update');
              
              // Clear all pending updates since we've processed the most recent one
              localStorage.removeItem('pendingMealPlanUpdates');
              
              // Revalidate to ensure consistency
              mutate(userPlansKey);
            } catch (err) {
              console.error('[ProfileActions] Error processing pending meal plan update:', err);
            }
          }
        }
        
        // Process meal completions
        const pendingSaves = JSON.parse(localStorage.getItem('pendingMealCompletions') || '[]');
        if (pendingSaves.length === 0) return;
        
        console.log(`[ProfileActions] Processing ${pendingSaves.length} pending meal completion sets`);
        
        // Get the current completion data for optimistic updates
        const today = new Date().toISOString().split('T')[0];
        const completionsKey = `/user-profile/meal-completion/${user.sub}/${today}`;
        
        // Process each set of pending saves
        const updatedPendingSaves = pendingSaves.filter(pendingSave => {
          // Skip if more than 24 hours old
          if (Date.now() - pendingSave.timestamp > 24 * 60 * 60 * 1000) {
            console.log('[ProfileActions] Skipping stale pending save:', pendingSave);
            return false;
          }
          
          // Skip if for a different user
          if (pendingSave.userId !== user.sub) return true;
          
          // If this is for today, use optimistic update
          if (pendingSave.date === today) {
            // Process each meal in this save using optimistic updates
            pendingSave.meals.forEach(({ mealType, completed }) => {
              // Optimistically update the cache
              mutateCompletions(currentData => ({
                ...currentData,
                [mealType]: completed
              }), false);
              
              // Then perform the actual API call
              apiMutation.saveMealCompletion(user.sub, mealType, completed, pendingSave.date)
                .then(() => {
                  console.log(`[ProfileActions] Successfully saved pending completion for ${mealType}`);
                  // Revalidate to ensure consistency
                  mutateCompletions();
                })
                .catch(err => {
                  console.error(`[ProfileActions] Error saving pending completion for ${mealType}:`, err);
                  // Revalidate to restore correct data after error
                  mutateCompletions();
                });
            });
          } else {
            // For non-today dates, just use the API directly
            pendingSave.meals.forEach(({ mealType, completed }) => {
              apiMutation.saveMealCompletion(user.sub, mealType, completed, pendingSave.date)
                .then(() => console.log(`[ProfileActions] Successfully saved pending completion for ${mealType} on ${pendingSave.date}`))
                .catch(err => console.error(`[ProfileActions] Error saving pending completion for ${mealType} on ${pendingSave.date}:`, err));
            });
          }
          
          // Don't keep this one in the array
          return false;
        });
        
        // Update localStorage with the remaining saves (for other users or failures)
        localStorage.setItem('pendingMealCompletions', JSON.stringify(updatedPendingSaves));
      } catch (err) {
        console.error('[ProfileActions] Error processing pending data:', err);
      }
    };
    
    // Process immediately and also when the page becomes visible
    processPendingMealCompletions();
    
    // Set up visibility change handler to process when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        processPendingMealCompletions();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, apiMutation.saveMealCompletion, apiMutation.updateMealPlan, mutate, mutateCompletions, userPlansKey]);
  
  // Handle date change with SWR integration
  const handleDateChange = useCallback(async (date) => {
    if (!user?.sub) return;
    
    // Ensure date is a proper Date object
    const safeDate = date instanceof Date ? date : new Date(date);
    
    // Set the date in the store
    setSelectedDate(safeDate);
    
    // Format the date for API key
    const dateString = safeDate.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    
    // Define a completion key for this date (we'll need it if it's not today)
    const dateCompletionsKey = `/user-profile/meal-completion/${user.sub}/${dateString}`;
    
    console.log(`[ProfileActions] Changing date to ${dateString}`);
    
    // Check if we need to prefetch data for this date
    if (dateString !== today) {
      // Prefetch completions for this date using SWR pattern
      mutate(dateCompletionsKey, 
        // If not in cache, fetch
        (cachedData) => {
          if (cachedData) return cachedData;
          
          // Fetch only if it's not in the cache
          return apiMutation.trigger(dateCompletionsKey, { method: 'GET' })
            .catch(() => ({})); // Default to empty object
        },
        false // Don't revalidate
      );
    }
    
    // Get the planner meals for this date from Zustand
    const plannerMeals = mealPlanStore.plannerMeals?.[dateString] || {};
    
    // Start with existing profile meals
    const updatedProfileMeals = [...mealPlan];
    
    // Reset all meals to default
    updatedProfileMeals.forEach(meal => {
      if (!meal) return;
      
      meal.name = '';
      meal.title = '';
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
    
    // Check if we have any meals for this date
    const hasMeals = Object.keys(plannerMeals).length > 0;
    
    // Get completions data for the selected date (from SWR cache if possible)
    let completionsForDate;
    if (dateString === today) {
      // For today, we already have completions in the Zustand store
      completionsForDate = mealPlanStore.completedMeals;
    } else {
      // For other days, check SWR cache
      try {
        completionsForDate = await mutate(dateCompletionsKey, undefined, { 
          revalidate: false,
          populateCache: false
        }) || {};
      } catch (err) {
        console.warn(`[ProfileActions] Error getting completions for ${dateString}:`, err);
        completionsForDate = {};
      }
    }
    
    // If we have planner meals for this date, use them
    if (hasMeals) {
      // Update profileMeals with data from plannerMeals
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
            completed: completionsForDate[mealType] || false
          };
        }
      });
      
      // Update the store with profile format meals
      mealPlanStore.setProfileMeals(updatedProfileMeals);
      
      // If the selected date is today, ensure the SWR cache is fresh
      if (dateString === today) {
        // Revalidate both plans and completions
        mutate(mealCompletionsKey);
        mutate(userPlansKey);
      }
      
      // Update meal times and calorie counts
      mealPlanStore.updateMealTimes();
      mealPlanStore.updateCalorieCount();
    } else {
      // Just update with empty meals
      mealPlanStore.setProfileMeals(updatedProfileMeals);
    }
    
    // Track the date change for analytics
    console.log(`[ProfileActions] Date changed to ${dateString}, found ${hasMeals ? 'meals' : 'no meals'}`);
    
  }, [user, mealPlan, mealPlanStore, setSelectedDate, mealCompletionsKey, userPlansKey, mutate, apiMutation]);
  
  // Handle just ate action
  const handleJustAte = useCallback(() => {
    if (!user?.sub) return;
    
    // Use the store action to mark meal as eaten
    markMealAsEaten();
    
    // Save to API
    if (Array.isArray(mealPlan) && mealPlan.length > 0) {
      const currentMeal = currentMealIndex >= 0 && currentMealIndex < mealPlan.length 
        ? mealPlan[currentMealIndex] 
        : null;
        
      if (currentMeal?.type) {
        // Use SWR mutation for updating completion
        const today = new Date().toISOString().split('T')[0];
        apiMutation.post('/user-profile/meal-completion', {
          user_id: user.sub,
          date: today,
          meal_type: currentMeal.type,
          completed: true
        }, {
          invalidateUrls: [mealCompletionsKey]
        }).catch(err => {
          console.error('Error saving meal completion:', err);
          toast.error('Failed to update meal status');
        });
      }
    }
  }, [user, mealPlan, currentMealIndex, markMealAsEaten, apiMutation, mealCompletionsKey]);
  
  // Handle toggle meal completion with SWR optimistic updates
  const handleToggleMealCompletion = useCallback(async (mealType) => {
    if (!user?.sub) return;
    
    // Toggle in Zustand store
    const newCompleted = mealPlanStore.toggleMealCompletion(mealType, new Date());
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Update the completedMeals object in the store immediately
      const updatedCompletions = {
        ...mealPlanStore.completedMeals,
        [mealType]: newCompleted
      };
      mealPlanStore.setCompletedMeals(updatedCompletions);
      
      // 1. Optimistically update the SWR cache
      mutateCompletions(
        // Optimistic data
        currentData => ({
          ...currentData,
          [mealType]: newCompleted
        }),
        // Don't revalidate yet
        { revalidate: false }
      );
      
      // 2. Send the actual API request
      await apiMutation.post('/user-profile/meal-completion', {
        user_id: user.sub,
        date: today,
        meal_type: mealType,
        completed: newCompleted
      });
      
      // 3. Trigger a revalidation to ensure consistency
      mutateCompletions();
      
    } catch (error) {
      // Handle errors, including rolling back optimistic updates
      console.error('Failed to toggle meal completion:', error);
      
      // Roll back the UI state in the Zustand store
      const rollbackCompleted = !newCompleted;
      mealPlanStore.toggleMealCompletion(mealType, new Date()); // Toggle back
      
      // Roll back the SWR cache
      mutateCompletions();
      
      // Show error to user
      toast.error('Failed to update meal completion status');
      
      // Check if this was a navigation error
      if (document.visibilityState !== 'visible') {
        console.log('[ProfileActions] Navigation detected during toggle, queueing for retry');
        
        // Queue for retry
        try {
          const pendingSaves = JSON.parse(localStorage.getItem('pendingMealCompletions') || '[]');
          pendingSaves.push({
            userId: user.sub,
            date: today,
            meals: [{ mealType, completed: newCompleted }],
            timestamp: Date.now()
          });
          localStorage.setItem('pendingMealCompletions', JSON.stringify(pendingSaves));
        } catch (err) {
          console.error('[ProfileActions] Error queueing failed meal completion for retry:', err);
        }
      }
    }
  }, [user, mealPlanStore, apiMutation, mutateCompletions]);
  
  // Handle removing a meal
  const handleRemoveMeal = useCallback(async (mealType) => {
    if (!user?.sub) return;
    
    try {
      console.log(`Removing meal of type: ${mealType}`);
      
      // Update UI state
      mealPlanStore.setSelectedMealType(mealType);
      mealPlanStore.setIsLoadingSavedMeals(true);
      
      // Use the removeMeal function from the Zustand store
      // This will handle both profile and planner formats
      mealPlanStore.removeMeal(mealType, new Date());
      
      // Update meal times and calorie data
      mealPlanStore.updateMealTimes();
      mealPlanStore.updateCalorieCount();
      
      // Switch to saved meals view
      mealPlanStore.setActiveSection('savedMeals');
      
      // Fetch saved meals using SWR
      const savedMealsKey = '/api/user-recipes/saved-recipes/';
      const { data } = await apiMutation.trigger(savedMealsKey, { method: 'GET' });
      
      if (data) {
        // Process the saved meals data
        const processedMeals = {};
        const addedMealNames = new Set();
        
        // Process each plan
        for (const plan of data) {
          if (!plan.recipes || !Array.isArray(plan.recipes)) continue;
          
          // Process each recipe in the plan
          for (const recipe of plan.recipes) {
            // Skip duplicates
            if (addedMealNames.has(recipe.title)) continue;
            
            // Determine meal category
            const recipeMealType = (recipe.meal_type || '').toLowerCase();
            const category = ['breakfast', 'lunch', 'dinner', 'snack'].includes(recipeMealType) 
              ? recipeMealType : 'snack';
              
            // Ensure the category exists
            if (!processedMeals[category]) {
              processedMeals[category] = [];
            }
            
            // Format the meal data directly from the API response
            const formattedMeal = {
              id: recipe.recipe_id || recipe.id,
              name: recipe.title,
              title: recipe.title,
              meal_type: recipe.meal_type,
              nutrition: recipe.nutrition || {},
              image: recipe.imageUrl || "",
              imageUrl: recipe.imageUrl || ""
            };
            
            // Add to the appropriate category
            processedMeals[category].push(formattedMeal);
            addedMealNames.add(recipe.title);
          }
        }
        
        // Update the store with the processed data
        mealPlanStore.setSavedMeals(mealType, processedMeals[mealType] || []);
      }
    } catch (error) {
      console.error('Error removing meal:', error);
      toast.error('Error removing meal');
    } finally {
      mealPlanStore.setIsLoadingSavedMeals(false);
    }
  }, [user, mealPlanStore, apiMutation]);
  
  // Handle adding a meal
  const handleAddMeal = useCallback(async (mealType) => {
    if (!user?.sub) return;
    
    try {
      console.log(`Adding meal of type: ${mealType}`);
      
      // Update UI state
      mealPlanStore.setSelectedMealType(mealType);
      mealPlanStore.setIsLoadingSavedMeals(true);
      mealPlanStore.setActiveSection('savedMeals');
      
      // Fetch saved meals using SWR
      const savedMealsKey = '/api/user-recipes/saved-recipes/';
      const { data } = await apiMutation.trigger(savedMealsKey, { method: 'GET' });
      
      if (data) {
        // Process the saved meals data - same processing as in handleRemoveMeal
        const processedMeals = {};
        const addedMealNames = new Set();
        
        // Process each plan
        for (const plan of data) {
          if (!plan.recipes || !Array.isArray(plan.recipes)) continue;
          
          // Process each recipe in the plan
          for (const recipe of plan.recipes) {
            // Skip duplicates
            if (addedMealNames.has(recipe.title)) continue;
            
            // Determine meal category
            const recipeMealType = (recipe.meal_type || '').toLowerCase();
            const category = ['breakfast', 'lunch', 'dinner', 'snack'].includes(recipeMealType) 
              ? recipeMealType : 'snack';
              
            // Ensure the category exists
            if (!processedMeals[category]) {
              processedMeals[category] = [];
            }
            
            // Format the meal data
            const formattedMeal = {
              id: recipe.recipe_id || recipe.id,
              name: recipe.title,
              title: recipe.title,
              meal_type: recipe.meal_type,
              nutrition: recipe.nutrition || {},
              image: recipe.imageUrl || "",
              imageUrl: recipe.imageUrl || ""
            };
            
            // Add to the appropriate category
            processedMeals[category].push(formattedMeal);
            addedMealNames.add(recipe.title);
          }
        }
        
        // Update the store with the processed data
        mealPlanStore.setSavedMeals(mealType, processedMeals[mealType] || []);
        
        // Check if we have any saved meals
        if (!processedMeals[mealType] || processedMeals[mealType].length === 0) {
          toast.info(`No saved ${mealType} meals available. Create new meals to add them.`);
        }
      }
    } catch (error) {
      console.error(`Error loading saved meals for ${mealType}:`, error);
      toast.error(`Couldn't load saved meals`);
    } finally {
      mealPlanStore.setIsLoadingSavedMeals(false);
    }
  }, [user, mealPlanStore, apiMutation]);
  
  // Handle selecting a saved meal
  const handleSelectSavedMeal = useCallback((meal) => {
    if (!meal) return;
    
    // Get current state
    const { selectedMealType } = mealPlanStore.getState();
    if (!selectedMealType) return;
    
    // Normalize meal data structure
    const normalizedMeal = {
      id: meal.id,
      mealId: meal.id,
      name: meal.name,
      title: meal.title || meal.name,
      nutrition: {
        calories: meal.nutrition?.calories || meal.calories || 0,
        protein: meal.nutrition?.protein || meal.protein || 0,
        carbs: meal.nutrition?.carbs || meal.carbs || 0,
        fat: meal.nutrition?.fat || meal.fat || 0
      },
      image: meal.image || meal.imageUrl || '',
      imageUrl: meal.imageUrl || meal.image || '',
      ingredients: meal.ingredients || [],
      instructions: meal.instructions || ''
    };
    
    // Update the meal in the Zustand store (handles both formats)
    mealPlanStore.updateMeal(normalizedMeal, selectedMealType, new Date());
    
    // Update next meal if this was the current meal
    const currentMealIndex = mealPlanStore.getState().currentMealIndex;
    const profileMeals = mealPlanStore.getState().profileMeals;
    if (profileMeals[currentMealIndex]?.type === selectedMealType) {
      mealPlanStore.updateNextMealCard(normalizedMeal);
    }
    
    // Update calorie counts
    mealPlanStore.updateCalorieCount();
    
    // Return to timeline view
    mealPlanStore.setActiveSection('timeline');
    
    // Invalidate relevant SWR cache
    mutate(userPlansKey);
    mutate(mealCompletionsKey);
    
    // Update the meal plan on the server
    if (user?.sub && mealPlanStore.activePlanId) {
      const mealPlanData = mealPlanStore.formatMealsForApi();
      apiMutation.updateMealPlan(mealPlanData).catch(err => 
        console.error('Error updating meal plan:', err)
      );
    }
  }, [mealPlanStore, user, mutate, userPlansKey, mealCompletionsKey, apiMutation]);
  
  // Handle creating new meals
  const handleCreateNewMeals = useCallback(() => {
    router.push('/meals');
  }, [router]);
  
  // Handle viewing meal planner
  const handleViewMealPlanner = useCallback(() => {
    router.push('/planner');
  }, [router]);
  
  // Return all actions and state needed by components
  return {
    // User state
    user,
    isAuthenticated: !!user,
    isAuthLoading,
    
    // UI state
    activeSection,
    isLoadingSavedMeals,
    selectedDate,
    selectedMealType,
    
    // Meal data
    mealPlan,
    nextMeal,
    currentMealIndex,
    completedMeals,
    savedMeals,
    calorieData,
    globalSettings,
    
    // Actions
    handleDateChange,
    handleJustAte,
    handleToggleMealCompletion,
    handleRemoveMeal,
    handleAddMeal,
    handleSelectSavedMeal,
    handleCreateNewMeals,
    handleViewMealPlanner,
    setActiveSection: mealPlanStore.setActiveSection
  };
}