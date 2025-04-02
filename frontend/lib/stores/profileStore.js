"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// Default meal structure - centralized here to avoid duplication
export const defaultMeal = {
  name: '',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  image: '',
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

// Default meal type icons configuration
export const mealTypeIcons = {
  breakfast: 'Coffee',
  lunch: 'Utensils',
  snack: 'Apple',
  dinner: 'Moon'
};

// Default global settings
export const defaultGlobalSettings = {
  calculationMode: 'auto',
  calories: 2000,
  carbs: 270,
  protein: 180,
  fat: 67,
  fiber: 34,
  sugar: 60
};

// Helper function to format date as YYYY-MM-DD
export const formatDateKey = (date) => {
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
};

// Get today's date in YYYY-MM-DD format
export const getTodayDateString = () => {
  return new Date().toISOString().split('T')[0];
};

// Helper function for converting time string to minutes
export const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':');
  hours = parseInt(hours);
  minutes = parseInt(minutes || 0);
  if (modifier?.toLowerCase() === 'pm' && hours < 12) hours += 12;
  if (modifier?.toLowerCase() === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

// Create a store with the immer and persist middleware
// Following Zustand best practices for complex state management
export const useProfileStore = create(
  persist(
    immer((set, get) => ({
      // UI State
      activeSection: 'timeline',
      isLoadingSavedMeals: false,
      selectedDate: new Date(),
      selectedMealType: null,

      // Loading State
      isDataLoading: false,
      isLoadingPlans: true,
      isDataReady: false,
      
      // User Meal Data
      mealPlan: [...defaultMealPlan],
      nextMeal: {
        ...defaultMeal,
        time: '8:00 AM',
        type: 'breakfast'
      },
      userPlans: [],
      activePlanId: null,
      completedMeals: {},
      calorieData: { consumed: 0, target: 2000 },
      savingMeals: {},
      currentMealIndex: 0,
      
      // User Settings
      globalSettings: { ...defaultGlobalSettings },
      
      // Saved Meals
      savedMeals: {
        breakfast: [],
        lunch: [],
        snack: [],
        dinner: []
      },
      
      // Basic actions to update state
      setActiveSection: (section) => 
        set(state => { state.activeSection = section; }),
        
      setIsLoadingSavedMeals: (isLoading) => 
        set(state => { state.isLoadingSavedMeals = isLoading; }),
        
      setSelectedDate: (date) => 
        set(state => { state.selectedDate = date; }),
        
      setSelectedMealType: (type) => 
        set(state => { state.selectedMealType = type; }),
        
      setIsDataLoading: (isLoading) => 
        set(state => { state.isDataLoading = isLoading; }),
        
      setIsLoadingPlans: (isLoading) => 
        set(state => { state.isLoadingPlans = isLoading; }),
        
      setIsDataReady: (isReady) => 
        set(state => { state.isDataReady = isReady; }),
        
      setMealPlan: (mealPlan) => 
        set(state => { state.mealPlan = mealPlan; }),
        
      updateMealInPlan: (index, mealData) => 
        set(state => { 
          if (index >= 0 && index < state.mealPlan.length) {
            state.mealPlan[index] = { ...state.mealPlan[index], ...mealData };
          }
        }),
        
      setNextMeal: (meal) => 
        set(state => { state.nextMeal = meal; }),
        
      setUserPlans: (plans) => 
        set(state => { state.userPlans = plans; }),
        
      setActivePlanId: (id) => 
        set(state => { state.activePlanId = id; }),
        
      setCompletedMeals: (completedMeals) => 
        set(state => { state.completedMeals = completedMeals; }),
        
      updateCompletedMeal: (mealType, completed) => 
        set(state => { 
          state.completedMeals[mealType] = completed;
          
          // Also update the meal plan if it exists
          const mealIndex = state.mealPlan.findIndex(m => m.type === mealType);
          if (mealIndex !== -1) {
            state.mealPlan[mealIndex].completed = completed;
          }
        }),
        
      setSavingMeals: (savingMeals) => 
        set(state => { state.savingMeals = savingMeals; }),
        
      setCurrentMealIndex: (index) => 
        set(state => { state.currentMealIndex = index; }),
        
      setCalorieData: (calorieData) => 
        set(state => { state.calorieData = calorieData; }),
        
      setGlobalSettings: (settings) => 
        set(state => { state.globalSettings = settings; }),
        
      setSavedMeals: (savedMeals) => 
        set(state => { state.savedMeals = savedMeals; }),
        
      updateSavedMealsForType: (mealType, meals) => 
        set(state => { 
          state.savedMeals[mealType] = meals; 
        }),
      
      // Complex actions
      updateNextMealCard: (meal) => {
        if (!meal) return;
        
        set(state => {
          state.nextMeal = {
            name: meal.name || "No meal planned",
            time: meal.time || "12:00 PM",
            calories: meal.calories || 0,
            protein: meal.protein || 0,
            carbs: meal.carbs || 0,
            fat: meal.fat || 0,
            image: meal.image || "",
            type: meal.type || "snack"
          };
        });
      },
      
      updateCalorieCount: () => {
        const { mealPlan, globalSettings } = get();
        
        // Skip if meal plan isn't valid
        if (!Array.isArray(mealPlan)) return;
        
        // Only count meals that have a name (are set)
        const plannedMeals = mealPlan.filter(meal => meal && meal.name);
        
        // Calculate total calories
        const totalCalories = plannedMeals.reduce((sum, meal) => 
          sum + (parseInt(meal?.calories) || 0), 0);
        
        // Calculate consumed calories
        const consumedCalories = plannedMeals
          .filter(meal => meal.completed === true)
          .reduce((sum, meal) => sum + (parseInt(meal?.calories) || 0), 0);
        
        // Update calorie data in store
        set(state => {
          state.calorieData = {
            consumed: consumedCalories,
            target: Math.max(totalCalories, globalSettings?.calories || 2000)
          };
        });
      },
      
      toggleMealCompletion: (mealType) => {
        // Get current state
        const { mealPlan, completedMeals } = get();
        
        // Find the meal in the meal plan
        const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
        if (mealIndex === -1) return false;
        
        // Toggle completion status
        const currentCompleted = mealPlan[mealIndex].completed || false;
        const newCompleted = !currentCompleted;
        
        // Update the store - immer takes care of immutability
        set(state => {
          // Update in meal plan
          state.mealPlan[mealIndex].completed = newCompleted;
          
          // Update in completed meals tracking
          state.completedMeals[mealType] = newCompleted;
        });
        
        // Update calorie counts
        get().updateCalorieCount();
        
        return newCompleted;
      },
      
      // Calculate current and next meal indices based on time
      getUpdatedMealIndices: () => {
        const { mealPlan } = get();
        
        // Only proceed if we have a valid meal plan
        if (!Array.isArray(mealPlan) || mealPlan.length === 0) {
          return { currentMealIndex: 0, nextMealIndex: 0 };
        }
        
        // Current time in minutes
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        // Filter to planned meals (that have names)
        const plannedMeals = mealPlan.filter(meal => meal.name);
        if (plannedMeals.length === 0) {
          return { currentMealIndex: 0, nextMealIndex: 0 };
        }
        
        // Find closest past meal
        let closestPastIndex = 0;
        let smallestPastDiff = Infinity;
        
        plannedMeals.forEach((meal, index) => {
          const mealMinutes = timeToMinutes(meal.time);
          const diff = currentMinutes - mealMinutes;
          if (diff >= 0 && diff < smallestPastDiff) {
            smallestPastDiff = diff;
            closestPastIndex = index;
          }
        });
        
        let currentIndex = closestPastIndex;
        
        // Find next non-completed meal
        let nextIndex = currentIndex;
        for (let i = currentIndex + 1; i < plannedMeals.length; i++) {
          if (!plannedMeals[i].completed) {
            nextIndex = i;
            break;
          }
        }
        
        // If all meals are completed or next is same as current,
        // find any other non-completed meal
        if (nextIndex === currentIndex) {
          for (let i = 0; i < plannedMeals.length; i++) {
            if (!plannedMeals[i].completed && i !== currentIndex) {
              nextIndex = i;
              break;
            }
          }
        }
        
        // Map back to original meal plan indices
        const originalCurrentIndex = mealPlan.findIndex(m => m.type === plannedMeals[currentIndex]?.type);
        const originalNextIndex = mealPlan.findIndex(m => m.type === plannedMeals[nextIndex]?.type);
        
        return {
          currentMealIndex: originalCurrentIndex >= 0 ? originalCurrentIndex : 0,
          nextMealIndex: originalNextIndex >= 0 ? originalNextIndex : 0
        };
      },
      
      // Update meals based on current time
      updateMealTimes: () => {
        const { mealPlan } = get();
        const indices = get().getUpdatedMealIndices();
        
        // First update the current meal index
        set(state => { state.currentMealIndex = indices.currentMealIndex; });
        
        // Then update the next meal card
        if (indices.nextMealIndex >= 0 && indices.nextMealIndex < mealPlan.length) {
          get().updateNextMealCard(mealPlan[indices.nextMealIndex]);
        }
        
        return indices;
      },
      
      // Reset meal plan to defaults
      resetMealPlan: () => {
        set(state => {
          state.mealPlan = [...defaultMealPlan];
          state.nextMeal = {
            ...defaultMeal,
            time: '8:00 AM',
            type: 'breakfast'
          };
          state.completedMeals = {};
          state.currentMealIndex = 0;
          state.activePlanId = null;
        });
      },
      
      // Mark current meal as eaten
      markMealAsEaten: () => {
        const { mealPlan, currentMealIndex } = get();
        
        // Check for valid index
        if (currentMealIndex < 0 || currentMealIndex >= mealPlan.length) return;
        
        // Get the meal type for the current meal
        const mealType = mealPlan[currentMealIndex].type;
        
        // Toggle meal completion in the store
        get().toggleMealCompletion(mealType);
        
        // Update meal times to find the next meal
        const { nextMealIndex } = get().getUpdatedMealIndices();
        
        // Update current meal index to next meal
        set(state => { state.currentMealIndex = nextMealIndex; });
        
        // Update next meal card
        if (nextMealIndex >= 0 && nextMealIndex < mealPlan.length) {
          get().updateNextMealCard(mealPlan[nextMealIndex]);
        }
      },
      
      // Switch to saved meals view for a specific meal type
      viewSavedMealsForType: (mealType) => {
        set(state => {
          state.selectedMealType = mealType;
          state.activeSection = 'savedMeals';
        });
      },
      
      // Load settings from localStorage
      loadSettingsFromStorage: () => {
        if (typeof window === 'undefined') return;
        
        try {
          const savedSettings = JSON.parse(localStorage.getItem('globalMealSettings') || '{}');
          if (Object.keys(savedSettings).length > 0) {
            console.log("Found settings in localStorage");
            
            set(state => {
              state.globalSettings = savedSettings;
              state.calorieData.target = savedSettings.calories || 2000;
            });
          }
        } catch (error) {
          console.error("Error loading settings from localStorage:", error);
        }
      },
      
      // Update activePlanId and associated meals
      setActivePlanWithMeals: (plan, initialCompletions = {}) => {
        if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
          return;
        }
        
        // First set the active plan ID
        set(state => { state.activePlanId = plan.id; });
        
        // Get today's meals
        const today = getTodayDateString();
        const todaysMeals = plan.meals.filter(mealItem => 
          mealItem.date === today || mealItem.current_day === true
        );
        
        if (todaysMeals.length === 0) {
          console.log("No meals planned for today");
          return;
        }
        
        // Start with current meal plan
        const { mealPlan } = get();
        const updatedMealPlan = [...mealPlan];
        
        // Default meal times by type
        const mealTypeToTime = {
          breakfast: '8:00 AM',
          lunch: '12:30 PM',
          snack: '3:30 PM',
          dinner: '7:00 PM'
        };
        
        // Update with plan meals
        set(state => { state.isDataLoading = true; });
        
        // Will be populated asynchronously after API calls
        return { 
          todaysMeals, 
          updatedMealPlan, 
          mealTypeToTime 
        };
      }
    })), 
    {
      name: "grovli-profile",
      storage: createJSONStorage(() => {
        // Use localStorage in browser, empty storage in SSR
        return typeof window !== 'undefined' 
          ? localStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {}
            };
      }),
      // Only persist these key parts of state
      partialize: (state) => ({
        globalSettings: state.globalSettings,
        activePlanId: state.activePlanId,
        calorieData: state.calorieData,
        completedMeals: state.completedMeals
      }),
      version: 1, // For future migrations
    }
  )
);

// SSR-safe function to access store state
export const getProfileState = () => {
  try {
    return useProfileStore.getState();
  } catch (error) {
    // Return default state for SSR contexts
    return {
      activeSection: 'timeline',
      isLoadingSavedMeals: false,
      selectedDate: new Date(),
      selectedMealType: null,
      isDataLoading: false,
      isLoadingPlans: true,
      isDataReady: false,
      mealPlan: [...defaultMealPlan],
      nextMeal: {
        ...defaultMeal,
        time: '8:00 AM',
        type: 'breakfast'
      },
      userPlans: [],
      activePlanId: null,
      completedMeals: {},
      calorieData: { consumed: 0, target: 2000 },
      savingMeals: {},
      currentMealIndex: 0,
      globalSettings: { ...defaultGlobalSettings },
      savedMeals: {
        breakfast: [],
        lunch: [],
        snack: [],
        dinner: []
      }
    };
  }
};