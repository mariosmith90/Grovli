"use client";

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import { ssr } from '../utils/ssr-safe-zustand';

// Helper function to format date as YYYY-MM-DD
export function formatDateKey(date) {
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
}

// Get today's date in YYYY-MM-DD format
export function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// Default meal structure - centralized here to avoid duplication
export const defaultMeal = {
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

// Default meal plan structure
export const defaultMealPlan = [
  { ...defaultMeal, type: 'breakfast', time: '8:00 AM' },
  { ...defaultMeal, type: 'lunch', time: '12:30 PM' },
  { ...defaultMeal, type: 'snack', time: '3:30 PM' },
  { ...defaultMeal, type: 'dinner', time: '7:00 PM' }
];

// Create the store with proper middleware and error handling
export const useMealPlanStore = create(
  ssr(
    subscribeWithSelector(
      persist(
        immer((set, get) => ({
        // Core data state
        activePlanId: null,
        planName: "",
        plannerMeals: {}, // Format: {YYYY-MM-DD: {breakfast: {}, lunch: {}, dinner: {}, snack: {}}}
        profileMeals: defaultMealPlan, // Format: [{type: 'breakfast', time: '8:00 AM', ...meal}]
        
        // UI state - this will NOT be persisted
        isInitialized: false,
        isLoading: false,
        isSaving: false,
        savingState: {},
        lastError: null,
        
        // Profile-specific state
        activeSection: 'timeline', // 'timeline' or 'savedMeals'
        isLoadingSavedMeals: false,
        selectedDate: new Date(), // This is stored as string in persistence but we ensure it's a Date when accessed
        selectedMealType: null,
        nextMeal: null,
        currentMealIndex: 0,
        completedMeals: {},
        savedMeals: {
          breakfast: [],
          lunch: [],
          dinner: [], 
          snack: []
        },
        calorieData: {
          current: 0,
          target: 2000,
          protein: 0,
          carbs: 0,
          fat: 0
        },
        globalSettings: {
          measurementSystem: 'imperial',
          nutritionGoals: {
            calories: 2000,
            protein: 100,
            carbs: 250,
            fat: 65
          }
        },
        
        // Initialize the store - safe to call multiple times
        initialize: (initialProfileMeals = []) => {
          const state = get();
          // Don't re-initialize if already done
          if (state.isInitialized) return;
          
          // Set initial meals if provided
          if (Array.isArray(initialProfileMeals) && initialProfileMeals.length > 0) {
            set(state => {
              state.profileMeals = initialProfileMeals;
            });
          }
          
          // Mark as initialized
          set(state => {
            state.isInitialized = true;
            state.lastError = null;
          });
          
          console.log("[MealPlanStore] Initialized");
        },
        
        // Core actions
        setActivePlanId: (id) => set(state => {
          state.activePlanId = id;
        }),
        
        setPlanName: (name) => set(state => {
          state.planName = name;
        }),
        
        setIsLoading: (isLoading) => set(state => {
          state.isLoading = isLoading;
        }),
        
        setIsSaving: (isSaving) => set(state => {
          state.isSaving = isSaving;
        }),
        
        // Update planner format meals
        setPlannerMeals: (meals) => set(state => {
          state.plannerMeals = meals;
        }),
        
        // Update profile format meals
        setProfileMeals: (meals) => set(state => {
          state.profileMeals = meals;
        }),
        
        // Update a specific meal in both formats with standardized fields
        updateMeal: (meal, mealType, date) => set(state => {
          const dateKey = formatDateKey(date);
          
          // Create standardized meal object with all required fields
          const standardizedMeal = {
            id: meal.id,
            recipe_id: meal.recipe_id || meal.id,
            name: meal.title || meal.name || "",
            title: meal.title || meal.name || "",
            meal_type: mealType,
            type: mealType,
            nutrition: meal.nutrition || {
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0
            },
            ingredients: meal.ingredients || [],
            instructions: meal.instructions || '',
            image: meal.imageUrl || meal.image || "",
            imageUrl: meal.imageUrl || meal.image || "",
            completed: meal.completed || false
          };
          
          // Update planner format (date-keyed object)
          if (!state.plannerMeals[dateKey]) {
            state.plannerMeals[dateKey] = {};
          }
          
          state.plannerMeals[dateKey][mealType] = standardizedMeal;
          
          // Update profile format if it's today's date
          const today = getTodayDateString();
          if (dateKey === today) {
            const mealIndex = state.profileMeals.findIndex(m => m.type === mealType);
            if (mealIndex !== -1) {
              state.profileMeals[mealIndex] = {
                ...state.profileMeals[mealIndex],
                name: standardizedMeal.name,
                title: standardizedMeal.title,
                nutrition: standardizedMeal.nutrition,
                image: standardizedMeal.image,
                imageUrl: standardizedMeal.imageUrl,
                id: standardizedMeal.id
              };
            }
          }
        }),
        
        // Remove a meal from both formats
        removeMeal: (mealType, date) => set(state => {
          const dateKey = formatDateKey(date);
          
          // Remove from planner format
          if (state.plannerMeals[dateKey] && state.plannerMeals[dateKey][mealType]) {
            delete state.plannerMeals[dateKey][mealType];
            
            // If no more meals for this date, remove the date entry
            if (Object.keys(state.plannerMeals[dateKey]).length === 0) {
              delete state.plannerMeals[dateKey];
            }
          }
          
          // Update profile format if it's today's date
          const today = getTodayDateString();
          if (dateKey === today) {
            const mealIndex = state.profileMeals.findIndex(m => m.type === mealType);
            if (mealIndex !== -1) {
              // Reset meal properties but keep type and time
              const currentMeal = state.profileMeals[mealIndex];
              state.profileMeals[mealIndex] = {
                ...currentMeal,
                name: '',
                title: '',
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
            }
          }
        }),
        
        // Clear all meals from both formats
        clearAllMeals: () => set(state => {
          // Clear planner format
          state.plannerMeals = {};
          
          // Reset profile format to empty template
          state.profileMeals = state.profileMeals.map(meal => ({
            type: meal.type,
            time: meal.time,
            name: '',
            title: '',
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
          }));
          
          // Reset plan info
          state.activePlanId = null;
          state.planName = "";
        }),
        
        // Profile-specific actions
        setActiveSection: (section) => set(state => {
          state.activeSection = section;
        }),
        
        setIsLoadingSavedMeals: (isLoading) => set(state => {
          state.isLoadingSavedMeals = isLoading;
        }),
        
        // Set the selected date, ensuring it's a Date object
        setSelectedDate: (date) => set(state => {
          state.selectedDate = date instanceof Date ? date : new Date(date);
        }),
        
        // Get selected date, ensuring it's a Date object
        getSelectedDate: () => {
          const state = get();
          return state.selectedDate instanceof Date ? state.selectedDate : new Date(state.selectedDate);
        },
        
        setSelectedMealType: (mealType) => set(state => {
          state.selectedMealType = mealType;
        }),
        
        setCurrentMealIndex: (index) => set(state => {
          state.currentMealIndex = index;
        }),
        
        updateNextMealCard: (meal) => set(state => {
          state.nextMeal = meal;
        }),
        
        setSavedMeals: (mealType, meals) => set(state => {
          state.savedMeals[mealType] = meals;
        }),
        
        setCompletedMeals: (completions) => set(state => {
          // Create a fresh copy of the completions to avoid read-only issues
          state.completedMeals = { ...completions };
          
          // Also update the completed property on profileMeals for consistency
          if (state.profileMeals && state.profileMeals.length > 0) {
            state.profileMeals.forEach((meal, index) => {
              if (meal.type && completions[meal.type] !== undefined) {
                state.profileMeals[index].completed = completions[meal.type];
              }
            });
          }
          
          // After updating completions, also update the calorie counts
          setTimeout(() => {
            get().updateCalorieCount();
          }, 0);
        }),
        
        setCalorieData: (data) => set(state => {
          state.calorieData = { ...state.calorieData, ...data };
        }),
        
        setGlobalSettings: (settings) => set(state => {
          state.globalSettings = { ...state.globalSettings, ...settings };
        }),
        
        // Update calorie count based on current meal plan and completion status
        updateCalorieCount: () => set(state => {
          let totalCalories = 0;
          let totalProtein = 0;
          let totalCarbs = 0;
          let totalFat = 0;
          
          // Only count calories from completed meals
          state.profileMeals.forEach(meal => {
            // Check if meal is completed - first check the meal's own completed property,
            // then fall back to the completedMeals state object
            const isCompleted = meal.completed === true || state.completedMeals[meal.type] === true;
            
            // Check if the meal has actual content (has an id)
            const hasMealContent = !!meal.id;
            
            // Only add nutrition from completed meals that have content
            if (isCompleted && hasMealContent && meal.nutrition) {
              // Convert string values to numbers if needed - use parseFloat for decimal values
              const calories = typeof meal.nutrition.calories === 'string' 
                ? parseFloat(meal.nutrition.calories) || 0 
                : meal.nutrition.calories || 0;
                
              const protein = typeof meal.nutrition.protein === 'string'
                ? parseFloat(meal.nutrition.protein) || 0
                : meal.nutrition.protein || 0;
                
              const carbs = typeof meal.nutrition.carbs === 'string'
                ? parseFloat(meal.nutrition.carbs) || 0
                : meal.nutrition.carbs || 0;
                
              const fat = typeof meal.nutrition.fat === 'string'
                ? parseFloat(meal.nutrition.fat) || 0
                : meal.nutrition.fat || 0;
              
              // Add to totals - ensure numbers with || 0
              totalCalories += calories || 0;
              totalProtein += protein || 0;
              totalCarbs += carbs || 0;
              totalFat += fat || 0;
            }
          });
          
          // Update the calorie data with numbers only
          state.calorieData = {
            ...state.calorieData,
            current: totalCalories,
            protein: totalProtein,
            carbs: totalCarbs,
            fat: totalFat
          };
        }),
        
        // Mark a meal as eaten (toggle completion)
        markMealAsEaten: () => {
          // Get current state
          const state = get();
          
          // Get current meal based on current index
          if (state.currentMealIndex >= 0 && state.currentMealIndex < state.profileMeals.length) {
            const mealType = state.profileMeals[state.currentMealIndex].type;
            const dateKey = formatDateKey(new Date());
            
            // Get current completed status to toggle it
            const mealIndex = state.profileMeals.findIndex(meal => meal.type === mealType);
            let newCompleted = false;
            
            if (mealIndex !== -1) {
              // New status is the opposite of current status
              newCompleted = !state.profileMeals[mealIndex].completed;
              
              // Update state directly instead of calling toggleMealCompletion
              set(state => {
                // Update in profile format
                if (mealIndex !== -1) {
                  state.profileMeals[mealIndex].completed = newCompleted;
                }
                
                // Update in planner format
                if (state.plannerMeals[dateKey]?.[mealType]) {
                  state.plannerMeals[dateKey][mealType].completed = newCompleted;
                }
              });
            }
            
            return newCompleted;
          }
          
          return false;
        },
        
        // Update meal times based on current time
        updateMealTimes: () => {
          // Get current state without using immer
          const currentState = get();
          const now = new Date();
          const currentTime = now.getHours() * 60 + now.getMinutes(); // Time in minutes
          
          // Get meal times
          const mealTimes = [];
          for (let i = 0; i < currentState.profileMeals.length; i++) {
            const meal = currentState.profileMeals[i];
            if (!meal || !meal.time) {
              mealTimes.push(0);
              continue;
            }
            
            try {
              const [time, period] = meal.time.split(' ');
              const [hours, minutes] = time.split(':').map(Number);
              let totalMinutes = hours * 60 + (minutes || 0);
              
              // Convert from 12-hour to 24-hour for calculation
              if (period === 'PM' && hours < 12) totalMinutes += 12 * 60;
              if (period === 'AM' && hours === 12) totalMinutes -= 12 * 60;
              
              mealTimes.push(totalMinutes);
            } catch (error) {
              mealTimes.push(0);
            }
          }
          
          // Find next upcoming meal
          let nextMealIndex = -1;
          let smallestDiff = Infinity;
          
          for (let i = 0; i < mealTimes.length; i++) {
            const mealTime = mealTimes[i];
            if (mealTime > currentTime && mealTime - currentTime < smallestDiff) {
              smallestDiff = mealTime - currentTime;
              nextMealIndex = i;
            }
          }
          
          // If no upcoming meal today, use the first meal
          if (nextMealIndex === -1) {
            nextMealIndex = 0;
          }
          
          // Create nextMeal data
          let nextMeal = null;
          if (nextMealIndex >= 0 && nextMealIndex < currentState.profileMeals.length) {
            const sourceMeal = currentState.profileMeals[nextMealIndex];
            nextMeal = {
              type: sourceMeal.type || 'breakfast',
              time: sourceMeal.time || '8:00 AM',
              name: sourceMeal.name || '',
              nutrition: {
                calories: sourceMeal.nutrition?.calories || 0,
                protein: sourceMeal.nutrition?.protein || 0,
                carbs: sourceMeal.nutrition?.carbs || 0,
                fat: sourceMeal.nutrition?.fat || 0
              },
              image: sourceMeal.image || '',
              imageUrl: sourceMeal.imageUrl || '',
              id: sourceMeal.id || null,
              completed: sourceMeal.completed || false
            };
          }
          
          // Update state with a single immer transaction
          set(state => {
            state.currentMealIndex = nextMealIndex;
            if (nextMeal) {
              state.nextMeal = nextMeal;
            }
          });
          
          return nextMealIndex;
        },
        
        // Load settings from localStorage
        loadSettingsFromStorage: () => {
          if (typeof window === 'undefined') return;
          
          try {
            // Try to get settings from localStorage
            const storedSettings = localStorage.getItem('grovli-user-settings');
            if (storedSettings) {
              const settings = JSON.parse(storedSettings);
              set(state => {
                state.globalSettings = { ...state.globalSettings, ...settings };
              });
            }
          } catch (error) {
            console.error('Error loading settings from storage:', error);
          }
        },
        
        // Toggle meal completion in both formats and update calorie data
        toggleMealCompletion: (mealType, date) => {
          const state = get();
          const dateKey = formatDateKey(date);
          
          // Find the meal in the profile meals
          let newCompleted = false;
          const mealIndex = state.profileMeals.findIndex(meal => meal.type === mealType);
          
          if (mealIndex !== -1) {
            // Current completion status - check both sources
            const currentCompleted = state.profileMeals[mealIndex].completed || 
                                    state.completedMeals[mealType];
            
            // Toggle completion status
            newCompleted = !currentCompleted;
            
            // Update both state formats to ensure consistency
            set(state => {
              // Update profile meal status
              state.profileMeals[mealIndex].completed = newCompleted;
              
              // Update completedMeals state with a new object to trigger updates
              state.completedMeals = {
                ...state.completedMeals,
                [mealType]: newCompleted
              };
              
              // Update planner format if it exists
              if (state.plannerMeals[dateKey]?.[mealType]) {
                state.plannerMeals[dateKey][mealType].completed = newCompleted;
              }
            });
            
            // Force immediate calorie recalculation in a separate transaction 
            // This prevents any race conditions with state updates
            setTimeout(() => {
              get().updateCalorieCount();
            }, 0);
          } else {
            // If no meal found in profile meals, just update the completion state
            set(state => {
              // Get current status
              const currentStatus = state.completedMeals[mealType] || false;
              
              // Toggle it
              const newStatus = !currentStatus;
              
              // Update completedMeals state with a completely new object
              state.completedMeals = {
                ...state.completedMeals,
                [mealType]: newStatus
              };
              
              // Set return value
              newCompleted = newStatus;
            });
            
            // Force immediate calorie recalculation in a separate transaction
            setTimeout(() => {
              get().updateCalorieCount();
            }, 0);
          }
          
          return newCompleted;
        },
        
        // Format meals for API submission - redesigned to avoid read-only property issues
        formatMealsForApi: () => {
          const state = get();
          const meals = [];
          
          try {
            // Create a deep copy of the planner meals to avoid modifying read-only properties
            // Use try-catch to handle potential circular references or other JSON issues
            const plannerMealsCopy = JSON.parse(JSON.stringify(state.plannerMeals || {}));
            
            // Convert from planner format (preferred for complete data)
            Object.entries(plannerMealsCopy).forEach(([dateKey, dateMeals]) => {
              Object.entries(dateMeals).forEach(([mealType, meal]) => {
                if (meal && meal.id) {
                  // Just extract the minimal data needed for API submission
                  meals.push({
                    date: dateKey,
                    mealType: mealType,
                    mealId: meal.id
                  });
                }
              });
            });
            
            // If planner format is empty, try profile format
            if (meals.length === 0 && Array.isArray(state.profileMeals) && state.profileMeals.length > 0) {
              const today = getTodayDateString();
              
              // Use safer map instead of forEach to avoid modifying the original
              state.profileMeals
                .filter(meal => meal && meal.id) // Only process meals with IDs
                .forEach(meal => {
                  // Extract just what we need for the API
                  meals.push({
                    date: today,
                    mealType: meal.type,
                    mealId: meal.id
                  });
                });
            }
          } catch (err) {
            console.error('Error in formatMealsForApi:', err);
            // Return an empty array to avoid breaking the API call
          }
          
          return {
            planId: state.activePlanId,
            meals: meals
          };
        }
      }))),
      {
        name: 'grovli-meal-plan-store-v2',
        storage: createJSONStorage(() => localStorage),
        
        // Only persist essential data, not UI state
        partialize: (state) => ({
          activePlanId: state.activePlanId,
          planName: state.planName,
          plannerMeals: state.plannerMeals
          // Explicitly NOT persisting: profileMeals (derived data), isLoading, isSaving, etc.
        }),
        
        // Handle rehydration (loading from storage)
        onRehydrateStorage: () => {
          console.log("[MealPlanStore] Starting rehydration");
          
          // Return the handler that's called when rehydration is finished
          return (state, error) => {
            if (error) {
              console.error("[MealPlanStore] Failed to rehydrate:", error);
            } else {
              console.log("[MealPlanStore] Successfully rehydrated");
              
              // If the store has been rehydrated, update flag and convert dates
              if (state) {
                set(state => {
                  state.isInitialized = true;
                  
                  // Ensure selectedDate is a Date object after rehydration
                  if (state.selectedDate && !(state.selectedDate instanceof Date)) {
                    try {
                      state.selectedDate = new Date(state.selectedDate);
                    } catch (e) {
                      console.warn("[MealPlanStore] Failed to convert selectedDate to Date, using current date instead");
                      state.selectedDate = new Date();
                    }
                  } else if (!state.selectedDate) {
                    // If selectedDate is null or undefined, initialize it
                    state.selectedDate = new Date();
                  }
                });
              }
            }
          };
        }
      }
    )
  )
);

// Safe initialization function - can be called anywhere
export function initializeMealPlanStore(initialProfileMeals = []) {
  // Only run on client side
  if (typeof window === 'undefined') return { success: false };
  
  try {
    const store = useMealPlanStore.getState();
    
    // Initialize the store
    if (!store.isInitialized) {
      store.initialize(initialProfileMeals);
      return { success: true };
    }
    
    return { success: true, alreadyInitialized: true };
  } catch (error) {
    console.error("[MealPlanStore] Initialization error:", error);
    return { success: false, error: error.message };
  }
}