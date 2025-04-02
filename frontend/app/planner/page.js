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
import { toast } from 'react-hot-toast'; // Import toast for notifications
import AutoUpdatingComponent from '../../components/features/profile/mealplan/autoupdating';
import DuplicateMeals from '../../components/features/planner/duplicatemeals';


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
  const [isAutoSaving, setIsAutoSaving] = useState(false); // Added for autosave
  const [userPlans, setUserPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [planName, setPlanName] = useState("");
  const [savingMeals, setSavingMeals] = useState({}); // Format: { dateKey-mealType: true/false }

  // Add these new state variables near your other state declarations
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [sourceDateForDuplicate, setSourceDateForDuplicate] = useState(null);
  const [targetDateForDuplicate, setTargetDateForDuplicate] = useState(null);

  const autoSaveTimeoutRef = useRef(null);
  const lastLoadedRef = useRef(null);
  
  // Initialize the AutoUpdatingComponent
  const autoUpdater = AutoUpdatingComponent({
    user,
    activePlanId,
    setActivePlanId,
    mealPlan,
    setMealPlan,
    savingMeals,
    setSavingMeals,
    planName,
    setPlanName,
    onAfterSave: null
  });
  
  // Use the updateMealPlan function from autoUpdater
  const updateMealPlan = autoUpdater.updateMealPlan;
  const formatDateKey = autoUpdater.formatDateKey;
  
  // Initialize the DuplicateMeals component
  const mealDuplicator = DuplicateMeals({
    mealPlan,
    updateMealPlan,
    formatDateKey
  });
  
  const saveMealPlan = () => {
    // Call updateMealPlan with the current mealPlan
    updateMealPlan(mealPlan, 'update', []);
  };

  // Note: updateMealPlan is now defined using autoUpdater above

  // Use DuplicateMeals component for duplicating meals
  const duplicateDayMeals = () => {
    if (!sourceDateForDuplicate || !targetDateForDuplicate) return;
    
    // Use the duplicateDayMeals function from the mealDuplicator
    const success = mealDuplicator.duplicateDayMeals(sourceDateForDuplicate, targetDateForDuplicate);
    
    // Close the dialog if successful (errors are handled inside the component)
    if (success) {
      setShowDuplicateDialog(false);
    }
  };

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
      // Fetch data immediately when component mounts
      fetchSavedMeals();
      fetchUserMealPlans();
      
      // Set up a handler for when the page becomes visible again
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('Page became visible, refreshing meal plans...');
          fetchUserMealPlans();
        }
      };
      
      // Listen for visibility changes (handles tab switching)
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Clean up event listener on unmount
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
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

  // formatDateKey is now defined using autoUpdater above

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

  // Use removeMealFromView from autoUpdater
  const removeMealFromView = (date, mealType) => {
    autoUpdater.removeMealFromView(date, mealType);
  };

  const loadPlanToCalendar = (plan) => {
    if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
      console.error("Invalid plan structure:", plan);
      return;
    }
    
    setActivePlanId(plan.id);
    setPlanName(plan.name || "Unnamed Plan");
    
    // Convert plan format to mealPlan state format
    const newMealPlan = {};
    
    // Process each meal in the plan
    plan.meals.forEach(mealItem => {
      // Ensure we have the date and meal type
      if (!mealItem.date || !mealItem.mealType) {
        console.error("Skipping invalid meal item:", mealItem);
        return;
      }
      
      const dateKey = mealItem.date;
      const mealType = mealItem.mealType;
      
      // Initialize the date entry if it doesn't exist
      if (!newMealPlan[dateKey]) {
        newMealPlan[dateKey] = {};
      }
      
      // Process the meal data - handle both direct and nested formats
      let mealData;
      
      if (mealItem.meal && typeof mealItem.meal === 'object') {
        // Get the meal name directly from the API response - use the most reliable property
        // In order of priority: meal.title (most reliable) -> meal.name -> meal_name
        const mealName = mealItem.meal.title || mealItem.meal.name || mealItem.meal_name;
        
        // Log for verification
        console.log(`Setting meal name for ${mealItem.mealType}:`, { 
          mealSource: 'API response',
          mealName: mealName
        });
        
        // Backend returns meal in a nested 'meal' property
        mealData = {
          id: mealItem.meal.id || mealItem.mealId,
          name: mealName, // Use our proper name with fallbacks
          title: mealName, // Keep title consistent
          calories: mealItem.meal.calories || 
                  (mealItem.meal.nutrition && mealItem.meal.nutrition.calories) || 0,
          protein: (mealItem.meal.nutrition && mealItem.meal.nutrition.protein) || 0,
          carbs: (mealItem.meal.nutrition && mealItem.meal.nutrition.carbs) || 0,
          fat: (mealItem.meal.nutrition && mealItem.meal.nutrition.fat) || 0,
          image: mealItem.meal.imageUrl || mealItem.meal.image_url || "",
          ingredients: mealItem.meal.ingredients || [],
          instructions: mealItem.meal.instructions || ""
        };
      } else if (mealItem.mealId) {
        // For cases where we only have an ID (should be rare)
        const mealName = mealItem.meal_name || 
                      mealItem.mealType.charAt(0).toUpperCase() + mealItem.mealType.slice(1) + " Meal";
        
        mealData = {
          id: mealItem.mealId,
          name: mealName, // Use better fallback name
          title: mealName, // Keep title consistent
          calories: 0,
          image: ""
        };
        
        // You might want to fetch the full meal details here
        // This could be an async operation, in which case you'd want to
        // update the mealPlan state after the fetch completes
      } else {
        console.error("Unable to process meal item:", mealItem);
        return;
      }
      
      // Store the processed meal in our mealPlan state
      newMealPlan[dateKey][mealType] = mealData;
    });
    
    // Update the state with the fully processed meal plan
    console.log("Setting meal plan state:", newMealPlan);
    setMealPlan(newMealPlan);
    
    // Show success message
    toast.success(`Loaded meal plan: ${plan.name || "Unnamed Plan"}`);
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

  // Get colors for meal types
  const getMealColors = (mealType) => {
    switch (mealType) {
      case 'breakfast':
        return {
          bg: '#FFF4E6',         // Light orange bg
          activeBg: '#FFE8CC',   // Brighter orange bg when active
          border: '#F97316',     // Solid orange for border
          activeBorder: '#EA580C', // Darker orange when active
          iconBg: '#FB923C',     // Orange for icon background
          activeIconBg: '#F97316' // Darker orange for active icon
        };
      case 'lunch':
        return {
          bg: '#ECFEFF',          // Light cyan bg
          activeBg: '#CFFAFE',    // Brighter cyan bg when active
          border: '#06B6D4',      // Solid cyan for border 
          activeBorder: '#0891B2', // Darker cyan when active
          iconBg: '#22D3EE',      // Cyan for icon background
          activeIconBg: '#06B6D4' // Darker cyan for active icon
        };
      case 'dinner':
        return {
          bg: '#F0F9FF',          // Light blue bg
          activeBg: '#E0F2FE',    // Brighter blue bg when active
          border: '#0EA5E9',      // Solid blue for border
          activeBorder: '#0284C7', // Darker blue when active
          iconBg: '#38BDF8',      // Blue for icon background
          activeIconBg: '#0EA5E9' // Darker blue for active icon
        };
      case 'snack':
        return {
          bg: '#F0FDF4',          // Light green bg
          activeBg: '#DCFCE7',    // Brighter green bg when active
          border: '#10B981',      // Solid green for border
          activeBorder: '#059669', // Darker green when active
          iconBg: '#34D399',      // Green for icon background
          activeIconBg: '#10B981' // Darker green for active icon
        };
      default:
        return {
          bg: '#F3F4F6',
          activeBg: '#E5E7EB',
          border: 'transparent',
          activeBorder: '#9CA3AF',
          iconBg: '#D1D5DB',
          activeIconBg: '#9CA3AF'
        };
    }
  };

  // Select a meal for a specific date and type
  const selectMealForDay = (meal) => {
    if (!selectedMeal) return;
    
    const { date, mealType } = selectedMeal;
    
    // Use the autoUpdater to add the meal
    autoUpdater.addMealToPlan(meal, mealType, date);
    
    // Keep the active meal state for highlighting purposes
    setTimeout(() => setActiveMeal(null), 1000); // Clear active meal after a delay
    setSliderOpen(false);
  };

  // Clear a meal from the plan
  const clearMeal = (date, mealType) => {
    const dateKey = formatDateKey(date);
    
    if (!mealPlan[dateKey] || !mealPlan[dateKey][mealType]) return;
    
    setActiveMeal({ date: dateKey, type: mealType });
    
    // Use the autoUpdater to remove the meal
    autoUpdater.removeMealFromView(date, mealType);
    
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

  // Create a new meal plan using autoUpdater
  const createNewPlan = () => {
    autoUpdater.createNewPlan();
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
          
          // Check if this meal is currently being saved
          const isSaving = savingMeals[`${dateKey}-${type}`];
          
          // Get meal-specific colors
          const colors = getMealColors(type);
          
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
                  ? colors.activeBg
                  : isSaving
                    ? `${colors.bg}80` // Add transparency while saving
                    : meal 
                      ? colors.bg
                      : '#F3F4F6',
                borderLeft: isActive 
                  ? `4px solid ${colors.activeBorder}`
                  : isSaving
                    ? `4px dashed ${colors.border}` // Dashed border while saving
                    : meal 
                      ? `4px solid ${colors.border}`
                      : '4px solid transparent',
                opacity: isSaving ? 0.8 : 1, // Slightly reduce opacity while saving
                transition: 'all 0.2s ease-in-out'
              }}
              onClick={(e) => {
                // Stop the event from bubbling up to the parent day div
                e.stopPropagation();
                openMealSelector(date, type);
              }}
            >
              <div className="flex items-center">
                <div className={`p-1.5 rounded-full mr-2`} style={{
                  backgroundColor: isActive 
                    ? colors.activeIconBg
                    : meal 
                      ? colors.iconBg
                      : '#D1D5DB',
                  color: 'white'
                }}>
                  {isSaving ? <Loader className="w-4 h-4 animate-spin" /> : getMealIcon(type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${
                    isActive 
                      ? 'font-semibold'
                      : meal 
                        ? 'font-medium'
                        : 'text-gray-500'
                  }`} style={{ color: meal || isActive ? colors.activeBorder : '' }}>
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
        
        {/* Full-screen white background */}
        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
        
        {/* Main Content Container */}
        <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg w-full max-w-5xl flex-grow flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
                Grovli Planner
              </h2>
              
              <div className="flex items-center gap-3">
                {isLoadingPlans && (
                  <div className="flex items-center text-gray-500">
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Loading plans...
                  </div>
                )}
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
                    onClick={(e) => {
                      e.currentTarget.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                      
                      const newDate = new Date(day);
                      
                      const hasAnyMeals = Object.keys(mealPlan).length > 0;
                      const isNewDay = !isSelected(day);
                      
                      if (hasAnyMeals && isNewDay) {
                        setTargetDateForDuplicate(newDate);
                        setShowDuplicateDialog(true);
                      } else {
                        setTargetDateForDuplicate(null);
                      }
                      
                      setSelectedDate(prevDate => {
                        prevDate.setDate(newDate.getDate());
                        prevDate.setMonth(newDate.getMonth());
                        prevDate.setFullYear(newDate.getFullYear());
                        return prevDate;
                      });
                    }}
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
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {showDuplicateDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full transform transition-all duration-300 scale-100 opacity-100">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Meals
              </h3>
              <button 
                onClick={() => setShowDuplicateDialog(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 mb-4 pb-2 border-b border-gray-100">
                Copy all meals from a selected day to:
                <span className="block mt-1 font-medium text-teal-600">
                  {targetDateForDuplicate?.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </span>
              </p>
              
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Select source day:
              </label>
              <div className="relative">
                <select 
                  className="w-full p-3 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 appearance-none shadow-sm"
                  value={sourceDateForDuplicate ? formatDateKey(sourceDateForDuplicate) : ""}
                  onChange={(e) => {
                    const dateKey = e.target.value;
                    if (!dateKey) {
                      setSourceDateForDuplicate(null);
                      return;
                    }
                    
                    // Find the matching calendar day
                    const sourceDate = calendarDays.find(day => formatDateKey(day) === dateKey);
                    if (sourceDate) {
                      setSourceDateForDuplicate(new Date(sourceDate));
                    }
                  }}
                >
                  <option value="">Select a day</option>
                  {calendarDays
                    .filter(day => formatDateKey(day) !== formatDateKey(targetDateForDuplicate))
                    .map((day, idx) => {
                      const dateKey = formatDateKey(day);
                      const hasMeals = mealPlan[dateKey] && Object.keys(mealPlan[dateKey]).length > 0;
                      
                      return (
                        <option 
                          key={idx} 
                          value={dateKey}
                          disabled={!hasMeals}
                        >
                          {day.toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            month: 'short', 
                            day: 'numeric' 
                          })} {hasMeals ? `(${Object.keys(mealPlan[dateKey]).length} meals)` : "(No meals)"}
                        </option>
                      );
                    })}
                </select>
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-500">
                  <ChevronLeft className="h-5 w-5 rotate-90" />
                </div>
              </div>
              
              {sourceDateForDuplicate && mealPlan[formatDateKey(sourceDateForDuplicate)] && (
                <div className="mt-5 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="font-medium text-gray-700 mb-2">Meals that will be copied:</p>
                  <div className="space-y-2">
                    {Object.entries(mealPlan[formatDateKey(sourceDateForDuplicate)] || {}).map(([type, meal]) => (
                      <div key={type} className="flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center" 
                            style={{ backgroundColor: getMealColors(type).iconBg }}>
                          {getMealIcon(type)}
                        </div>
                        <span className="capitalize font-medium">{type}:</span> 
                        <span className="text-gray-600 truncate">{meal.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowDuplicateDialog(false);
                  setSourceDateForDuplicate(null);
                }}
                className="px-4 py-2 text-gray-600 font-medium hover:text-gray-800 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={duplicateDayMeals}
                disabled={!sourceDateForDuplicate || !mealPlan[formatDateKey(sourceDateForDuplicate)]}
                className={`px-4 py-2 bg-teal-500 text-white rounded-lg flex items-center shadow-sm ${
                  !sourceDateForDuplicate || !mealPlan[formatDateKey(sourceDateForDuplicate)] 
                    ? 'opacity-50 cursor-not-allowed bg-gray-400' 
                    : 'hover:bg-teal-600 shadow-teal-200/50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Meals
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }
