"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { PlusCircle, Coffee, Utensils, Apple, Moon, ArrowLeft, CheckIcon, TrashIcon, Calendar } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useUser();
  const isAuthenticated = !!user;
  const [accessToken, setAccessToken] = useState(null);

  // States with simplified initialization
  const [activeSection, setActiveSection] = useState('timeline');
  const [selectedMealType, setSelectedMealType] = useState(null);
  const [calorieData, setCalorieData] = useState({ consumed: 0, target: 2000 });
  const [isLoadingSavedMeals, setIsLoadingSavedMeals] = useState(false);
  const [currentMealIndex, setCurrentMealIndex] = useState(0);
  const [activePlanId, setActivePlanId] = useState(null);
  const [userPlans, setUserPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState(null);
  const [isDataReady, setIsDataReady] = useState(false);
  const [completedMeals, setCompletedMeals] = useState({});

  const [globalSettings, setGlobalSettings] = useState({
    calculationMode: 'auto',
    calories: 2000,
    carbs: 270,
    protein: 180,
    fat: 67,
    fiber: 34,
    sugar: 60
  });

  // Default meal structure
  const defaultMeal = {
    name: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    image: '',
    completed: false
  };
  
  // Initialize with default times and meal types
  const [mealPlan, setMealPlan] = useState([
    { ...defaultMeal, type: 'breakfast', time: '8:00 AM' },
    { ...defaultMeal, type: 'lunch', time: '12:30 PM' },
    { ...defaultMeal, type: 'snack', time: '3:30 PM' },
    { ...defaultMeal, type: 'dinner', time: '7:00 PM' }
  ]);

  // Next meal state derived from current meal
  const [nextMeal, setNextMeal] = useState({
    ...defaultMeal,
    time: '8:00 AM',
    type: 'breakfast'
  });

  // Saved meals by category
  const [savedMeals, setSavedMeals] = useState({
    breakfast: [],
    lunch: [],
    snack: [],
    dinner: []
  });

  // Helper function to convert time strings to minutes
  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    
    hours = parseInt(hours);
    minutes = parseInt(minutes || 0);
    
    if (modifier?.toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (modifier?.toLowerCase() === 'am' && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
  };

  // Function to update current and next meals based on time
  const updateCurrentAndNextMeals = (meals) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Find all meals that have been planned (have a name)
    const plannedMeals = meals.filter(meal => meal.name);
    
    if (plannedMeals.length === 0) {
      return { currentMealIndex: 0, nextMealIndex: 0 };
    }
    
    // Find the current meal (the most recent planned meal that hasn't passed its time yet)
    let currentIndex = 0;
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
    
    currentIndex = closestPastIndex;
    
    // Find the next meal (the first planned meal after current time)
    let nextIndex = currentIndex;
    for (let i = currentIndex + 1; i < plannedMeals.length; i++) {
      if (!plannedMeals[i].completed) {
        nextIndex = i;
        break;
      }
    }
    
    // If we didn't find a next meal, look from the start
    if (nextIndex === currentIndex) {
      for (let i = 0; i < plannedMeals.length; i++) {
        if (!plannedMeals[i].completed && i !== currentIndex) {
          nextIndex = i;
          break;
        }
      }
    }
    
    // Convert back to original meal plan indices
    const originalCurrentIndex = meals.findIndex(m => m.type === plannedMeals[currentIndex]?.type);
    const originalNextIndex = meals.findIndex(m => m.type === plannedMeals[nextIndex]?.type);
    
    return {
      currentMealIndex: originalCurrentIndex >= 0 ? originalCurrentIndex : 0,
      nextMealIndex: originalNextIndex >= 0 ? originalNextIndex : 0
    };
  };

  // Helper function to make authenticated API requests
  const makeAuthenticatedRequest = async (endpoint, options = {}) => {
    if (!accessToken) throw new Error("Access token not available");
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const url = `${apiUrl}${endpoint}`;
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          ...(options.headers || {})
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${error.message}`);
      throw error;
    }
  };

  // Fetch user's meal plans
  const fetchUserMealPlans = async () => {
    if (!user || !accessToken) return;

    try {
      setIsLoadingPlans(true);
      setIsDataReady(false);
      
      const userId = user.sub;
      const plans = await makeAuthenticatedRequest(`/api/user-plans/user/${userId}`);
      setUserPlans(plans);
      
      if (plans.length > 0) {
        const sortedPlans = [...plans].sort((a, b) => 
          new Date(b.updated_at) - new Date(a.updated_at)
        );
        await loadPlanToCalendar(sortedPlans[0]);
      }
      
    } catch (error) {
      console.error('Error fetching user meal plans:', error);
    } finally {
      setIsLoadingPlans(false);
      setIsDataReady(true);
    }
  };

  // Load a plan to the meal plan state
  const loadPlanToCalendar = async (plan) => {
    if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
      return;
    }
  
    setActivePlanId(plan.id);
  
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
  
    // Filter for today's meals using the current_day flag
    const todaysMeals = plan.meals.filter(mealItem => mealItem.date === today || mealItem.current_day === true);
  
    if (todaysMeals.length === 0) {
      console.log("No meals planned for today");
      return;
    }
  
    const updatedMealPlan = [...mealPlan];
  
    // Map the meal types to our time structure
    const mealTypeToTime = {
      breakfast: '8:00 AM',
      lunch: '12:30 PM',
      snack: '3:30 PM',
      dinner: '7:00 PM'
    };
  
    for (const mealItem of todaysMeals) {
      const { mealType, meal, mealId } = mealItem;
      
      // Determine the meal ID to use
      const recipeId = mealId || (meal && (meal.recipe_id || meal.id));
  
      if (!recipeId) {
        console.error("Invalid meal data for mealType:", mealType);
        continue;
      }
  
      // Fetch meal details using the recipe_id (which corresponds to meal_id)
      const mealDetails = await makeAuthenticatedRequest(`/mealplan/${recipeId}`);
  
      const mealIndex = updatedMealPlan.findIndex(m => m.type === mealType);
  
      if (mealIndex !== -1) {
        updatedMealPlan[mealIndex] = {
          ...updatedMealPlan[mealIndex],
          name: mealDetails.title || (meal && meal.title) || "",
          calories: mealDetails.nutrition?.calories || (meal && meal.nutrition?.calories) || 0,
          protein: mealDetails.nutrition?.protein || (meal && meal.nutrition?.protein) || 0,
          carbs: mealDetails.nutrition?.carbs || (meal && meal.nutrition?.carbs) || 0,
          fat: mealDetails.nutrition?.fat || (meal && meal.nutrition?.fat) || 0,
          image: mealDetails.imageUrl || (meal && meal.imageUrl) || "",
          id: recipeId,
          completed: false,
          time: mealItem.time || mealTypeToTime[mealType]
        };
      }
    }
  
    setMealPlan(updatedMealPlan);
  
    // Use time-based logic to determine current and next meals
    const { currentMealIndex, nextMealIndex } = updateCurrentAndNextMeals(updatedMealPlan);
    
    setCurrentMealIndex(currentMealIndex);
    updateNextMealCard(updatedMealPlan[nextMealIndex]);
    updateCalorieCount(updatedMealPlan);
  };

  // Fetch saved meals for the add meal selector
  const fetchSavedMeals = async (mealType) => {
    if (!user) return;
    
    if (savedMeals[mealType] && savedMeals[mealType].length > 0) {
      return;
    }
  
    try {
      setIsLoadingSavedMeals(true);
  
      const data = await makeAuthenticatedRequest('/api/user-recipes/saved-recipes/');
  
      // Process meals by category, but only for the requested type
      const categorizedMeals = { ...savedMeals };
      const addedMealNames = new Set();
  
      for (const plan of data) {
        if (!plan.recipes || !Array.isArray(plan.recipes)) continue;
  
        for (const recipe of plan.recipes) {
          if (addedMealNames.has(recipe.title)) continue;
  
          const recipeMealType = (recipe.meal_type || '').toLowerCase();
          const category = ['breakfast', 'lunch', 'dinner', 'snack'].includes(recipeMealType) 
            ? recipeMealType : 'snack';
            
          if (category !== mealType) continue;
  
          const mealDetails = await makeAuthenticatedRequest(`/mealplan/${recipe.recipe_id}`);
  
          const formattedMeal = {
            id: recipe.recipe_id,
            name: mealDetails.title || recipe.title,
            calories: mealDetails.nutrition?.calories || 0,
            protein: mealDetails.nutrition?.protein || 0,
            carbs: mealDetails.nutrition?.carbs || 0,
            fat: mealDetails.nutrition?.fat || 0,
            image: mealDetails.imageUrl || recipe.imageUrl || "",
            ingredients: mealDetails.ingredients || [],
            instructions: mealDetails.instructions || ''
          };
  
          if (!categorizedMeals[category]) {
            categorizedMeals[category] = [];
          }
          
          categorizedMeals[category].push(formattedMeal);
          addedMealNames.add(recipe.title);
        }
      }
  
      setSavedMeals(categorizedMeals);
  
    } catch (error) {
      console.error('Error fetching saved meals:', error);
    } finally {
      setIsLoadingSavedMeals(false);
    }
  };

  // Update next meal card
  const updateNextMealCard = (meal) => {
    if (!meal) return;
    
    setNextMeal({
      name: meal.name || "No meal planned",
      time: meal.time,
      calories: meal.calories || 0,
      protein: meal.protein || 0,
      carbs: meal.carbs || 0,
      fat: meal.fat || 0,
      image: meal.image || "",
      type: meal.type
    });
  };

  // Update calorie count based on planned meals
  const updateCalorieCount = (currentMealPlan = mealPlan) => {
    const totalCalories = currentMealPlan.reduce((sum, meal) => sum + (meal.calories || 0), 0);
    const consumedCalories = currentMealPlan
      .filter(meal => meal.completed || completedMeals[meal.type])
      .reduce((sum, meal) => sum + (meal.calories || 0), 0);
    
    setCalorieData({ 
      consumed: consumedCalories, 
      target: Math.max(totalCalories, globalSettings.calories)
    });
  };

  // Mark current meal as eaten
  const handleJustAte = () => {
    const updatedMealPlan = [...mealPlan];
    updatedMealPlan[currentMealIndex].completed = true;
    
    setMealPlan(updatedMealPlan);
    
    // Use time-based logic to determine next meal
    const { nextMealIndex } = updateCurrentAndNextMeals(updatedMealPlan);
    setCurrentMealIndex(nextMealIndex);
    updateNextMealCard(updatedMealPlan[nextMealIndex]);
    updateCalorieCount(updatedMealPlan);
  };

  // Toggle meal completion
  const toggleMealCompletion = (mealType) => {
    setCompletedMeals(prev => {
      const newState = {
        ...prev,
        [mealType]: !prev[mealType]
      };
      updateCalorieCount();
      return newState;
    });
  };

  // Remove a meal
  const handleRemoveMeal = (mealType) => {
    const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
    
    if (mealIndex !== -1) {
      const updatedMealPlan = [...mealPlan];
      updatedMealPlan[mealIndex] = {
        ...updatedMealPlan[mealIndex],
        ...defaultMeal,
        type: mealType,
        time: updatedMealPlan[mealIndex].time
      };
      
      setMealPlan(updatedMealPlan);
      
      if (mealIndex === currentMealIndex) {
        const { nextMealIndex } = updateCurrentAndNextMeals(updatedMealPlan);
        setCurrentMealIndex(nextMealIndex);
        updateNextMealCard(updatedMealPlan[nextMealIndex]);
      }
      
      updateCalorieCount(updatedMealPlan);
    }
  };

  // Initialize the app
  useEffect(() => {
    if (isAuthenticated && !isAuthLoading) {
      const fetchAccessToken = async () => {
        try {
          const token = await getAccessToken({
            authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
          });
          setAccessToken(token);
        } catch (error) {
          console.error('Error fetching access token:', error);
        }
      };

      fetchAccessToken();
    }
  }, [isAuthenticated, isAuthLoading]);

  useEffect(() => {
    if (accessToken) {
      fetchUserMealPlans();
    }
  }, [accessToken]);

  useEffect(() => {
    if (isAuthenticated && !isAuthLoading) {
      fetchUserMealPlans();
      
      const savedSettings = JSON.parse(localStorage.getItem('globalMealSettings') || '{}');
      if (Object.keys(savedSettings).length > 0) {
        setGlobalSettings(savedSettings);
        setCalorieData(prev => ({
          ...prev,
          target: savedSettings.calories || 2000
        }));
      }
      
      if (user && user.sub) {
        const fetchUserSettings = async () => {
          try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
            const response = await fetch(`${apiUrl}/user-settings/${user.sub}`);
            
            if (response.ok) {
              const serverSettings = await response.json();
              setGlobalSettings(serverSettings);
              setCalorieData(prev => ({
                ...prev,
                target: serverSettings.calories || 2000
              }));
            }
          } catch (error) {
            console.error("Error fetching user settings:", error);
          }
        };
        
        fetchUserSettings();
      }
    }
  }, [isAuthenticated, isAuthLoading]);
  
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return;
    
    const refreshMealPlans = () => {
      console.log('Refreshing meal plans data...');
      fetchUserMealPlans();
    };
    
    const handleFocus = () => refreshMealPlans();
    window.addEventListener('focus', handleFocus);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshMealPlans();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, isAuthLoading]);
  
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return;
    
    const checkForMealPlanUpdates = () => {
      const lastSavedTime = localStorage.getItem('mealPlanLastUpdated');
      
      if (lastSavedTime && (!lastCheckTime || new Date(lastSavedTime) > new Date(lastCheckTime))) {
        setLastCheckTime(new Date().toISOString());
        console.log('Detected meal plan update, refreshing data...');
        fetchUserMealPlans();
      }
    };
    
    checkForMealPlanUpdates();
    
    const intervalId = setInterval(checkForMealPlanUpdates, 5000);
    
    const handleFocus = () => checkForMealPlanUpdates();
    window.addEventListener('focus', handleFocus);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForMealPlanUpdates();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, isAuthLoading, lastCheckTime]);

  // Check and update current meal periodically
  useEffect(() => {
    if (!isDataReady) return;

    const checkCurrentMeal = () => {
      const { currentMealIndex, nextMealIndex } = updateCurrentAndNextMeals(mealPlan);
      setCurrentMealIndex(currentMealIndex);
      updateNextMealCard(mealPlan[nextMealIndex]);
    };

    checkCurrentMeal();
    const intervalId = setInterval(checkCurrentMeal, 60000);

    return () => clearInterval(intervalId);
  }, [mealPlan, isDataReady]);

  // Navigation functions
  const handleCreateNewMeals = () => router.push('/meals');
  const handleViewMealPlanner = () => router.push('/planner');
  
  const handleAddMeal = (mealType) => {
    setSelectedMealType(mealType);
    setActiveSection('savedMeals');
    fetchSavedMeals(mealType);
  };

  const handleSelectSavedMeal = (meal) => {
    const mealTypeIndex = mealPlan.findIndex(item => item.type === selectedMealType);
    
    if (mealTypeIndex !== -1) {
      const updatedMealPlan = [...mealPlan];
      updatedMealPlan[mealTypeIndex] = {
        ...updatedMealPlan[mealTypeIndex],
        name: meal.name,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        image: meal.image
      };
      
      setMealPlan(updatedMealPlan);
      
      if (mealTypeIndex === currentMealIndex) {
        updateNextMealCard(updatedMealPlan[mealTypeIndex]);
      }
      
      updateCalorieCount(updatedMealPlan);
    }
    
    setActiveSection('timeline');
  };

  return (
    <>
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
       <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 border-none w-full max-w-4xl flex-grow flex flex-col">
          
          {/* Plan Header */}
          <div className="mb-4 flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-800">Today's Meals</h2>
            <button
              onClick={handleViewMealPlanner}
              className="flex items-center text-teal-600 hover:text-teal-800 transition-colors"
            >
              View Meal Planner
            </button>
          </div>
          
          {/* Loading State */}
          {isLoadingPlans && (
            <div className="flex justify-center items-center py-8">
              <div className="animate-pulse text-gray-500">Loading your meal plan...</div>
            </div>
          )}
          
          {/* Meal Content */}
          {!isLoadingPlans && isDataReady && (
            <>
              {/* Next Meal Section */}
              <section className="mb-6 bg-white p-4">
                <h2 className="text-2xl font-semibold mb-3 flex items-center">
                  {(() => {
                    const Icon = { breakfast: Coffee, lunch: Utensils, snack: Apple, dinner: Moon }[nextMeal.type];
                    return (
                      <>
                        <Icon className="w-6 h-6 mr-2 text-teal-600" />
                        {nextMeal.type.charAt(0).toUpperCase() + nextMeal.type.slice(1)}
                      </>
                    );
                  })()}
                </h2>
                <NextMealCard 
                  meal={nextMeal} 
                  onJustAte={handleJustAte} 
                  handleCreateNewMeals={handleCreateNewMeals} 
                />
                <div className="mt-4">
                  <CalorieProgressBar 
                    consumed={calorieData.consumed} 
                    target={calorieData.target}
                    globalSettings={globalSettings}
                  />
                </div>
              </section>
              
              {/* Conditional Rendering for Timeline or Saved Meals */}
              {activeSection === 'timeline' ? (
                <section className="mb-6 bg-white p-4">
                  <h2 className="text-lg font-semibold mb-3">Your Meal Timeline</h2>
                  <MealTimeline 
                    meals={mealPlan} 
                    onAddMeal={handleAddMeal}
                    onRemoveMeal={handleRemoveMeal}
                    toggleMealCompletion={toggleMealCompletion}
                    completedMeals={completedMeals}
                  />
                </section>
              ) : (
                <section className="mb-6 bg-white p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-semibold">Saved Meals</h2>
                    <button 
                      onClick={() => setActiveSection('timeline')}
                      className="text-teal-600 hover:underline flex items-center"
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" /> Back to Timeline
                    </button>
                  </div>
                  <SavedMeals 
                    mealType={selectedMealType} 
                    onSelectMeal={handleSelectSavedMeal}
                    savedMeals={savedMeals}
                    isLoading={isLoadingSavedMeals}
                    handleCreateNewMeals={handleCreateNewMeals}
                  />
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

function SavedMeals({ mealType, onSelectMeal, savedMeals, isLoading, handleCreateNewMeals }) {
  const meals = savedMeals[mealType] || [];
  
  if (isLoading) {
    return <div className="py-8 text-center text-gray-500">Loading saved meals...</div>;
  }
  
  if (meals.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        <p>You don't have any saved {mealType} meals yet.</p>
        <div className="mt-4">
          <button 
            onClick={handleCreateNewMeals}
            className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold transition-all"
          >
            Create new meals
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div>
      <h3 className="text-lg font-medium mb-4 capitalize">Saved {mealType} Options</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {meals.map((meal) => (
          <div 
            key={meal.id}
            onClick={() => onSelectMeal(meal)}
            className="flex items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition"
          >
            <img 
              src={meal.image || ''} 
              alt={meal.name} 
              className="w-16 h-16 object-cover"
            />
            <div className="ml-3">
              <h4 className="font-medium">{meal.name}</h4>
              <p className="text-sm text-gray-600">{meal.calories} calories</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MealTimeline({ meals, onAddMeal, onRemoveMeal, toggleMealCompletion, completedMeals }) {
  const mealIcons = {
    breakfast: Coffee,
    lunch: Utensils,
    snack: Apple,
    dinner: Moon
  };
  const router = useRouter();

  // Helper function to convert time strings to minutes
  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    
    hours = parseInt(hours);
    minutes = parseInt(minutes || 0);
    
    if (modifier?.toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (modifier?.toLowerCase() === 'am' && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
  };

  // Determine current time for highlighting
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-6 top-0 bottom-0 w-1 bg-gray-200"></div>
      
      {/* Timeline items */}
      <div className="space-y-8">
        {meals.map((meal, index) => {
          const Icon = mealIcons[meal.type];
          const mealMinutes = timeToMinutes(meal.time);
          const isPast = currentMinutes > mealMinutes;
          const isCompleted = completedMeals[meal.type] || meal.completed;
          const isCurrent = !isCompleted && isPast && 
            (index === meals.length - 1 || currentMinutes < timeToMinutes(meals[index + 1].time));

          return (
            <div key={index} className="relative flex items-start">
              {/* Highlight line for current progress */}
              {(isCompleted || isCurrent) && (
                <div className="absolute left-6 top-0 bottom-0 w-1 bg-teal-500" 
                     style={{ 
                       top: index === 0 ? '0' : '-2rem', 
                       bottom: isCurrent ? '50%' : (index === meals.length - 1 ? '0' : '-2rem') 
                     }}
                ></div>
              )}
              
              <div 
                className={`flex items-center justify-center rounded-full h-12 w-12 z-10 cursor-pointer
                  ${isCompleted 
                    ? "bg-teal-500 text-white" 
                    : isCurrent 
                      ? "bg-teal-100 ring-2 ring-teal-500" 
                      : isPast
                        ? "bg-gray-200"
                        : "bg-gray-100"}`}
                onClick={() => toggleMealCompletion(meal.type)}
              >
                {isCompleted ? (
                  <CheckIcon className="h-6 w-6 text-white" />
                ) : (
                  <Icon className={`h-6 w-6 ${isCurrent ? "text-teal-600" : "text-gray-500"}`} />
                )}
              </div>
              
              <div className="ml-4 flex-1">
                <div className={`p-4 ${
                  isCompleted 
                    ? "bg-teal-50 border border-teal-100" 
                    : isCurrent 
                      ? "bg-white border-2 border-teal-100" 
                      : isPast
                        ? "bg-gray-50"
                        : "bg-white"
                }`}>
                  <div className="flex justify-between items-center">
                    <h3 className={`font-medium capitalize ${
                      isCompleted 
                        ? "text-teal-800" 
                        : isCurrent 
                          ? "text-teal-800" 
                          : isPast
                            ? "text-gray-500"
                            : ""
                    }`}>
                      {meal.type}
                      {isCompleted && <span className="ml-2 text-xs text-teal-600">✓ Completed</span>}
                      {isCurrent && <span className="ml-2 text-xs text-teal-600">Current</span>}
                      {isPast && !isCompleted && !isCurrent && <span className="ml-2 text-xs text-gray-400">Missed</span>}
                    </h3>
                    <span className={`text-sm ${
                      isCompleted 
                        ? "text-teal-600" 
                        : isCurrent 
                          ? "text-teal-600" 
                          : isPast
                            ? "text-gray-400"
                            : "text-gray-500"
                    }`}>{meal.time}</span>
                  </div>
                  
                  {meal.name ? (
                    <div className="mt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {meal.image && (
                            <img 
                              src={meal.image} 
                              alt={meal.name} 
                              className={`w-12 h-12 object-cover mr-3 cursor-pointer hover:ring-2 hover:ring-teal-500 hover:ring-offset-2 transition-all ${
                                isCompleted ? "opacity-70" : ""
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/recipes/${meal.id}`);
                              }}
                            />
                          )}
                          <div className={isCompleted ? "opacity-70" : ""}>
                            <p className={isCompleted ? "line-through text-gray-500" : ""}>{meal.name}</p>
                            <p className="text-sm text-gray-600">{meal.calories} calories</p>
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => onRemoveMeal(meal.type)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove meal"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => onAddMeal(meal.type)}
                      className="mt-2 flex items-center text-teal-600 hover:text-teal-800"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      <span>Add {meal.type}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalorieProgressBar({ consumed, target, globalSettings }) {  
  const targetCalories = globalSettings?.calories || target;
  const percentage = Math.min(Math.round((consumed / targetCalories) * 100), 100);
  const remaining = targetCalories - consumed;
  
  return (
    <div className="mt-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium">Daily Calories</span>
        <span className="text-sm font-medium">{consumed} / {targetCalories} kcal</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4">
        <div 
          className="bg-teal-600 h-4 rounded-full" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <p className="text-sm text-gray-600 mt-2">
        {remaining > 0 
          ? `You have ${remaining} calories remaining today` 
          : "You've reached your calorie goal for today"}
      </p>
    </div>
  );
}

function NextMealCard({ meal, onJustAte, handleCreateNewMeals }) {
  const [isSelected, setIsSelected] = useState(false);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 max-w-3xl mx-auto">
      <div
        className={`flex flex-col md:flex-row gap-4 overflow-hidden relative
          ${isSelected ? "ring-2 ring-white" : ""}`}
      >
        {/* Clickable Image Section */}
        <div
          className="w-full md:w-1/4 h-40 md:h-auto relative cursor-pointer group"
          onClick={() => setIsSelected(!isSelected)}
        >
          <img
            src={meal.image || ''}
            alt={meal.name || "No meal selected"}
            className="w-full h-full object-cover"
          />
          <div
            className={`absolute inset-0 transition-opacity ${
              isSelected ? "bg-gray-200/50 backdrop-blur-sm" : "bg-black/20 opacity-0 group-hover:opacity-100"
            }`}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`bg-white/90 rounded-full py-1 px-2 text-xs font-semibold transition-all
                ${isSelected ? "text-teal-700 bg-teal-100 flex items-center" : "text-gray-700"}`}
            >
              {isSelected ? (
                <>
                  <CheckIcon className="w-3 h-3 mr-1" />
                  Selected
                </>
              ) : (
                "Click to Select"
              )}
            </div>
          </div>
        </div>

        {/* Meal Information */}
        <div className="p-3 flex-1">
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-bold">{meal.name || "No meal selected"}</h3>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="text-center p-1.5 bg-blue-50 rounded-lg">
              <p className="text-xs text-gray-600">Calories</p>
              <p className="font-bold text-sm">{meal.calories}</p>
            </div>
            <div className="text-center p-1.5 bg-green-50 rounded-lg">
              <p className="text-xs text-gray-600">Protein</p>
              <p className="font-bold text-sm">{meal.protein}g</p>
            </div>
            <div className="text-center p-1.5 bg-yellow-50 rounded-lg">
              <p className="text-xs text-gray-600">Carbs</p>
              <p className="font-bold text-sm">{meal.carbs}g</p>
            </div>
          </div>

          {/* See Recipe button */}
          {meal.id && (
            <button
              onClick={() => router.push(`/mealplan/${meal.id}`)}
              className="w-full mt-3 py-2 bg-teal-500 hover:bg-teal-600 text-white font-bold transition-all"
            >
              See Recipe →
            </button>
          )}
          
          {/* Conditionally show "Mark as Completed" button when selected */}
          {isSelected && meal.name && (
            <button
              onClick={() => {
                onJustAte();
                setIsSelected(false);
              }}
              className="w-full mt-3 py-2 bg-teal-500 hover:bg-teal-600 text-white font-bold transition-all flex items-center justify-center"
            >
              <CheckIcon className="w-4 h-4 mr-2" />
              Mark as Completed
            </button>
          )}
        </div>
      </div>

      {/* Create New Meals Button */}
      <button
        onClick={handleCreateNewMeals}
        className="w-full py-2 px-4 mt-2 bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all">
        Create New Meals
      </button>
    </div>
  );
}