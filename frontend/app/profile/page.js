"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { PlusCircle, Coffee, Utensils, Apple, Moon, ArrowLeft, CheckIcon, TrashIcon } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useUser();
  const isAuthenticated = !!user;
  const [accessToken, setAccessToken] = useState(null);

  // States
  const [activeSection, setActiveSection] = useState('timeline');
  const [selectedMealType, setSelectedMealType] = useState(null);
  const [calorieData, setCalorieData] = useState({ consumed: 0, target: 2000 });
  const [isLoadingSavedMeals, setIsLoadingSavedMeals] = useState(false);
  const [currentMealIndex, setCurrentMealIndex] = useState(0);
  const [activePlanId, setActivePlanId] = useState(null);
  const [userPlans, setUserPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [isDataReady, setIsDataReady] = useState(false);
  const [completedMeals, setCompletedMeals] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());
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
  
  const [mealPlan, setMealPlan] = useState([
    { ...defaultMeal, type: 'breakfast', time: '8:00 AM' },
    { ...defaultMeal, type: 'lunch', time: '12:30 PM' },
    { ...defaultMeal, type: 'snack', time: '3:30 PM' },
    { ...defaultMeal, type: 'dinner', time: '7:00 PM' }
  ]);

  const [nextMeal, setNextMeal] = useState({
    ...defaultMeal,
    time: '8:00 AM',
    type: 'breakfast'
  });

  const [savedMeals, setSavedMeals] = useState({
    breakfast: [],
    lunch: [],
    snack: [],
    dinner: []
  });

  // Helper functions
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

  const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // API functions
  const makeAuthenticatedRequest = async (endpoint, options = {}) => {
    if (!accessToken) throw new Error("Access token not available");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          ...(options.headers || {})
        }
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${error.message}`);
      throw error;
    }
  };

  const saveMealCompletion = async (mealType, completed) => {
    try {
      await makeAuthenticatedRequest('/user-profile/meal-completion', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.sub,
          date: getTodayDateString(),
          meal_type: mealType,
          completed: completed
        }),
      });
    } catch (error) {
      console.error('Error saving meal completion:', error);
      throw error;
    }
  };

  const loadMealCompletions = async () => {
    try {
      const today = getTodayDateString();
      const completions = await makeAuthenticatedRequest(`/user-profile/meal-completion/${user.sub}/${today}`);
      
      // Update both state and meal plan completions
      setCompletedMeals(completions);
      setMealPlan(prevMeals => 
        prevMeals.map(meal => ({
          ...meal,
          completed: completions[meal.type] || false
        }))
      );
      
      return completions;
    } catch (error) {
      console.error('Error loading meal completions:', error);
      return {};
    }
  };

  const updateCurrentAndNextMeals = (meals) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const plannedMeals = meals.filter(meal => meal.name);
    
    if (plannedMeals.length === 0) {
      return { currentMealIndex: 0, nextMealIndex: 0 };
    }
    
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
    
    let nextIndex = currentIndex;
    for (let i = currentIndex + 1; i < plannedMeals.length; i++) {
      if (!plannedMeals[i].completed) {
        nextIndex = i;
        break;
      }
    }
    
    if (nextIndex === currentIndex) {
      for (let i = 0; i < plannedMeals.length; i++) {
        if (!plannedMeals[i].completed && i !== currentIndex) {
          nextIndex = i;
          break;
        }
      }
    }
    
    const originalCurrentIndex = meals.findIndex(m => m.type === plannedMeals[currentIndex]?.type);
    const originalNextIndex = meals.findIndex(m => m.type === plannedMeals[nextIndex]?.type);
    
    return {
      currentMealIndex: originalCurrentIndex >= 0 ? originalCurrentIndex : 0,
      nextMealIndex: originalNextIndex >= 0 ? originalNextIndex : 0
    };
  };

  const fetchUserMealPlans = async () => {
    if (!user || !accessToken) return;

    try {
      setIsLoadingPlans(true);
      setIsDataReady(false);
      
      // Load completions FIRST
      const completions = await loadMealCompletions();
      
      // Then load plans
      const userId = user.sub;
      const plans = await makeAuthenticatedRequest(`/api/user-plans/user/${userId}`);
      setUserPlans(plans);
      
      if (plans.length > 0) {
        const sortedPlans = [...plans].sort((a, b) => 
          new Date(b.updated_at) - new Date(a.updated_at)
        );
        await loadPlanToCalendar(sortedPlans[0], completions);
      }
      
    } catch (error) {
      console.error('Error fetching user meal plans:', error);
    } finally {
      setIsLoadingPlans(false);
      setIsDataReady(true);
    }
  };

  const loadPlanToCalendar = async (plan, initialCompletions = {}) => {
    if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
      return;
    }
  
    setActivePlanId(plan.id);
  
    const today = new Date().toISOString().split('T')[0];
    const todaysMeals = plan.meals.filter(mealItem => mealItem.date === today || mealItem.current_day === true);
  
    if (todaysMeals.length === 0) {
      console.log("No meals planned for today");
      return;
    }
  
    const updatedMealPlan = [...mealPlan];
    const mealTypeToTime = {
      breakfast: '8:00 AM',
      lunch: '12:30 PM',
      snack: '3:30 PM',
      dinner: '7:00 PM'
    };
  
    for (const mealItem of todaysMeals) {
      const { mealType, meal, mealId } = mealItem;
      const recipeId = mealId || (meal && (meal.recipe_id || meal.id));
  
      if (!recipeId) {
        console.error("Invalid meal data for mealType:", mealType);
        continue;
      }
  
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
          completed: initialCompletions[mealType] || false,
          time: mealItem.time || mealTypeToTime[mealType]
        };
      }
    }
  
    setMealPlan(updatedMealPlan);
    const { currentMealIndex, nextMealIndex } = updateCurrentAndNextMeals(updatedMealPlan);
    setCurrentMealIndex(currentMealIndex);
    updateNextMealCard(updatedMealPlan[nextMealIndex]);
    updateCalorieCount(updatedMealPlan);
  };

  const loadDataForDate = async (date) => {
    if (!user || !accessToken) return;
    
    try {
      const dateString = date.toISOString().split('T')[0];
      
      // If we have a loaded plan, just filter for the selected date
      if (userPlans.length > 0 && activePlanId) {
        const activePlan = userPlans.find(plan => plan.id === activePlanId);
        if (activePlan) {
          // Filter meals for the selected date
          const dateMeals = activePlan.meals.filter(meal => meal.date === dateString);
          
          // Create updated meal plan with the filtered meals
          const updatedMealPlan = [...mealPlan];
          
          // Reset all meals to default first
          updatedMealPlan.forEach(meal => {
            meal.name = '';
            meal.calories = 0;
            meal.protein = 0;
            meal.carbs = 0;
            meal.fat = 0;
            meal.image = '';
            meal.completed = false;
            meal.id = null;
          });
          
          // Update with the day's meals
          for (const mealItem of dateMeals) {
            const { mealType, meal } = mealItem;
            const mealIndex = updatedMealPlan.findIndex(m => m.type === mealType);
            
            if (mealIndex !== -1 && meal) {
              updatedMealPlan[mealIndex] = {
                ...updatedMealPlan[mealIndex],
                name: meal.name || meal.title || "",
                calories: meal.calories || meal.nutrition?.calories || 0,
                protein: meal.protein || meal.nutrition?.protein || 0,
                carbs: meal.carbs || meal.nutrition?.carbs || 0,
                fat: meal.fat || meal.nutrition?.fat || 0,
                image: meal.image || meal.imageUrl || "",
                id: meal.id,
                completed: dateString === getTodayDateString() ? (completedMeals[mealType] || false) : false
              };
            }
          }
          
          setMealPlan(updatedMealPlan);
          
          // If it's today, load completion status
          if (dateString === getTodayDateString()) {
            loadMealCompletions();
          } else {
            // Clear completion status for non-today dates
            setCompletedMeals({});
          }
          
          // Update current meal and next meal
          const { currentMealIndex, nextMealIndex } = updateCurrentAndNextMeals(updatedMealPlan);
          setCurrentMealIndex(currentMealIndex);
          updateNextMealCard(updatedMealPlan[nextMealIndex]);
          updateCalorieCount(updatedMealPlan);
        }
      }
    } catch (error) {
      console.error('Error loading data for date:', error);
    }
  };

  const fetchSavedMeals = async (mealType) => {
    if (!user) return;
    
    if (savedMeals[mealType] && savedMeals[mealType].length > 0) {
      return;
    }
  
    try {
      setIsLoadingSavedMeals(true);
      const data = await makeAuthenticatedRequest('/api/user-recipes/saved-recipes/');
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

  const updateCalorieCount = (currentMealPlan = mealPlan) => {
    // Use only meals with names for calculation
    const plannedMeals = currentMealPlan.filter(meal => meal.name);
    
    // Set the target to either the total planned calories or global setting, whichever is higher
    const totalCalories = plannedMeals.reduce((sum, meal) => sum + (parseInt(meal.calories) || 0), 0);
    
    // Calculate consumed calories from completed meals only - using a single source of truth for completion status
    const consumedCalories = plannedMeals
      .filter(meal => meal.completed === true)
      .reduce((sum, meal) => sum + (parseInt(meal.calories) || 0), 0);
    
    // Update state with the correct values
    setCalorieData({ 
      consumed: consumedCalories, 
      target: Math.max(totalCalories, globalSettings.calories)
    });
  };

  const handleJustAte = () => {
    const updatedMealPlan = [...mealPlan];
    updatedMealPlan[currentMealIndex].completed = true;
    
    setMealPlan(updatedMealPlan);
    const { nextMealIndex } = updateCurrentAndNextMeals(updatedMealPlan);
    setCurrentMealIndex(nextMealIndex);
    updateNextMealCard(updatedMealPlan[nextMealIndex]);
    updateCalorieCount(updatedMealPlan);
  };

  const toggleMealCompletion = async (mealType) => {
    // Find the meal in the meal plan
    const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
    if (mealIndex === -1) return;
    
    // Get current completion state
    const currentCompleted = mealPlan[mealIndex].completed;
    const newCompleted = !currentCompleted;
    
    // Update meal plan with new completion state
    const updatedMealPlan = [...mealPlan];
    updatedMealPlan[mealIndex] = {
      ...updatedMealPlan[mealIndex],
      completed: newCompleted
    };
    setMealPlan(updatedMealPlan);
    
    // Also update the completedMeals object to maintain sync
    setCompletedMeals(prev => ({
      ...prev,
      [mealType]: newCompleted
    }));
    
    // Ensure calorie count is updated
    updateCalorieCount(updatedMealPlan);
    
    // Save to backend
    try {
      await saveMealCompletion(mealType, newCompleted);
    } catch (error) {
      // Revert on error
      const revertedMealPlan = [...mealPlan];
      revertedMealPlan[mealIndex].completed = currentCompleted;
      setMealPlan(revertedMealPlan);
      setCompletedMeals(prev => ({
        ...prev,
        [mealType]: currentCompleted
      }));
      updateCalorieCount(revertedMealPlan);
      console.error('Failed to save meal completion:', error);
    }
  };

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
      fetchUserMealPlans().then(() => {
        loadDataForDate(selectedDate);
      });
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
      fetchUserMealPlans();
    };
    
    const handleFocus = () => refreshMealPlans();
    window.addEventListener('focus', handleFocus);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadMealCompletions();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, isAuthLoading]);

  // Load meal completions when user is available
  useEffect(() => {
    if (user?.sub) {
      loadMealCompletions();
    }
  }, [user]);

  // Save completions when unmounting
  useEffect(() => {
    return () => {
      if (user?.sub) {
        Object.entries(completedMeals).forEach(([mealType, completed]) => {
          saveMealCompletion(mealType, completed).catch(console.error);
        });
      }
    };
  }, [completedMeals, user]);

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

  return (
    <>
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 border-none w-full max-w-4xl flex-grow flex flex-col">
          <div className="mb-4 flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-800">Today's Meals</h2>
            <button
              onClick={handleViewMealPlanner}
              className="flex items-center text-teal-600 hover:text-teal-800 transition-colors"
            >
              View Meal Planner
            </button>
          </div>
          
          {isLoadingPlans && (
            <div className="flex justify-center items-center py-8">
              <div className="animate-pulse text-gray-500">Loading your meal plan...</div>
            </div>
          )}
          
          {!isLoadingPlans && isDataReady && (
            <>
              {/* Day Timeline Slider */}
              <section className="mb-4 bg-white p-4 rounded-lg shadow-sm">
                <DayTimelineSlider 
                  currentDate={selectedDate}
                  onDateChange={(date) => {
                    setSelectedDate(date);
                    loadDataForDate(date);
                  }}
                />
              </section>

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

function DayTimelineSlider({ currentDate, onDateChange }) {
  // Generate a 7-day window centered around the selected date
  const [dates, setDates] = useState([]);
  
  useEffect(() => {
    // Generate 7 days - 3 days before and 3 days after the current date
    const generateDates = () => {
      const result = [];
      const today = new Date(currentDate);
      
      // Start 3 days before selected date
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 3);
      
      // Generate all 7 days
      for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        result.push(date);
      }
      
      setDates(result);
    };
    
    generateDates();
  }, [currentDate]);

  // Check if a date is today
  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };
  
  // Check if a date is the currently selected date
  const isSelected = (date) => {
    return date.getDate() === currentDate.getDate() &&
           date.getMonth() === currentDate.getMonth() &&
           date.getFullYear() === currentDate.getFullYear();
  };
  
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-700">Select Day</h3>
        <button 
          onClick={() => onDateChange(new Date())}
          className="text-sm text-teal-600 hover:text-teal-800 transition-colors"
        >
          Today
        </button>
      </div>
      
      <div className="relative">
        <div className="flex justify-between items-center gap-2 overflow-x-auto py-2">
          {dates.map((date, index) => (
            <button
              key={index}
              onClick={() => onDateChange(date)}
              className={`flex flex-col items-center min-w-[60px] p-2 rounded-lg transition-all ${
                isSelected(date) 
                  ? 'bg-teal-500 text-white ring-2 ring-teal-300 transform scale-105' 
                  : isToday(date)
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-100'
              }`}
            >
              <span className="text-xs font-medium">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className={`text-lg font-semibold ${isSelected(date) ? 'text-white' : ''}`}>
                {date.getDate()}
              </span>
              <span className="text-xs">
                {date.toLocaleDateString('en-US', { month: 'short' })}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
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

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="relative">
      <div className="absolute left-6 top-0 bottom-0 w-1 bg-gray-200"></div>
      
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
              {(isCompleted) && (
                <div className="absolute left-6 top-0 bottom-0 w-1 bg-teal-500" 
                     style={{ 
                       top: index === 0 ? '0' : '-2rem', 
                       bottom: index === meals.length - 1 ? '0' : '-2rem'
                     }}
                ></div>
              )}
              
              <div 
                className={`flex items-center justify-center rounded-full h-12 w-12 z-10 cursor-pointer
                  ${isCompleted 
                    ? "bg-teal-500 text-white" 
                    : "bg-gray-200 text-gray-500"}`}
                onClick={() => toggleMealCompletion(meal.type)}
              >
                {isCompleted ? (
                  <CheckIcon className="h-6 w-6 text-white" />
                ) : (
                  <Icon className="h-6 w-6 text-gray-500" />
                )}
              </div>
              
              <div className="ml-4 flex-1">
                <div className={`p-4 ${
                  isCompleted 
                    ? "bg-teal-50 border border-teal-100" 
                    : "bg-gray-50 border border-gray-200"
                }`}>
                  <div className="flex justify-between items-center">
                    <h3 className={`font-medium capitalize ${
                      isCompleted 
                        ? "text-teal-800" 
                        : "text-gray-600"
                    }`}>
                      {meal.type}
                      {isCompleted && <span className="ml-2 text-xs text-teal-600">✓ Completed</span>}
                      {isCurrent && !isCompleted && <span className="ml-2 text-xs text-gray-500">Current</span>}
                      {isPast && !isCompleted && !isCurrent && <span className="ml-2 text-xs text-gray-400">Missed</span>}
                    </h3>
                    <span className={`text-sm ${
                      isCompleted 
                        ? "text-teal-600" 
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

          {meal.id && (
            <button
              onClick={() => router.push(`/mealplan/${meal.id}`)}
              className="w-full mt-3 py-2 bg-teal-500 hover:bg-teal-600 text-white font-bold transition-all"
            >
              See Recipe →
            </button>
          )}
          
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

      <button
        onClick={handleCreateNewMeals}
        className="w-full py-2 px-4 mt-2 bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all">
        Create New Meals
      </button>
    </div>
  );
}