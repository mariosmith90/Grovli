"use client";

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Helper to safely parse numeric values from nutrition data
function safeParseNumber(value, defaultValue = 0) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

// Create the calorie store with persistence
export const useCalorieStore = create(
  persist(
    (set, get) => ({
      currentCalories: 0,
      targetCalories: 2000, // Default value
      macros: { protein: 0, carbs: 0, fat: 0 },
      mealNutrition: {}, // Stores nutrition by meal type
      
      // Set complete calorie data object
      setCalorieData: (data) => set(data),
      
      // Update target calories
      setTargetCalories: (calories) => set({ targetCalories: safeParseNumber(calories, 2000) }),
      
      // Store nutrition for a specific meal
      setMealNutrition: (mealType, nutrition) => set(state => ({
        mealNutrition: {
          ...state.mealNutrition,
          [mealType]: {
            calories: safeParseNumber(nutrition?.calories),
            protein: safeParseNumber(nutrition?.protein),
            carbs: safeParseNumber(nutrition?.carbs),
            fat: safeParseNumber(nutrition?.fat)
          }
        }
      })),
      
      // Calculate calories from meals and completion statuses
      calculateFromMeals: (meals, completions) => {
        // Initialize totals with explicit numbers
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;
        
        // Process each meal
        if (meals && Array.isArray(meals)) {
          meals.forEach(meal => {
            // First check if meal has a type (required)
            if (!meal || !meal.type) return;
            
            // Check completion status from both sources - this needs to match the UI check
            const isCompleted = completions && 
              (completions[meal.type] === true || meal.completed === true);
              
            if (!isCompleted) return;
            
            // Skip if no meal ID (empty meal slot)
            const hasMealContent = !!meal.id;
            if (!hasMealContent) return;
            
            // Get nutrition data
            if (meal.nutrition) {
              // Parse all values to ensure they're numbers
              const calories = safeParseNumber(meal.nutrition.calories);
              const protein = safeParseNumber(meal.nutrition.protein);
              const carbs = safeParseNumber(meal.nutrition.carbs);
              const fat = safeParseNumber(meal.nutrition.fat);
              
              // Add to totals with safeguards against NaN
              totalCalories += isNaN(calories) ? 0 : calories;
              totalProtein += isNaN(protein) ? 0 : protein;
              totalCarbs += isNaN(carbs) ? 0 : carbs;
              totalFat += isNaN(fat) ? 0 : fat;
              
              // Also store individual meal nutrition
              get().setMealNutrition(meal.type, {
                calories,
                protein,
                carbs,
                fat
              });
            }
          });
        }
        
        // Update state - ensure values are numbers
        set({
          currentCalories: Number(totalCalories),
          macros: {
            protein: Number(totalProtein),
            carbs: Number(totalCarbs),
            fat: Number(totalFat)
          }
        });
        
        return {
          calories: Number(totalCalories),
          protein: Number(totalProtein),
          carbs: Number(totalCarbs),
          fat: Number(totalFat)
        };
      },
      
      // Import settings
      importSettings: (settings) => {
        if (!settings) return;
        
        set({
          targetCalories: safeParseNumber(settings.calories, 2000)
        });
      }
    }),
    {
      name: 'grovli-calorie-store',
      storage: createJSONStorage(() => localStorage)
    }
  )
);

// Main hook to use calorie data with additional utilities
export function useCalorieService() {
  const store = useCalorieStore();
  
  // Calculate percentage of target
  const calculatePercentage = () => {
    const { currentCalories, targetCalories } = store;
    return Math.min(Math.round((currentCalories / targetCalories) * 100), 100);
  };
  
  // Calculate remaining calories
  const calculateRemaining = () => {
    const { currentCalories, targetCalories } = store;
    return targetCalories - currentCalories;
  };
  
  // Check if goal is reached
  const isGoalReached = () => {
    return calculateRemaining() <= 0;
  };
  
  return {
    // Re-export store state and methods
    ...store,
    
    // Add computed values
    percentage: calculatePercentage(),
    remaining: calculateRemaining(),
    isGoalReached: isGoalReached()
  };
}