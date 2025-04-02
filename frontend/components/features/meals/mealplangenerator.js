"use client";
import { useState, useEffect } from 'react';
import { useMealStore } from '../../../lib/stores/mealStore';

export default function MealPlanGenerator({
  preferences,
  mealType,
  numDays,
  globalSettings,
  isPro,
  getAuthHeaders,
  onError,
  onProcessingStarted,
  showChatbot
}) {
  const [loading, setLoading] = useState(false);
  
  const { 
    resetMealGeneration,
    setIsGenerating,
    setMealGenerationComplete,
    setCurrentMealPlanId,
    setHasViewedGeneratedMeals
  } = useMealStore();

  const generateMealPlan = async () => {
    // Final Pro status check before generating meal plan
    if (!isPro && (mealType === "Full Day" || numDays > 1)) {
      onError("Pro subscription required for this feature");
      return;
    }
  
    // Reset previous states and start generation in one atomic action
    useMealStore.getState().startMealGeneration({
      mealType,
      numDays,
      preferences
    });
    setLoading(true);
    
    try {
      // Get pantry ingredients if using pantry algorithm
      let pantryIngredients = [];
      const algorithm = globalSettings.mealAlgorithm || 'experimental';
      
      if (algorithm === 'pantry') {
        try {
          // Use auth context to get token
          const headers = await getAuthHeaders();
          
          const pantryResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-pantry/items`, { headers });
          
          if (pantryResponse.ok) {
            const pantryData = await pantryResponse.json();
            pantryIngredients = pantryData.items.map(item => item.name);
          }
        } catch (error) {
          console.error("Error fetching pantry ingredients:", error);
        }
      }
      
      // Prepare request headers
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const headers = await getAuthHeaders();
      
      // Add content type
      headers['Content-Type'] = 'application/json';
      
      // Show chatbot if callback provided
      if (onProcessingStarted) {
        onProcessingStarted();
      }
      
      // Send meal plan request
      console.log("Sending meal plan request to:", `${apiUrl}/mealplan/`);
      const response = await fetch(`${apiUrl}/mealplan/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dietary_preferences: preferences,
          meal_type: mealType,
          num_days: numDays,
          carbs: globalSettings.carbs,
          calories: globalSettings.calories,
          protein: globalSettings.protein,
          sugar: globalSettings.sugar,
          fat: globalSettings.fat,
          fiber: globalSettings.fiber,
          meal_algorithm: algorithm,
          pantry_ingredients: pantryIngredients
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || 
          errorData.detail || 
          `HTTP error ${response.status}`
        );
      }
      
      const data = await response.json();
      console.log("API Response Data:", data);
  
      // Case 1: Immediate meal plan data
      if (data.meal_plan && Array.isArray(data.meal_plan)) {
        console.log("Received immediate meal plan");
        
        // Use the Zustand action for atomic state update
        useMealStore.getState().handleMealPlanSuccess(
          data.meal_plan,
          data.meal_plan_id || `${mealType}_${Date.now()}`
        );
        
        return {
          immediate: true,
          mealPlan: data.meal_plan
        };
      }
      
      // Case 2: Background processing response
      if (data.status === "processing" && data.meal_plan_id) {
        console.log("Meal plan processing in background");
        
        // Use request_hash if available, otherwise fallback to meal_plan_id
        const taskIdentifier = data.request_hash || data.meal_plan_id;
        setCurrentMealPlanId(data.meal_plan_id);
        
        // Start tracking background task using Zustand's startTaskChecking method
        console.log(`[MealPlanGenerator] Starting task tracking for ID: ${data.meal_plan_id}`);
        
        // Use the store's combined action for task checking
        useMealStore.getState().startTaskChecking(taskIdentifier);
        
        return {
          immediate: false,
          mealPlanId: data.meal_plan_id,
          taskId: taskIdentifier
        };
      }
      
      // Case 3: Unexpected response format
      throw new Error("Invalid API response format");
      
    } catch (error) {
      console.error('Error fetching meal plan:', error);
      onError(`Error: ${error.message}`);
      setIsGenerating(false);
      return { error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Return the meal plan generation function and loading state
  return { 
    generateMealPlan,
    loading
  };
}