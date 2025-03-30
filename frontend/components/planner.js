"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check, X, Loader } from "lucide-react";
import { getAccessToken } from "@auth0/nextjs-auth0";
import { toast } from "react-hot-toast";

export function PlannerOverlay({ 
  isOpen, 
  onClose, 
  user, 
  recipe, 
  currentMealId 
}) {
  const router = useRouter();
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

  useEffect(() => {
    if (isOpen && user) {
      fetchUserMealPlans();
      if (recipe.meal_type) {
        setSelectedMealType(recipe.meal_type.toLowerCase());
      }
    }
  }, [isOpen, user, recipe]);

  const fetchUserMealPlans = async () => {
    if (!user) return;
    
    try {
      setLoadingPlans(true);
      
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-plans/user/${user.sub}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch plans: ${response.status}`);
      }
      
      const plans = await response.json();
      
      if (plans.length > 0) {
        setUserPlans(plans);
        setSelectedPlan(plans[0].id);
        
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
      }
    } catch (error) {
      console.error('Error fetching user meal plans:', error);
      toast.error('Failed to load your meal plans');
    } finally {
      setLoadingPlans(false);
    }
  };

  const handlePlanChange = (planId) => {
    setSelectedPlan(planId);
    
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
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
    } else {
      setDisplayDates([]);
      setSelectedDate("");
    }
  };

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

  const addToMealPlan = async () => {
    if (!user || !selectedPlan || !selectedDate || !selectedMealType) {
      toast.error("Please select a plan, date, and meal type");
      return;
    }
  
    try {
      setAddingToPlanner(true);
      
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
      const planResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-plans/${selectedPlan}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!planResponse.ok) {
        throw new Error("Failed to get plan details");
      }
      
      const planData = await planResponse.json();
      
      const filteredMeals = (planData.meals || []).filter(meal => 
        !(meal.date === selectedDate && meal.mealType === selectedMealType)
      );
      
      const mealsToSave = filteredMeals.map(meal => ({
        date: meal.date,
        mealType: meal.mealType,
        mealId: meal.meal?.id || meal.mealId || "",
        meal_name: meal.meal?.name || meal.meal?.title || "Unnamed Meal",
        meal_type: meal.meal?.meal_type || meal.mealType,
        macros: meal.meal?.nutrition || {},
        ingredients: meal.meal?.ingredients || [],
        instructions: meal.meal?.instructions || "",
        imageUrl: meal.meal?.imageUrl || "",
        calories: meal.meal?.nutrition?.calories || 0
      }));
      
      mealsToSave.push({
        date: selectedDate,
        mealType: selectedMealType,
        mealId: currentMealId,
        meal_name: recipe.title || recipe.name || "Unnamed Meal",
        meal_type: selectedMealType,
        macros: recipe.nutrition || {},
        ingredients: recipe.ingredients || [],
        instructions: recipe.instructions || "",
        imageUrl: recipe.imageUrl || "",
        calories: recipe.nutrition?.calories || 0
      });
      
      const saveResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-plans/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          userId: user.sub,
          planName: planData.name,
          meals: mealsToSave
        })
      });
      
      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.detail || "Failed to save meal plan");
      }
      
      localStorage.setItem('mealPlanLastUpdated', new Date().toISOString());
      
      if (addToPantry && recipe.ingredients?.length > 0) {
        const ingredientsToAdd = recipe.ingredients.map(ingredient => ({
          name: ingredient.name,
          quantity: ingredient.quantity ? parseFloat(ingredient.quantity) : 1,
          unit: ingredient.unit || ""
        }));
        
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-pantry/bulk-add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(ingredientsToAdd)
        });
      }
      
      toast.success(`Added to ${selectedMealType} on ${new Date(selectedDate).toLocaleDateString()}`);
      onClose();
    } catch (error) {
      console.error("Error adding to meal plan:", error);
      toast.error(error.message);
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
        
        {loadingPlans ? (
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