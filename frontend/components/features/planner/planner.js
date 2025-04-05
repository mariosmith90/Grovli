"use client"

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check, X, Loader } from "lucide-react";
import { useAuth } from "../../../lib/stores/authStore";
import { toast } from "react-hot-toast";
import { useMealPlanStore, formatDateKey, initializeMealPlanStore } from "../../../lib/stores/mealPlanStore";
import { useApiGet, useApiMutation } from "../../../lib/swr-client";

export function PlannerOverlay({ 
  isOpen, 
  onClose, 
  user, 
  recipe, 
  currentMealId 
}) {
  const router = useRouter();
  const auth = useAuth(); // Get auth at the top level
  const { updateMealPlan } = useApiMutation(); // Use SWR mutation hook
  const pantryMutation = useApiMutation(); // Separate mutation hook for pantry updates
  
  // State management
  const [userPlans, setUserPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMealType, setSelectedMealType] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [addingToPlanner, setAddingToPlanner] = useState(false);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [displayDates, setDisplayDates] = useState([]);
  const [addToPantry, setAddToPantry] = useState(false);
  
  // Use refs for throttling
  const lastUpdateTimeRef = useRef(0);
  const isProcessingRef = useRef(false);
  const throttleTime = 2000; // 2 seconds
  
  // Get Zustand store
  const mealPlanStore = useMealPlanStore();
  
  // Use SWR to fetch user plans if user is available
  const { data: userPlansData, error: userPlansError } = useApiGet(
    user ? `/api/user-plans/user/${user.sub}` : null,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000, // Only revalidate after 10 seconds
      onSuccess: (data) => {
        if (data && Array.isArray(data)) {
          setUserPlans(data);
          
          // If no selected plan yet, use the first one
          if (!selectedPlan && data.length > 0) {
            setSelectedPlan(data[0].id);
          }
          
          setupDateData();
        }
      }
    }
  );
  
  // Setup date data for the calendar
  const setupDateData = () => {
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    const todayStr = currentDate.toISOString().split('T')[0];
    const futureDates = [];
    
    for (let i = 0; i < 21; i++) {
      const futureDate = new Date(currentDate);
      futureDate.setDate(currentDate.getDate() + i);
      futureDates.push(futureDate.toISOString().split('T')[0]);
    }
    
    const weeks = [];
    for (let i = 0; i < futureDates.length; i += 7) {
      weeks.push(futureDates.slice(i, Math.min(i + 7, futureDates.length)));
    }
    
    setAvailableWeeks(weeks);
    setCurrentWeekIndex(0);
    
    if (weeks.length > 0) {
      setDisplayDates(weeks[0]);
      setSelectedDate(weeks[0][0]);
    }
  };
  
  // React to changes from other components
  useEffect(() => {
    // Initialize store when component mounts
    if (isOpen && user) {
      initializeMealPlanStore();
      setupDateData();
    }
    
    // With subscribeWithSelector middleware, we can use a selector function
    // Subscribe to specific parts of the state we care about
    const unsubscribeFromStore = useMealPlanStore.subscribe(
      // Select the parts of state we want to monitor
      (state) => [state.plannerMeals, state.activePlanId],
      // This function runs when the selected state changes
      ([plannerMeals, activePlanId]) => {
        console.log("[Planner] Detected meal plan store update");
        
        // Throttled fetch function to prevent loops
        const now = Date.now();
        if (now - lastUpdateTimeRef.current < throttleTime || isProcessingRef.current) {
          console.log("[Planner] Throttling store update handling");
          return;
        }
        
        lastUpdateTimeRef.current = now;
        isProcessingRef.current = true;
        
        // Trigger SWR revalidation for the user plans endpoint
        if (user) {
          // Manually update SWR with the latest data
          setTimeout(() => {
            isProcessingRef.current = false;
          }, throttleTime);
        }
      }
    );
    
    // Clean up
    return () => {
      unsubscribeFromStore();
    };
  }, [isOpen, user]);
  
  // Set meal type from recipe when modal opens
  useEffect(() => {
    if (isOpen && recipe.meal_type) {
      setSelectedMealType(recipe.meal_type.toLowerCase());
    }
  }, [isOpen, recipe]);
  
  const handlePlanChange = (planId) => {
    setSelectedPlan(planId);
    setupDateData();
  };
  
  // Format date for display
  const formatDateForDisplay = (dateString) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const isToday = dateString === todayStr;
    const date = new Date(dateString + 'T00:00:00');
    
    let formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short', 
      day: 'numeric'
    });
    
    if (isToday) {
      formattedDate = `Today, ${formattedDate}`;
    }
    
    return formattedDate;
  };
  
  // Navigate between weeks
  const goToPreviousWeek = () => {
    if (currentWeekIndex > 0) {
      const newIndex = currentWeekIndex - 1;
      setCurrentWeekIndex(newIndex);
      setDisplayDates(availableWeeks[newIndex]);
      setSelectedDate(availableWeeks[newIndex][0]);
    }
  };
  
  const goToNextWeek = () => {
    if (currentWeekIndex < availableWeeks.length - 1) {
      const newIndex = currentWeekIndex + 1;
      setCurrentWeekIndex(newIndex);
      setDisplayDates(availableWeeks[newIndex]);
      setSelectedDate(availableWeeks[newIndex][0]);
    }
  };
  
  // Fetch and prepare selected plan data
  const { data: selectedPlanData } = useApiGet(
    selectedPlan ? `/api/user-plans/${selectedPlan}` : null,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000, // Only revalidate after 10 seconds
    }
  );
  
  // Add meal to meal plan
  const addToMealPlan = async () => {
    if (!user || !selectedPlan || !selectedDate || !selectedMealType) {
      toast.error("Please select a plan, date, and meal type");
      return;
    }
  
    try {
      setAddingToPlanner(true);
      
      // Create the new meal with recipe data
      const newMeal = {
        id: currentMealId,
        recipe_id: currentMealId,
        name: recipe.title, // Add name field for compatibility
        title: recipe.title,
        meal_type: selectedMealType,
        type: selectedMealType, // Add type field for compatibility
        nutrition: {
          calories: recipe.nutrition?.calories || 0,
          protein: recipe.nutrition?.protein || 0,
          carbs: recipe.nutrition?.carbs || 0,
          fat: recipe.nutrition?.fat || 0
        },
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        image: recipe.imageUrl, // Add image field for compatibility
        imageUrl: recipe.imageUrl,
        completed: false
      };
      
      // First update the Zustand store with the new meal
      console.log("Updating Zustand store with new meal");
      mealPlanStore.setActivePlanId(selectedPlan);
      mealPlanStore.updateMeal(newMeal, selectedMealType, selectedDate);
      
      // If plan data is available, use it
      if (selectedPlanData) {
        // Manually format meals for API submission
        const existingMeals = selectedPlanData.meals || [];
        const formattedMeals = existingMeals
          .filter(m => !(m.date === selectedDate && m.mealType === selectedMealType)) // Remove existing meal at this slot
          .map(m => ({
            date: m.date,
            mealType: m.mealType,
            mealId: m.mealId
          }));
        
        // Add the new meal to the array
        formattedMeals.push({
          date: selectedDate,
          mealType: selectedMealType,
          mealId: currentMealId
        });
        
        // Use our SWR mutation hook to update the meal plan
        const updateData = {
          planId: selectedPlan,
          meals: formattedMeals
        };
        
        console.log("Update data:", JSON.stringify(updateData, null, 2));
        
        // Use the updateMealPlan function from our SWR hook
        await updateMealPlan(updateData, { 
          userId: user.sub
        });
      } else {
        // For new plans or when plan data is not available
        // Prepare the request data for API submission
        const requestData = {
          userId: user.sub,
          planName: `Meal Plan - ${new Date().toLocaleDateString()}`,
          meals: [{
            date: selectedDate,
            mealType: selectedMealType,
            mealId: currentMealId
          }]
        };
        
        // Use SWR mutation for saving a new plan
        await updateMealPlan({
          meals: requestData.meals,
          userId: user.sub,
          planName: requestData.planName
        }, { userId: user.sub });
      }
      
      // Handle pantry ingredients if needed
      if (addToPantry && recipe.ingredients?.length > 0) {
        const ingredientsToAdd = recipe.ingredients.map(ingredient => ({
          name: ingredient.name,
          quantity: ingredient.quantity ? parseFloat(ingredient.quantity) : 1,
          unit: ingredient.unit || ""
        }));
        
        // Use the pantry mutation hook declared at component level 
        await pantryMutation.post('/api/user-pantry/bulk-add', ingredientsToAdd);
      }
      
      toast.success(`Added to ${selectedMealType} on ${new Date(selectedDate).toLocaleDateString()}`);
      onClose();
    } catch (error) {
      console.error("Error adding to meal plan:", error);
      toast.error(error.message || "Failed to add meal to plan");
    } finally {
      setAddingToPlanner(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full transform transition-all duration-300">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-semibold text-gray-800 flex items-center">
            Add to Meal Plan
          </h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {loadingPlans || !userPlansData ? (
          <div className="flex items-center justify-center py-10">
            <Loader className="w-8 h-8 text-teal-500 animate-spin" />
          </div>
        ) : userPlans.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-600 mb-4">You don't have any meal plans yet.</p>
            <button
              onClick={() => router.push('/planner')}
              className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
            >
              Create a Meal Plan
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Select meal plan:
              </label>
              <select 
                className="w-full p-3 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 appearance-none shadow-sm"
                value={selectedPlan}
                onChange={(e) => handlePlanChange(e.target.value)}
              >
                {userPlans.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Select date:
              </label>
              <div className="flex items-center justify-between mb-2">
                <button 
                  onClick={goToPreviousWeek}
                  disabled={currentWeekIndex === 0}
                  className={`p-1 rounded-full ${currentWeekIndex === 0 ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-gray-600">
                  Week {currentWeekIndex + 1} of {availableWeeks.length}
                </span>
                <button 
                  onClick={goToNextWeek}
                  disabled={currentWeekIndex >= availableWeeks.length - 1}
                  className={`p-1 rounded-full ${currentWeekIndex >= availableWeeks.length - 1 ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                {displayDates.map((date, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(date)}
                    className={`p-2 rounded-lg border-2 transition-colors text-left ${
                      selectedDate === date
                        ? "bg-teal-50 border-teal-500 text-teal-700"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-xs font-medium truncate">
                      {formatDateForDisplay(date)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {!recipe.meal_type && (
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Select meal type:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {["breakfast", "lunch", "dinner", "snack"].map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedMealType(type)}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        selectedMealType === type
                          ? "bg-teal-50 border-teal-500 text-teal-700"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="capitalize">{type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="addToPantry"
                checked={addToPantry}
                onChange={() => setAddToPantry(!addToPantry)}
                className="mr-2 text-teal-500 focus:ring-teal-500 border-gray-300 rounded"
              />
              <label 
                htmlFor="addToPantry" 
                className="text-gray-700"
              >
                Add ingredients to pantry
              </label>
            </div>

            <div className="pt-4">
              <button
                onClick={addToMealPlan}
                disabled={addingToPlanner || !selectedPlan || !selectedDate || !selectedMealType}
                className={`w-full py-3 rounded-lg transition-colors flex items-center justify-center font-medium ${
                  addingToPlanner || !selectedPlan || !selectedDate || !selectedMealType
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-teal-500 text-white hover:bg-teal-600"
                }`}
              >
                {addingToPlanner ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Add to Plan
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}