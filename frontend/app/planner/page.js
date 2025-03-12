"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { 
  ChevronLeft, 
  ChevronRight, 
  Coffee, 
  Utensils, 
  Apple, 
  Moon, 
  X, 
  Check, 
  PlusCircle, 
  Calendar,
  Save,
  Loader 
} from 'lucide-react';
import Header from '../../components/header';
import Footer from '../../components/footer';
import { toast } from 'react-hot-toast'; // Import toast for notifications


export default function MealPlannerCalendar() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const isAuthenticated = !!user;
  const sliderRef = useRef(null);
  
  // Current date and calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState([]);
  
  // Meal planning state
  const [selectedMeal, setSelectedMeal] = useState(null); // {date, mealType}
  const [sliderOpen, setSliderOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState(null); // Track specifically which meal is active
  const [savedMeals, setSavedMeals] = useState({
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: []
  });
  const [mealPlan, setMealPlan] = useState({}); // {YYYY-MM-DD: {breakfast: {}, lunch: {}, dinner: {}, snack: {}}}
  const [isLoadingSavedMeals, setIsLoadingSavedMeals] = useState(false);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userPlans, setUserPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [planName, setPlanName] = useState("");

  // Get the start of the week containing the selected date
  const getWeekDays = (date) => {
    const currentDate = new Date(date);
    const days = [];
    
    // Start with the current day
    days.push(new Date(currentDate));
    
    // Add 6 more days after the current day
    for (let i = 1; i < 7; i++) {
      const nextDay = new Date(currentDate);
      nextDay.setDate(currentDate.getDate() + i);
      days.push(nextDay);
    }
    
    return days;
  };

  // Generate calendar days based on current week
  useEffect(() => {
    // Generate a week of days starting from the selected date
    const days = getWeekDays(selectedDate);
    setCalendarDays(days);
  }, [selectedDate]); // Update when selectedDate changes

  // Fetch saved meals when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      fetchSavedMeals();
      fetchUserMealPlans();
    }
  }, [isAuthenticated, isLoading]);

  // Close slider when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sliderRef.current && !sliderRef.current.contains(event.target) && !event.target.closest('.meal-pill')) {
        setSliderOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format date as YYYY-MM-DD for consistency
  const formatDateKey = (date) => {
    return date.toISOString().split('T')[0];
  };

  // Navigate to previous week
  const goToPreviousWeek = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 7);
    setSelectedDate(newDate);
  };

  // Navigate to next week
  const goToNextWeek = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 7);
    setSelectedDate(newDate);
  };

  // Go to today
  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
  };

  // Format week range for display
  const formatWeekRange = () => {
    if (calendarDays.length === 0) return '';
    
    const weekStart = calendarDays[0];
    const weekEnd = calendarDays[calendarDays.length - 1];
    
    return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  // Check if a date is today
  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  // Check if a date is in the current month
  const isCurrentMonth = (date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  // Check if a date is selected
  const isSelected = (date) => {
    return date.getDate() === selectedDate.getDate() &&
           date.getMonth() === selectedDate.getMonth() &&
           date.getFullYear() === selectedDate.getFullYear();
  };

  // Format day name
  const formatDayName = (date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  // Handle day selection
  const selectDay = (date) => {
    setSelectedDate(date);
  };

  // Fetch user's saved meal plans from the API
  const fetchUserMealPlans = async () => {
    if (!user) return;

    try {
      setIsLoadingPlans(true);
      
      // Get access token using Auth0
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
      // Get user_id from token claims
      const userId = user.sub;
      
      // API request
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
      setUserPlans(plans);
      
      // Load the most recent plan if available
      if (plans.length > 0) {
        const sortedPlans = [...plans].sort((a, b) => 
          new Date(b.updated_at) - new Date(a.updated_at)
        );
        const mostRecentPlan = sortedPlans[0];
        loadPlanToCalendar(mostRecentPlan);
      }
      
    } catch (error) {
      console.error('Error fetching user meal plans:', error);
      toast.error('Failed to load your meal plans');
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const deleteMealFromServer = async (date, mealType) => {
    if (!activePlanId || !user) return;
    
    try {
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/api/user-plans/meal`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          planId: activePlanId,
          date: formatDateKey(date),
          mealType: mealType
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete meal: ${response.status}`);
      }
      
      toast.success("Meal removed from plan");
    } catch (error) {
      console.error('Error deleting meal:', error);
      toast.error("Failed to remove meal. Changes will be applied when you save the plan.");
    }
  };

  // Load a plan to the calendar
  const loadPlanToCalendar = (plan) => {
    if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
      return;
    }
    
    // Fix any malformed meal data
    plan.meals.forEach(mealItem => {
      if (mealItem.meal && typeof mealItem.meal === 'object') {
        // Fix name field if missing
        if (!mealItem.meal.name && mealItem.meal.title) {
          mealItem.meal.name = mealItem.meal.title;
        }
        
        // Fix calories field if it's missing or just "cal"
        if (!mealItem.meal.calories && mealItem.meal.nutrition?.calories) {
          mealItem.meal.calories = mealItem.meal.nutrition.calories;
        }
        
        // Convert calories to number if it's a string
        if (typeof mealItem.meal.calories === 'string') {
          const caloriesNum = parseInt(mealItem.meal.calories);
          if (!isNaN(caloriesNum)) {
            mealItem.meal.calories = caloriesNum;
          }
        }
      }
    });
    
    setActivePlanId(plan.id);
    setPlanName(plan.name);
    
    // Convert plan format to mealPlan state format
    const newMealPlan = {};
    
    plan.meals.forEach(mealItem => {
      const dateKey = mealItem.date;
      const mealType = mealItem.mealType;
      const meal = mealItem.meal;
      
      if (!newMealPlan[dateKey]) {
        newMealPlan[dateKey] = {};
      }
      
      newMealPlan[dateKey][mealType] = meal;
    });
    
    setMealPlan(newMealPlan);
    toast.success(`Loaded meal plan: ${plan.name}`);
  };

  // Fetch saved meals from API
  const fetchSavedMeals = async () => {
    if (!user) return;

    try {
      setIsLoadingSavedMeals(true);
      
      // Get access token using Auth0
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
      // API request
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/api/user-recipes/saved-recipes/`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Process meals by category
      const categorizedMeals = { breakfast: [], lunch: [], dinner: [], snack: [] };
      
      // Group recipes by meal type
      data.forEach(plan => {
        if (plan.recipes && Array.isArray(plan.recipes)) {
          plan.recipes.forEach(recipe => {
            const mealType = (recipe.meal_type || '').toLowerCase();
            const category = ['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType) 
              ? mealType : 'snack';
            
            const formattedMeal = {
              id: recipe.id,
              name: recipe.title,
              calories: recipe.nutrition?.calories || 0,
              protein: recipe.nutrition?.protein || 0,
              carbs: recipe.nutrition?.carbs || 0,
              fat: recipe.nutrition?.fat || 0,
              image: recipe.imageUrl || recipe.image_url || "",
              ingredients: recipe.ingredients || [],
              instructions: recipe.instructions || ''
            };
            
            // Add if not duplicate
            if (!categorizedMeals[category].some(meal => meal.name === formattedMeal.name)) {
              categorizedMeals[category].push(formattedMeal);
            }
          });
        }
      });
      
      setSavedMeals(categorizedMeals);
      
    } catch (error) {
      console.error('Error fetching saved meals:', error);
      toast.error('Failed to load your saved meals');
    } finally {
      setIsLoadingSavedMeals(false);
    }
  };

  // Open meal selector
  const openMealSelector = (date, mealType) => {
    setSelectedMeal({ date, mealType });
    setActiveMeal({ date: formatDateKey(date), type: mealType });
    setSliderOpen(true);
  };

  // Get Icon component based on meal type
  const getMealIcon = (mealType) => {
    switch (mealType) {
      case 'breakfast':
        return <Coffee className="w-4 h-4" />;
      case 'lunch':
        return <Utensils className="w-4 h-4" />;
      case 'dinner':
        return <Moon className="w-4 h-4" />;
      case 'snack':
        return <Apple className="w-4 h-4" />;
      default:
        return null;
    }
  };

  // Select a meal for a specific date and type
  const selectMealForDay = (meal) => {
    if (!selectedMeal) return;
    
    const { date, mealType } = selectedMeal;
    const dateKey = formatDateKey(date);
    
    setMealPlan(prev => ({
      ...prev,
      [dateKey]: {
        ...(prev[dateKey] || {}),
        [mealType]: meal
      }
    }));
    
    // Keep the active meal state for highlighting purposes
    setTimeout(() => setActiveMeal(null), 1000); // Clear active meal after a delay
    setSliderOpen(false);
  };

  // Clear a meal from the plan
  const clearMeal = (date, mealType) => {
    const dateKey = formatDateKey(date);
    
    if (!mealPlan[dateKey] || !mealPlan[dateKey][mealType]) return;
    
    setActiveMeal({ date: dateKey, type: mealType });
    
    setMealPlan(prev => {
      const updatedDate = { ...prev[dateKey] };
      delete updatedDate[mealType];
      
      if (Object.keys(updatedDate).length === 0) {
        const newPlan = { ...prev };
        delete newPlan[dateKey];
        return newPlan;
      }
      
      return {
        ...prev,
        [dateKey]: updatedDate
      };
    });
    
    // Try to delete from server directly
    if (activePlanId) {
      deleteMealFromServer(date, mealType);
    }
    
    setTimeout(() => setActiveMeal(null), 500);
  };

  // Get meal for a specific date and type
  const getMealForDay = (date, mealType) => {
    const dateKey = formatDateKey(date);
    return mealPlan[dateKey]?.[mealType] || null;
  };

  // Convert the mealPlan state to API format
  const formatMealsForAPI = () => {
    const meals = [];
    
    Object.keys(mealPlan).forEach(dateKey => {
      const dateMeals = mealPlan[dateKey];
      
      Object.keys(dateMeals).forEach(mealType => {
        const meal = dateMeals[mealType];
        meals.push({
          date: dateKey,
          mealType: mealType,
          mealId: meal.id
        });
      });
    });
    
    return meals;
  };

  // Save the entire meal plan
// MealPlannerCalendar.js - Here's the complete saveMealPlan function with the fix:

const saveMealPlan = async () => {
  if (!user) {
    toast.error("Please log in to save your meal plan");
    return;
  }
  
  try {
    setIsSaving(true);
    
    // Get access token using Auth0
    const accessToken = await getAccessToken({
      authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
    });
    
    // Format meals for API
    const formattedMeals = formatMealsForAPI();
    
    if (formattedMeals.length === 0) {
      toast.error("Cannot save an empty meal plan");
      setIsSaving(false);
      return;
    }
    
    // Prepare request data
    const requestData = {
      userId: user.sub,
      planName: planName || `Meal Plan - ${new Date().toLocaleDateString()}`,
      meals: formattedMeals
    };
    
    // API endpoint based on whether we're creating or updating
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    const endpoint = activePlanId 
      ? `${apiUrl}/api/user-plans/update`
      : `${apiUrl}/api/user-plans/save`;
    
    // Add planId if updating
    if (activePlanId) {
      requestData.planId = activePlanId;
    }
    
    // API request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save: ${response.status}`);
    }
    
    const result = await response.json();
    
    // If it was a new plan, update the activePlanId
    if (!activePlanId && result.id) {
      setActivePlanId(result.id);
      setPlanName(result.name);
    }
    
    // THE FIX: Store timestamp in localStorage to trigger profile page refresh
    localStorage.setItem('mealPlanLastSaved', new Date().toISOString());
    
    // Refresh the user's plans
    fetchUserMealPlans();
    
    toast.success("Meal plan saved successfully!");
  } catch (error) {
    console.error('Error saving meal plan:', error);
    toast.error("Failed to save meal plan. Please try again.");
  } finally {
    setIsSaving(false);
  }
};

  // Create a new meal plan
  const createNewPlan = () => {
    setMealPlan({});
    setActivePlanId(null);
    setPlanName("");
    toast.success("Started a new meal plan");
  };

  // Generate meal pills for a day
  const renderMealPills = (date) => {
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    const dateKey = formatDateKey(date);
    
    return (
      <div className="space-y-2 mt-2">
        {mealTypes.map(type => {
          const meal = getMealForDay(date, type);
          
          // Check if this specific meal is active/selected
          const isActive = activeMeal && 
                           activeMeal.date === dateKey && 
                           activeMeal.type === type;
          
          return (
            <div 
              key={type}
              className={`meal-pill flex items-center justify-between p-2 rounded-full shadow-sm cursor-pointer transition-all ${
                isActive 
                  ? 'transform scale-[1.02] shadow-md' 
                  : 'hover:shadow'
              }`}
              style={{ 
                backgroundColor: isActive 
                  ? '#D1FAE5' // Bright teal background when active
                  : meal 
                    ? '#EDF9F6' 
                    : '#F3F4F6',
                borderLeft: isActive 
                  ? '4px solid #0D9488' // Darker teal when active
                  : meal 
                    ? '4px solid #14B8A6' 
                    : '4px solid transparent',
                transition: 'all 0.2s ease-in-out'
              }}
              onClick={() => openMealSelector(date, type)}
              >
                <div className="flex items-center">
                  <div className={`p-1.5 rounded-full mr-2 ${
                    isActive 
                      ? 'bg-teal-600 text-white' 
                      : meal 
                        ? 'bg-teal-500 text-white' 
                        : 'bg-gray-200 text-gray-600'
                  }`}>
                    {getMealIcon(type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${
                      isActive 
                        ? 'font-semibold text-teal-900' 
                        : meal 
                          ? 'font-medium text-teal-800' 
                          : 'text-gray-500'
                    }`}>
                      {meal ? meal.name : `Add ${type}`}
                    </p>
                    {meal && (
                    <p className="text-xs text-gray-500 truncate">
                        {typeof meal.calories === 'number' ? `${meal.calories} cal` : 
                        meal.nutrition?.calories ? `${meal.nutrition.calories} cal` : 
                        "cal"}
                    </p>
                    )}
                  </div>
                </div>
                {meal && (
                  <button 
                    className={`p-1 rounded-full ${
                      isActive 
                        ? 'text-red-500 hover:text-red-600 hover:bg-red-50' 
                        : 'text-gray-400 hover:text-red-500'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      clearMeal(date, type);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      );
    };
  
    return (
      <>
        <Header />
        
        {/* Full-screen white background */}
        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
        
        {/* Main Content Container */}
        <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg w-full max-w-5xl flex-grow flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
                <Calendar className="mr-2 w-6 h-6 text-teal-600" />
                Meal Planner Calendar
              </h2>
              
              <div className="flex items-center gap-3">
                {isLoadingPlans && (
                  <div className="flex items-center text-gray-500">
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Loading plans...
                  </div>
                )}
                
                {userPlans.length > 0 && (
                  <div className="relative">
                    <select 
                      className="pl-3 pr-8 py-2 border rounded-lg text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={activePlanId || ""}
                      onChange={(e) => {
                        const planId = e.target.value;
                        if (planId === "new") {
                          createNewPlan();
                        } else {
                          const plan = userPlans.find(p => p.id === planId);
                          if (plan) loadPlanToCalendar(plan);
                        }
                      }}
                    >
                      <option value="">Select Plan</option>
                      {userPlans.map(plan => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                      <option value="new">➕ New Plan</option>
                    </select>
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronLeft className="h-4 w-4 text-gray-500 rotate-90" />
                    </div>
                  </div>
                )}
                
                <input
                  type="text"
                  placeholder="Plan Name"
                  className="pl-3 pr-2 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                />
              </div>
            </div>
            
            {/* Current Day Display */}
            <div className="mb-4 text-center">
              <h2 className="text-2xl font-bold text-teal-700">
                {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
              </h2>
              <p className="text-lg text-gray-600">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6 border-b pb-4">
              <h3 className="text-xl font-semibold text-gray-700">
                {formatWeekRange()}
              </h3>
              <div className="flex space-x-2">
                <button 
                  onClick={goToToday}
                  className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Today
                </button>
                <button 
                  onClick={goToPreviousWeek}
                  className="p-1.5 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button 
                  onClick={goToNextWeek}
                  className="p-1.5 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Main Calendar Content */}
            <div className="flex-grow overflow-y-auto pr-1 -mr-1">
              <div className="space-y-4">
                {calendarDays.map((day, index) => (
                  <div 
                    key={index}
                    className={`flex items-start gap-4 p-4 rounded-lg transition-colors hover:bg-gray-50 ${
                      isSelected(day) ? 'bg-gray-50 border-l-4 border-teal-500' : 'border-l-4 border-transparent'
                    }`}
                    onClick={() => selectDay(day)}
                  >
                    {/* Day column */}
                    <div className="w-20 text-center flex flex-col items-center">
                      <div className="text-sm text-gray-500 font-medium">
                        {formatDayName(day)}
                      </div>
                      <div 
                        className={`w-10 h-10 flex items-center justify-center rounded-full text-lg font-semibold mt-1 ${
                          isToday(day) ? 'bg-teal-500 text-white' : 
                          isCurrentMonth(day) ? 'text-gray-700' : 'text-gray-400'
                        }`}
                      >
                        {day.getDate()}
                      </div>
                    </div>
                    
                    {/* Meals column */}
                    <div className="flex-grow">
                      {renderMealPills(day)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Save Button */}
            <div className="mt-6 text-center">
              <button
                onClick={saveMealPlan}
                disabled={isSaving}
                className="px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg hover:bg-teal-600 transition-colors shadow flex items-center justify-center mx-auto"
              >
                {isSaving ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {activePlanId ? 'Update Meal Plan' : 'Save Meal Plan'}
                  </>
                )}
              </button>
              
              {activePlanId && (
                <button
                  onClick={createNewPlan}
                  disabled={isSaving}
                  className="mt-2 px-4 py-2 text-teal-600 font-medium hover:text-teal-800 transition-colors"
                >
                  Create New Plan
                </button>
              )}
            </div>
          </div>
          
          {/* Meal Selection Slider */}
          <div 
            ref={sliderRef}
            className={`fixed top-0 right-0 h-full w-[350px] bg-white shadow-xl transform transition-transform duration-300 ease-in-out z-50 ${
              sliderOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{ 
              borderLeft: '4px solid #14B8A6' // Teal border to match the active meal style
            }}
          >
            <div className="h-full flex flex-col">
              {/* Slider Header */}
              <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800 capitalize">
                  {selectedMeal?.mealType || 'Select Meal'}
                  {selectedMeal && (
                    <span className="block text-sm font-normal text-gray-500">
                      {selectedMeal.date.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  )}
                </h3>
                <button 
                  onClick={() => setSliderOpen(false)} 
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Meal List */}
              <div className="flex-grow overflow-y-auto p-4">
                {isLoadingSavedMeals ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500">Loading saved meals...</p>
                  </div>
                ) : selectedMeal && savedMeals[selectedMeal.mealType]?.length > 0 ? (
                  <div className="space-y-3">
                    {savedMeals[selectedMeal.mealType].map((meal, index) => (
                      <div 
                        key={index}
                        className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-teal-50 transition-all transform hover:scale-[1.02] hover:border-teal-200"
                        onClick={() => selectMealForDay(meal)}
                      >
                        <img 
                          src={meal.image || '/fallback-meal-image.jpg'} 
                          alt={meal.name}
                          className="w-16 h-16 object-cover rounded-md"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "/fallback-meal-image.jpg";
                          }}
                        />
                        <div className="ml-3 flex-grow">
                          <h4 className="font-medium text-gray-800">{meal.name}</h4>
                          <div className="flex gap-2 text-xs text-gray-500 mt-1">
                            <span>{meal.calories} cal</span>
                            <span>•</span>
                            <span>{meal.protein}g protein</span>
                          </div>
                        </div>
                        <div className="pl-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center border border-teal-200 text-teal-500 hover:bg-teal-100 transition-colors hover:text-teal-700 hover:border-teal-300">
                            <Check className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <p className="text-gray-500 mb-4">No saved meals found.</p>
                    <button
                      onClick={() => router.push('/meals')}
                      className="flex items-center px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                    >
                      <PlusCircle className="w-4 h-4 mr-2" />
                      Create New Meals
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
        
        <Footer />
      </>
    );
  }