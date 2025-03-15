"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Save, Calendar, Check, X, Loader, ChevronRight } from "lucide-react";
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { toast } from "react-hot-toast";

export default function RecipePage() {
  const params = useParams();
  const router = useRouter();
  const mealId = params?.id || ""; 
  const { user, isLoading: userLoading } = useUser();

  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPlannerOverlay, setShowPlannerOverlay] = useState(false);
  const [userPlans, setUserPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMealType, setSelectedMealType] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [addingToPlanner, setAddingToPlanner] = useState(false);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [displayDates, setDisplayDates] = useState([]);

  useEffect(() => {
    if (!mealId) return; 
    
    const fetchRecipe = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mealplan/${mealId}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Recipe not found: ${errorText}`);
        }
        
        const data = await response.json();
        setRecipe(data);
      } catch (error) {
        console.error("Error fetching recipe:", error);
        setError(`Failed to load recipe: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchRecipe();
  }, [mealId]);

  // Check if recipe is saved
  useEffect(() => {
    if (!user || !recipe) return;

    const checkIfSaved = async () => {
      try {
        const accessToken = await getAccessToken({
          authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
        });

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-recipes/is-saved/${mealId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        });

        if (response.ok) {
          const data = await response.json();
          setIsSaved(data.isSaved);
        }
      } catch (error) {
        console.error("Error checking saved status:", error);
      }
    };

    checkIfSaved();
  }, [user, recipe, mealId]);

  // Handle saving recipe
  const handleSaveRecipe = async () => {
    if (!user) {
      router.push('/auth/login?returnTo=' + encodeURIComponent(window.location.pathname));
      return;
    }

    try {
      setSaving(true);
      
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-recipes/saved-recipes/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          recipes: [recipe],
          plan_name: `Recipe - ${recipe.title}`
        })
      });

      if (!response.ok) {
        throw new Error("Failed to save recipe");
      }

      toast.success("Recipe saved successfully!");
      setIsSaved(true);
    } catch (error) {
      console.error("Error saving recipe:", error);
      toast.error("Failed to save recipe");
    } finally {
      setSaving(false);
    }
  };

  // Fetch user meal plans
  const fetchUserMealPlans = async () => {
    if (!user) return;
    
    try {
      setLoadingPlans(true);
      
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
      const userId = user.sub;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/api/user-plans/user/${userId}`, {
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
        
        // Extract all unique dates from all plans
        const allDates = new Set();
        plans.forEach(plan => {
          const meals = plan.meals || [];
          meals.forEach(meal => {
            if (meal.date) {
              allDates.add(meal.date);
            }
          });
        });
        
        // Convert to array, sort, and organize into weeks
        let sortedDates = Array.from(allDates).sort();
        
        // Ensure we have at least 7 days - add future dates if needed
        if (sortedDates.length < 7) {
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Reset time to start of day
          
          for (let i = 0; i < 7; i++) {
            const futureDate = new Date(today);
            futureDate.setDate(today.getDate() + i);
            
            // Format date manually to avoid timezone issues
            const dateStr = `${futureDate.getFullYear()}-${
              String(futureDate.getMonth() + 1).padStart(2, '0')
            }-${
              String(futureDate.getDate()).padStart(2, '0')
            }`;
            
            if (!allDates.has(dateStr)) {
              sortedDates.push(dateStr);
            }
          }
          sortedDates.sort();
        }
        
        // Organize dates into weeks
        const weeks = [];
        for (let i = 0; i < sortedDates.length; i += 7) {
          weeks.push(sortedDates.slice(i, i + 7));
        }
        
        setAvailableWeeks(weeks);
        
        // Set the display dates to the first week
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

  // When plan selection changes, update available dates
  const handlePlanChange = (planId) => {
    setSelectedPlan(planId);
    
    // Find the selected plan
    const plan = userPlans.find(p => p.id === planId);
    if (!plan) return;
    
    // Extract unique dates from this plan
    const dateSet = new Set();
    (plan.meals || []).forEach(meal => {
      if (meal.date) {
        dateSet.add(meal.date);
      }
    });
    
    // Convert to array and sort dates
    const sortedDates = Array.from(dateSet).sort();
    
    // Ensure we have at least 7 days - add future dates if needed
    if (sortedDates.length < 7) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day
      
      for (let i = 0; i < 7; i++) {
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + i);
        
        // Format date manually to avoid timezone issues
        const dateStr = `${futureDate.getFullYear()}-${
          String(futureDate.getMonth() + 1).padStart(2, '0')
        }-${
          String(futureDate.getDate()).padStart(2, '0')
        }`;
        
        if (!dateSet.has(dateStr)) {
          sortedDates.push(dateStr);
        }
      }
      sortedDates.sort();
    }
    
    // Organize into weeks
    const weeks = [];
    for (let i = 0; i < sortedDates.length; i += 7) {
      weeks.push(sortedDates.slice(i, i + 7));
    }
    
    setAvailableWeeks(weeks);
    setCurrentWeekIndex(0);
    
    // Set the display dates to the first week
    if (weeks.length > 0) {
      setDisplayDates(weeks[0]);
      setSelectedDate(weeks[0][0]);
    } else {
      setDisplayDates([]);
      setSelectedDate("");
    }
  };

  // Add functions to navigate between weeks
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

  // Format date for display
  const formatDateForDisplay = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  // Add recipe to meal plan
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
      
      // Ensure we're working with a Date object
      const dateToUse = typeof selectedDate === 'string' 
        ? new Date(selectedDate) 
        : selectedDate;
      
      // Adjust for local timezone and ensure we're using the exact date selected
      const formattedDate = `${dateToUse.getFullYear()}-${
        String(dateToUse.getMonth() + 1).padStart(2, '0')
      }-${
        String(dateToUse.getDate()).padStart(2, '0')
      }`;
      
      // Check if this is today's date
      const today = new Date();
      const todayFormatted = `${today.getFullYear()}-${
        String(today.getMonth() + 1).padStart(2, '0')
      }-${
        String(today.getDate()).padStart(2, '0')
      }`;
      const isCurrentDay = formattedDate === todayFormatted;
      
      // Get current meals for this plan to append the new meal
      const planToUpdate = userPlans.find(p => p.id === selectedPlan);
      if (!planToUpdate) {
        throw new Error("Selected plan not found");
      }
      
      // Get existing meal items - ENSURE PROPER STRUCTURE
      const existingMealItems = (planToUpdate.meals || []).map(meal => {
        // Keep the existing structure if it's already in the right format
        if (meal.mealId) {
          return {
            date: meal.date,
            mealType: meal.mealType,
            mealId: meal.mealId,
            current_day: meal.date === todayFormatted  // Set current_day based on date
          };
        } else if (meal.meal && meal.meal.recipe_id) {
          return {
            date: meal.date,
            mealType: meal.mealType,
            mealId: meal.meal.recipe_id,
            current_day: meal.date === todayFormatted  // Set current_day based on date
          };
        } else if (meal.meal && meal.meal.id) {
          return {
            date: meal.date,
            mealType: meal.mealType,
            mealId: meal.meal.id,
            current_day: meal.date === todayFormatted  // Set current_day based on date
          };
        }
        
        // Default fallback (should not happen)
        return {
          date: meal.date,
          mealType: meal.mealType,
          mealId: "",  // Empty string as fallback
          current_day: meal.date === todayFormatted  // Set current_day based on date
        };
      }).filter(item => item.mealId); // Filter out items with empty mealId
      
      // Check if we're replacing an existing meal for this date and type
      const updatedMealItems = existingMealItems.filter(
        item => !(item.date === formattedDate && item.mealType === selectedMealType)
      );
      
      // Add the new meal - USING THE CORRECT FORMAT
      updatedMealItems.push({
        date: formattedDate,
        mealType: selectedMealType,
        mealId: recipe.id || mealId,
        current_day: isCurrentDay  // Set current_day flag
      });
      
      // Update the plan
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-plans/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          planId: selectedPlan,
          meals: updatedMealItems,
          userId: user.sub,
          planName: planToUpdate.name
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("API error details:", errorData);
        throw new Error(`Failed to add to meal plan: ${response.status}`);
      }

      toast.success(`Added to ${selectedMealType} on ${new Date(formattedDate).toLocaleDateString()}`);
      setShowPlannerOverlay(false);
    } catch (error) {
      console.error("Error adding to meal plan:", error);
      toast.error("Failed to add to meal plan");
    } finally {
      setAddingToPlanner(false);
    }
  };

  // Toggle planner overlay
  const togglePlannerOverlay = async () => {
    if (!user) {
      router.push('/auth/login?returnTo=' + encodeURIComponent(window.location.pathname));
      return;
    }
    
    if (!showPlannerOverlay) {
      await fetchUserMealPlans();
      // Pre-select the meal type if available
      if (recipe.meal_type) {
        setSelectedMealType(recipe.meal_type.toLowerCase());
      }
    }
    
    setShowPlannerOverlay(!showPlannerOverlay);
  };

  const capitalizeFirstLetter = (string) => {
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  const renderPlannerOverlay = () => {
    if (!showPlannerOverlay) return null;
    
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full transform transition-all duration-300">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center">
              Add to Meal Plan
            </h3>
            <button 
              onClick={() => setShowPlannerOverlay(false)}
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
                onClick={() => router.push('/meal-planner')}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
              >
                Create a Meal Plan
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Select meal plan */}
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
              
              {/* Date navigation */}
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
                
                {/* Date buttons for the current week */}
                <div className="grid grid-cols-3 gap-2">
                {displayDates.map((date, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        console.log("Selected date:", date); // Add this for debugging
                        setSelectedDate(date);
                      }}
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
              
              {/* Select meal type */}
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

              {/* Add button */}
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
  };

  if (loading) return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <p className="text-xl">Loading recipe...</p>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <button 
          onClick={() => router.back()}
          className="mb-6 flex items-center text-teal-600 hover:text-teal-800"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to meal plan
        </button>
        <p className="text-red-500 text-lg font-medium">{error}</p>
        <p className="mt-4">
          This could be due to:
          <ul className="list-disc pl-6 mt-2">
            <li>The meal ID format may have changed</li>
            <li>The meal may have been deleted from the database</li>
            <li>There might be a connection issue with the server</li>
          </ul>
        </p>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto max-w-4xl">
      <div className="bg-white min-h-screen relative">
        {/* Header with back button */}
        <div className="p-4 flex justify-between items-center">
          <button 
            onClick={() => router.back()}
            className="rounded-full bg-gray-100 p-2 flex items-center justify-center shadow-md"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        </div>
        
        {/* Recipe Title */}
        <div className="px-6 pb-4">
          <h1 className="text-3xl font-bold text-gray-800">
            {recipe.title}
          </h1>
        </div>
        
        {/* Main Content - Image first, then macros below */}
        <div className="px-6 pb-6">
          {/* Recipe Image - Full width above macros */}
          <div className="mb-4">
            <div className="relative rounded-3xl overflow-hidden h-72">
              <img 
                src={recipe.imageUrl || "/fallback-meal-image.jpg"} 
                alt={recipe.title}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "/fallback-meal-image.jpg";
                }}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
              
          {/* Nutrition information with colored pills */}
          <div className="mb-6">
            {/* Calories with green pill */}
            <div className="flex items-center mb-6">
              <div className="w-1 h-14 rounded-full bg-green-400 mr-4"></div>
              <div>
                <div className="text-4xl font-bold">
                  {recipe.nutrition.calories}
                </div>
                <div className="text-gray-500">Calories</div>
              </div>
            </div>
            
            {/* Protein with blue pill */}
            <div className="flex items-center mb-6">
              <div className="w-1 h-14 rounded-full bg-blue-400 mr-4"></div>
              <div>
                <div className="text-4xl font-bold">
                  {recipe.nutrition.protein}<span className="text-base font-normal ml-1">gr</span>
                </div>
                <div className="text-gray-500">Protein</div>
              </div>
            </div>
            
            {/* Carbs with gray pill */}
            <div className="flex items-center mb-6">
              <div className="w-1 h-14 rounded-full bg-gray-300 mr-4"></div>
              <div>
                <div className="text-4xl font-bold">
                  {recipe.nutrition.carbs}<span className="text-base font-normal ml-1">gr</span>
                </div>
                <div className="text-gray-500">Carbs</div>
              </div>
            </div>
          </div>
          
          {/* Full-width Action Button */}
          {!userLoading && (
            <div className="mb-6">
              {isSaved ? (
                <button
                  onClick={togglePlannerOverlay}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-500 text-white py-3 font-medium shadow-md hover:bg-teal-600 transition-colors mb-4" // Added mb-2 for margin-bottom
                >
                  Add to {recipe.meal_type ? capitalizeFirstLetter(recipe.meal_type) : "Meal Plan"}
                </button>
              ) : (
                <button
                  onClick={handleSaveRecipe}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-500 text-white py-3 font-medium shadow-md hover:bg-teal-600 transition-colors mb-2" // Added mb-2 for margin-bottom
                >
                  {saving ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Save Recipe
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>       
        
        {/* Ingredients Section - White background with gray cards */}
        <div className="px-6 pb-10">
          {/* Header with icons */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Ingredients</h2>
              <p className="text-gray-600">{recipe.ingredients.length} healthy ingredients</p>
            </div>
            <div className="flex gap-3">
              <button className="bg-gray-100 rounded-full p-3 w-12 h-12 flex items-center justify-center shadow-sm">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </button>
              <button className="bg-gray-100 rounded-full p-3 w-12 h-12 flex items-center justify-center shadow-sm">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Individual ingredient items on white background */}
          <div className="space-y-4">
            {recipe.ingredients.map((ingredient, idx) => (
              <div key={idx} className="bg-gray-100 rounded-full py-4 px-5 flex items-center shadow-sm">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mr-5 shrink-0">
                  {getIngredientIcon(ingredient.name)}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">
                    {ingredient.name} <span className="text-teal-600 font-normal">({ingredient.quantity})</span>
                  </h3>
                  <p className="text-gray-500">
                    {getIngredientDescription(ingredient.name)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Instructions Section - Modern Step Format with titles filtered out */}
        <div className="px-6 pb-20">
          <h2 className="text-3xl font-bold mb-6">Instructions</h2>
          
          <div className="space-y-8">
            {parseInstructions(recipe.instructions).map((step, idx) => (
              <div key={idx} className="flex">
                <div className="mr-6">
                  <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 font-bold text-2xl shrink-0">
                    {idx + 1}
                  </div>
                </div>
                <div className="pt-3">
                  <p className="text-gray-800 text-lg">{step}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      {/* Add to Planner Overlay */}
      {renderPlannerOverlay()}
      </div>
    </div>
  );
}


// Helper function for ingredient icons - Based on ingredient type
function getIngredientIcon(name) {
  const nameLower = name.toLowerCase();
  
  // Default icon for generic ingredients
  const defaultIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
      <circle cx="12" cy="5" r="1" />
      <path d="M16 16.5a4 4 0 0 1-8 0" />
      <path d="M12 12a4 4 0 0 1 0-8" />
      <path d="M12 4v8" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
  
  // Match common ingredient types to appropriate emojis
  if (nameLower.includes('spinach') || nameLower.includes('kale') || nameLower.includes('lettuce') || 
      nameLower.includes('greens') || nameLower.includes('arugula')) {
    return <span className="text-2xl">🥬</span>;
  }
  if (nameLower.includes('shrimp') || nameLower.includes('prawn') || nameLower.includes('fish') || 
      nameLower.includes('salmon') || nameLower.includes('tuna')) {
    return <span className="text-2xl">🍤</span>;
  }
  if (nameLower.includes('strawberry') || nameLower.includes('berry') || nameLower.includes('fruit')) {
    return <span className="text-2xl">🍓</span>;
  }
  if (nameLower.includes('corn')) {
    return <span className="text-2xl">🌽</span>;
  }
  if (nameLower.includes('onion')) {
    return <span className="text-2xl">🧅</span>;
  }
  if (nameLower.includes('ginger')) {
    return <span className="text-2xl">🫚</span>;
  }
  if (nameLower.includes('chili') || nameLower.includes('pepper') || nameLower.includes('spicy')) {
    return <span className="text-2xl">🌶️</span>;
  }
  if (nameLower.includes('coconut')) {
    return <span className="text-2xl">🥥</span>;
  }
  if (nameLower.includes('water')) {
    return <span className="text-2xl">💧</span>;
  }
  if (nameLower.includes('chicken') || nameLower.includes('meat') || nameLower.includes('beef') || 
      nameLower.includes('pork') || nameLower.includes('turkey')) {
    return <span className="text-2xl">🍗</span>;
  }
  if (nameLower.includes('carrot')) {
    return <span className="text-2xl">🥕</span>;
  }
  if (nameLower.includes('tomato')) {
    return <span className="text-2xl">🍅</span>;
  }
  if (nameLower.includes('egg')) {
    return <span className="text-2xl">🥚</span>;
  }
  if (nameLower.includes('oil') || nameLower.includes('olive')) {
    return <span className="text-2xl">🫒</span>;
  }
  
  return defaultIcon;
}

// Helper function to get ingredient descriptions based on name
function getIngredientDescription(name) {
  const nameLower = name.toLowerCase();
  
  // Match common ingredients to appropriate descriptions
  if (nameLower.includes('spinach') || nameLower.includes('kale') || nameLower.includes('lettuce')) {
    return "Leafy green vegetable rich in vitamins and minerals";
  }
  if (nameLower.includes('shrimp') || nameLower.includes('prawn')) {
    return "Shellfish high in protein and omega-3 fatty acids";
  }
  if (nameLower.includes('salmon') || nameLower.includes('tuna') || nameLower.includes('fish')) {
    return "Fatty fish loaded with omega-3s and high-quality protein";
  }
  if (nameLower.includes('berry') || nameLower.includes('strawberry')) {
    return "Antioxidant-rich fruit with natural sweetness";
  }
  if (nameLower.includes('fruit')) {
    return "Natural source of vitamins, fiber and antioxidants";
  }
  if (nameLower.includes('corn')) {
    return "Starchy vegetable with fiber and essential nutrients";
  }
  if (nameLower.includes('onion')) {
    return "Aromatic vegetable that adds flavor depth";
  }
  if (nameLower.includes('ginger')) {
    return "Spicy root with anti-inflammatory properties";
  }
  if (nameLower.includes('chili') || nameLower.includes('pepper') || nameLower.includes('spicy')) {
    return "Adds heat and contains capsaicin with health benefits";
  }
  if (nameLower.includes('coconut')) {
    return "Tropical fruit with healthy fats and flavor";
  }
  if (nameLower.includes('water')) {
    return "Essential for hydration and cooking";
  }
  if (nameLower.includes('chicken')) {
    return "Lean protein source, low in fat";
  }
  if (nameLower.includes('beef')) {
    return "Rich in protein, iron, and vitamin B12";
  }
  if (nameLower.includes('pork')) {
    return "Good source of complete protein and minerals";
  }
  if (nameLower.includes('turkey')) {
    return "Lean meat high in protein and low in fat";
  }
  if (nameLower.includes('carrot')) {
    return "Root vegetable rich in beta-carotene and fiber";
  }
  if (nameLower.includes('tomato')) {
    return "Rich in lycopene and vitamin C";
  }
  if (nameLower.includes('egg')) {
    return "Complete protein with essential nutrients";
  }
  if (nameLower.includes('oil') || nameLower.includes('olive')) {
    return "Healthy fat source with anti-inflammatory properties";
  }
  if (nameLower.includes('rice')) {
    return "Versatile grain that provides energy and fiber";
  }
  if (nameLower.includes('pasta')) {
    return "Carbohydrate-rich food that provides energy";
  }
  if (nameLower.includes('quinoa')) {
    return "Complete protein grain with all essential amino acids";
  }
  if (nameLower.includes('avocado')) {
    return "Nutrient-dense fruit packed with healthy fats";
  }
  if (nameLower.includes('cheese')) {
    return "Dairy product rich in calcium and protein";
  }
  if (nameLower.includes('yogurt')) {
    return "Probiotic-rich dairy with calcium and protein";
  }
  if (nameLower.includes('nut') || nameLower.includes('almond') || nameLower.includes('walnut')) {
    return "Plant protein with healthy fats and fiber";
  }
  if (nameLower.includes('seed') || nameLower.includes('chia') || nameLower.includes('flax')) {
    return "Small but nutrient-dense with omega-3 fatty acids";
  }
  if (nameLower.includes('garlic')) {
    return "Flavorful bulb with immune-boosting compounds";
  }
  if (nameLower.includes('herb') || nameLower.includes('basil') || nameLower.includes('cilantro') || nameLower.includes('parsley')) {
    return "Aromatic plant that adds flavor without calories";
  }
  if (nameLower.includes('spice') || nameLower.includes('cumin') || nameLower.includes('cinnamon') || nameLower.includes('turmeric')) {
    return "Flavor enhancer with potential health benefits";
  }
  if (nameLower.includes('lentil') || nameLower.includes('bean')) {
    return "Plant-based protein source high in fiber";
  }
  if (nameLower.includes('potato')) {
    return "Starchy vegetable with potassium and vitamin C";
  }
  if (nameLower.includes('milk')) {
    return "Dairy product rich in calcium and vitamin D";
  }
  if (nameLower.includes('broccoli')) {
    return "Cruciferous vegetable packed with vitamins and fiber";
  }
  if (nameLower.includes('mushroom')) {
    return "Low-calorie source of selenium and vitamin D";
  }
  if (nameLower.includes('butter')) {
    return "Dairy fat that adds richness and flavor";
  }
  if (nameLower.includes('honey')) {
    return "Natural sweetener with antimicrobial properties";
  }
  if (nameLower.includes('tofu') || nameLower.includes('soy')) {
    return "Plant-based protein source with all essential amino acids";
  }
  
  // Default description for unmatched ingredients
  return "Nutritious ingredient for a balanced diet";
}

// Function to parse and break down instructions into clear steps
function parseInstructions(instructions) {
  if (!instructions) return [];
  
  // For structured instructions with step markers
  if (instructions.includes('###') || instructions.includes('**') || 
      instructions.includes('Step') || instructions.includes('\\n')) {
    
    // Handle markdown and other common formatting
    let cleanInstructions = instructions
      // Replace markdown headings with a standard delimiter
      .replace(/#{1,3}\s*(.*?)(?=\n|$)/g, '###$1###')
      // Replace bold markdown
      .replace(/\*\*(.*?)\*\*/g, '###$1###')
      // Replace step indicators
      .replace(/Step\s+\d+\s*:\s*/gi, '###');
    
    // Split the text and clean up each part
    const parts = cleanInstructions.split(/###|\n/)
      .map(part => part.trim())
      .filter(part => part.length > 0);
    
    // Use heuristics to identify detailed instructions vs. section headers
    return parts.filter(part => {
      // Detailed instructions are typically longer and more complex
      // Section headers are usually short, title-cased phrases
      const isLikelyHeader = part.length < 25 && 
                             /^[A-Z][a-z]/.test(part) && 
                             !part.includes(',') && 
                             part.split(' ').length <= 4;
      
      return !isLikelyHeader;
    });
  }
  
  // Default handling for simple text
  return instructions.split('\\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}