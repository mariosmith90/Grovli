"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { PlusCircle, Coffee, Utensils, Apple, Moon, ArrowLeft, CheckIcon, TrashIcon, Calendar } from 'lucide-react';
import Header from '../../components/header';
import Footer from '../../components/footer';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const isAuthenticated = !!user;
  
  // States with simplified initialization
  const [activeSection, setActiveSection] = useState('timeline');
  const [selectedMealType, setSelectedMealType] = useState(null);
  const [calorieData, setCalorieData] = useState({ consumed: 0, target: 2000 });
  const [isLoadingSavedMeals, setIsLoadingSavedMeals] = useState(true);
  const [currentMealIndex, setCurrentMealIndex] = useState(0);
  const [activePlanId, setActivePlanId] = useState(null);
  const [userPlans, setUserPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState(null);

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

  // Helper function to make authenticated API requests
  const makeAuthenticatedRequest = async (endpoint, options = {}) => {
    if (!user) throw new Error("User not authenticated");
    
    try {
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
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
    if (!user) return;

    try {
      setIsLoadingPlans(true);
      
      const userId = user.sub;
      const plans = await makeAuthenticatedRequest(`/api/user-plans/user/${userId}`);
      setUserPlans(plans);
      
      // Load the most recent plan if available
      if (plans.length > 0) {
        const sortedPlans = [...plans].sort((a, b) => 
          new Date(b.updated_at) - new Date(a.updated_at)
        );
        loadPlanToCalendar(sortedPlans[0]);
      }
      
    } catch (error) {
      console.error('Error fetching user meal plans:', error);
    } finally {
      setIsLoadingPlans(false);
    }
  };

  // Load a plan to the meal plan state
  const loadPlanToCalendar = (plan) => {
    if (!plan || !plan.meals || !Array.isArray(plan.meals)) {
      return;
    }
    
    setActivePlanId(plan.id);
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Filter for today's meals
    const todaysMeals = plan.meals.filter(mealItem => mealItem.date === today);
    
    if (todaysMeals.length === 0) {
      console.log("No meals planned for today");
      return;
    }
    
    // Create a new meal plan based on today's meals
    const updatedMealPlan = [...mealPlan];
    
    // Map the meal types to our time structure
    const mealTypeToTime = {
      breakfast: '8:00 AM',
      lunch: '12:30 PM',
      snack: '3:30 PM',
      dinner: '7:00 PM'
    };
    
    todaysMeals.forEach(mealItem => {
      const { mealType, meal } = mealItem;
      
      if (!meal) return;
      
      // Find index of this meal type in our meal plan
      const mealIndex = updatedMealPlan.findIndex(m => m.type === mealType);
      
      if (mealIndex !== -1) {
        updatedMealPlan[mealIndex] = {
          ...updatedMealPlan[mealIndex],
          name: meal.name || meal.title || "",
          calories: meal.calories || meal.nutrition?.calories || 0,
          protein: meal.protein || meal.nutrition?.protein || 0,
          carbs: meal.carbs || meal.nutrition?.carbs || 0,
          fat: meal.fat || meal.nutrition?.fat || 0,
          image: meal.image || meal.imageUrl || "",
          completed: false // Reset completion status for today
        };
      }
    });
    
    setMealPlan(updatedMealPlan);
    
    // Update current meal index to the earliest non-completed meal
    const currentTime = new Date();
    const timeToMinutes = (timeStr) => {
      const [hours, minutesWithSuffix] = timeStr.split(':');
      const minutes = parseInt(minutesWithSuffix);
      const isPM = timeStr.toLowerCase().includes('pm');
      return (parseInt(hours) % 12 + (isPM ? 12 : 0)) * 60 + minutes;
    };
    
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    // Find the next meal based on current time
    let nextIndex = 0;
    let closestDiff = Infinity;
    
    updatedMealPlan.forEach((meal, index) => {
      if (meal.name) { // Only consider meals that have been planned
        const mealMinutes = timeToMinutes(meal.time);
        const diff = mealMinutes - currentMinutes;
        
        // If the meal is in the future and closer than our current closest
        if (diff >= 0 && diff < closestDiff) {
          closestDiff = diff;
          nextIndex = index;
        }
      }
    });
    
    // If all meals are in the past, select the earliest meal
    if (closestDiff === Infinity) {
      nextIndex = updatedMealPlan.findIndex(meal => meal.name) || 0;
    }
    
    setCurrentMealIndex(nextIndex);
    updateNextMealCard(updatedMealPlan[nextIndex]);
    updateCalorieCount(updatedMealPlan);
  };

  // Fetch saved meals for the add meal selector
  const fetchSavedMeals = async () => {
    if (!user) return;

    try {
      setIsLoadingSavedMeals(true);
      
      const data = await makeAuthenticatedRequest('/api/user-recipes/saved-recipes/');
      
      // Process meals by category
      const categorizedMeals = { breakfast: [], lunch: [], snack: [], dinner: [] };
      const addedMealNames = new Set();
      
      data.forEach(plan => {
        if (!plan.recipes || !Array.isArray(plan.recipes)) return;
        
        plan.recipes.forEach(recipe => {
          // Skip if we've already added this meal
          if (addedMealNames.has(recipe.title)) return;
          
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
          
          categorizedMeals[category].push(formattedMeal);
          addedMealNames.add(recipe.title);
        });
      });
      
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

  // Initialize the app
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      // Fetch user's meal plans first to get the active plan
      fetchUserMealPlans();
      
      // Fetch saved meals for the selector
      fetchSavedMeals();
    }
  }, [isAuthenticated, isLoading]);

  // THE FIX: Add an effect to check for meal plan updates
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    
    // Function to check if meal plan was updated
    const checkForMealPlanUpdates = () => {
      const lastSavedTime = localStorage.getItem('mealPlanLastSaved');
      
      if (lastSavedTime && (!lastCheckTime || new Date(lastSavedTime) > new Date(lastCheckTime))) {
        // Update our last check time
        setLastCheckTime(new Date().toISOString());
        
        // Refresh the meal plans since there was an update
        console.log('Detected meal plan update, refreshing data...');
        fetchUserMealPlans();
      }
    };
    
    // Check immediately when component mounts
    checkForMealPlanUpdates();
    
    // Set up periodic checking (every 5 seconds)
    const intervalId = setInterval(checkForMealPlanUpdates, 5000);
    
    // Also check when window gets focus
    const handleFocus = () => checkForMealPlanUpdates();
    window.addEventListener('focus', handleFocus);
    
    // Also check when returning to this page
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForMealPlanUpdates();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Clean up
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, isLoading, lastCheckTime]);

  // Update calorie count based on planned meals
  const updateCalorieCount = (currentMealPlan = mealPlan) => {
    const totalCalories = currentMealPlan.reduce((sum, meal) => sum + (meal.calories || 0), 0);
    const consumedCalories = currentMealPlan
      .filter(meal => meal.completed)
      .reduce((sum, meal) => sum + (meal.calories || 0), 0);
    
    setCalorieData({ 
      consumed: consumedCalories, 
      target: Math.max(totalCalories, 2000) // Set target to at least 2000
    });
  };

  // Navigation functions
  const handleCreateNewMeals = () => router.push('/meals');
  const handleViewMealPlanner = () => router.push('/planner');
  
  const handleAddMeal = (mealType) => {
    setSelectedMealType(mealType);
    setActiveSection('savedMeals');
  };

  // Select a saved meal
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
      
      // Update next meal if needed
      if (mealTypeIndex === currentMealIndex) {
        updateNextMealCard(updatedMealPlan[mealTypeIndex]);
      }
      
      updateCalorieCount(updatedMealPlan);
    }
    
    setActiveSection('timeline');
  };
  
  // Mark current meal as eaten
  const handleJustAte = () => {
    const updatedMealPlan = [...mealPlan];
    updatedMealPlan[currentMealIndex].completed = true;
    
    // Find next incomplete meal
    let nextIndex = currentMealIndex;
    for (let i = currentMealIndex + 1; i < mealPlan.length; i++) {
      if (!updatedMealPlan[i].completed && updatedMealPlan[i].name) {
        nextIndex = i;
        break;
      }
    }
    
    setMealPlan(updatedMealPlan);
    setCurrentMealIndex(nextIndex);
    updateNextMealCard(updatedMealPlan[nextIndex]);
    updateCalorieCount(updatedMealPlan);
  };

  // Remove a meal
  const handleRemoveMeal = (mealType) => {
    const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
    
    if (mealIndex !== -1) {
      const updatedMealPlan = [...mealPlan];
      updatedMealPlan[mealIndex] = {
        ...updatedMealPlan[mealIndex],
        ...defaultMeal, // Reset to default values
        type: mealType, // Keep the meal type
        time: updatedMealPlan[mealIndex].time // Keep the time
      };
      
      setMealPlan(updatedMealPlan);
      
      // Update current meal if needed
      if (mealIndex === currentMealIndex) {
        // Find next non-empty meal
        let nextIndex = mealIndex;
        for (let i = 0; i < updatedMealPlan.length; i++) {
          if (updatedMealPlan[i].name) {
            nextIndex = i;
            break;
          }
        }
        
        setCurrentMealIndex(nextIndex);
        updateNextMealCard(updatedMealPlan[nextIndex]);
      }
      
      updateCalorieCount(updatedMealPlan);
    }
  };

  return (
    <>
      <Header />
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg w-full max-w-4xl flex-grow flex flex-col">
          
          {/* Plan Header */}
          <div className="mb-4 flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-800">Today's Meals</h2>
            <button
              onClick={handleViewMealPlanner}
              className="flex items-center text-teal-600 hover:text-teal-800 transition-colors"
            >
              <Calendar className="w-4 h-4 mr-2" />
              View Meal Planner
            </button>
          </div>
          
          {/* Loading State */}
          {isLoadingPlans && (
            <div className="flex justify-center items-center py-8">
              <div className="animate-pulse text-gray-500">Loading your meal plan...</div>
            </div>
          )}
          
          {/* Meal Content - Only show when not loading */}
          {!isLoadingPlans && (
            <>
              {/* Next Meal Section */}
              <section className="mb-6 bg-white rounded-lg shadow-md p-4">
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
                  />
                </div>
              </section>
              
              {/* Conditional Rendering for Timeline or Saved Meals */}
              {activeSection === 'timeline' ? (
                <section className="mb-6 bg-white rounded-lg shadow-md p-4">
                  <h2 className="text-lg font-semibold mb-3">Your Meal Timeline</h2>
                  <MealTimeline 
                    meals={mealPlan} 
                    onAddMeal={handleAddMeal}
                    onRemoveMeal={handleRemoveMeal}
                  />
                </section>
              ) : (
                <section className="mb-6 bg-white rounded-lg shadow-md p-4">
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
      <Footer />
    </>
  );
}

// Component: NextMealCard - Simplified
function NextMealCard({ meal, onJustAte, handleCreateNewMeals }) {
  const [isSelected, setIsSelected] = useState(false);

  return (
    <div className="flex flex-col gap-2 max-w-3xl mx-auto">
      <div
        className={`flex flex-col md:flex-row gap-4 bg-gray-50 rounded-lg overflow-hidden relative
          ${isSelected ? "ring-2 ring-teal-500" : ""}`}
      >
        {/* Clickable Image Section */}
        <div
          className="w-full md:w-1/4 h-40 md:h-auto relative cursor-pointer group"
          onClick={() => setIsSelected(!isSelected)}
        >
          <img
            src={meal.image || '/fallback-meal-image.jpg'}
            alt={meal.name || "No meal selected"}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = "/fallback-meal-image.jpg";
            }}
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
          
          {/* Conditionally show "Mark as Completed" button when selected */}
          {isSelected && meal.name && (
            <button
              onClick={() => {
                onJustAte();
                setIsSelected(false);
              }}
              className="w-full mt-3 py-2 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-lg transition-all flex items-center justify-center"
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
        className="w-full py-2 px-4 mt-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-all"
      >
        Create New Meals
      </button>
    </div>
  );
}

// Component: CalorieProgressBar - Simplified
function CalorieProgressBar({ consumed, target }) {
  const percentage = Math.min(Math.round((consumed / target) * 100), 100);
  const remaining = target - consumed;
  
  return (
    <div className="mt-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium">Daily Calories</span>
        <span className="text-sm font-medium">{consumed} / {target} kcal</span>
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

// Component: MealTimeline - Simplified
function MealTimeline({ meals, onAddMeal, onRemoveMeal }) {
  const mealIcons = {
    breakfast: Coffee,
    lunch: Utensils,
    snack: Apple,
    dinner: Moon
  };
  
  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-6 top-0 bottom-0 w-1 bg-gray-200"></div>
      
      {/* Timeline items */}
      <div className="space-y-8">
        {meals.map((meal, index) => {
          const Icon = mealIcons[meal.type];
          const isCompleted = meal.completed;
          const isCurrentMeal = meals.filter(m => m.completed).length === index;
          
          return (
            <div key={index} className="relative flex items-start">
              {/* Highlight line for current progress */}
              {(isCompleted || isCurrentMeal) && (
                <div className="absolute left-6 top-0 bottom-0 w-1 bg-teal-500" 
                     style={{ 
                       top: index === 0 ? '0' : '-2rem', 
                       bottom: isCurrentMeal ? '50%' : (index === meals.length - 1 ? '0' : '-2rem') 
                     }}
                ></div>
              )}
              
              <div className={`flex items-center justify-center rounded-full h-12 w-12 z-10 
                ${isCompleted 
                  ? "bg-teal-500 text-white" 
                  : isCurrentMeal 
                    ? "bg-teal-100 ring-2 ring-teal-500" 
                    : "bg-gray-100"}`}
              >
                {isCompleted ? (
                  <CheckIcon className="h-6 w-6 text-white" />
                ) : (
                  <Icon className={`h-6 w-6 ${isCurrentMeal ? "text-teal-600" : "text-gray-500"}`} />
                )}
              </div>
              
              <div className="ml-4 flex-1">
                <div className={`p-4 rounded-lg ${
                  isCompleted 
                    ? "bg-teal-50 border border-teal-200" 
                    : isCurrentMeal 
                      ? "bg-white border-2 border-teal-200 shadow-sm" 
                      : "bg-gray-50"
                }`}>
                  <div className="flex justify-between items-center">
                    <h3 className={`font-medium capitalize ${isCompleted || isCurrentMeal ? "text-teal-800" : ""}`}>
                      {meal.type}
                      {isCompleted && <span className="ml-2 text-xs text-teal-600">✓ Completed</span>}
                      {isCurrentMeal && <span className="ml-2 text-xs text-teal-600">Current</span>}
                    </h3>
                    <span className="text-sm text-gray-500">{meal.time}</span>
                  </div>
                  
                  {meal.name ? (
                    <div className="mt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {meal.image && (
                            <img 
                              src={meal.image} 
                              alt={meal.name} 
                              className="w-12 h-12 rounded-md object-cover mr-3"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = "/fallback-meal-image.jpg";
                              }}
                            />
                          )}
                          <div>
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

// Component: SavedMeals - Simplified
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
            className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg transition-all"
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
            className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition"
          >
            <img 
              src={meal.image || '/fallback-meal-image.jpg'} 
              alt={meal.name} 
              className="w-16 h-16 rounded-md object-cover"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/fallback-meal-image.jpg";
              }}
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