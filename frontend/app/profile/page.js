"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { Coffee, Utensils, Apple, Moon, ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';
import DayTimelineSlider from '../../components/features/profile/daytimeline';
import MealTimeline from '../../components/features/profile/mealtimeline';
import NextMealCard from '../../components/features/profile/nextmeal';
import CalorieProgressBar from '../../components/features/profile/caloriebar';
import SavedMeals from '../../components/features/profile/savedmeals';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useUser();
  const isAuthenticated = !!user;
  const [accessToken, setAccessToken] = useState(null);
  const timelineRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);
  const [savingMeals, setSavingMeals] = useState({});

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

  const updateMealPlan = async (updatedMealPlan, changeType = 'update', affectedMeals = []) => {
    // Save the updated plan to state
    setMealPlan(updatedMealPlan);
    
    // Mark the affected meals as saving
    const newSavingState = {};
    affectedMeals.forEach(meal => {
      newSavingState[`${meal.dateKey}-${meal.mealType}`] = true;
    });
    setSavingMeals(prev => ({ ...prev, ...newSavingState }));
    
    // Clear any existing timeout to prevent multiple saves
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Set a short delay before auto-saving to avoid rapid successive saves
    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (!user) {
        toast.error("Please log in to save your meal plan");
        return;
      }
      
      try {
        // Format meals for API
        const formattedMeals = [];
        const today = getTodayDateString();
        
        // Only include today's meals for the profile page
        updatedMealPlan.forEach(meal => {
          if (meal.name) {
            formattedMeals.push({
              date: today,
              mealType: meal.type,
              mealId: meal.id,
              current_day: true
            });
          }
        });
        
        if (formattedMeals.length === 0) {
          // Don't bother saving an empty plan
          return;
        }
        
        // Prepare request data
        const requestData = {
          userId: user.sub,
          planName: `Daily Plan - ${new Date().toLocaleDateString()}`,
          meals: formattedMeals
        };
        
        // If we don't have an active plan yet and we're adding the first meal,
        // create a new plan, otherwise update the existing one
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
        }
        
        // Update localStorage to trigger refresh in other components
        localStorage.setItem('mealPlanLastUpdated', new Date().toISOString());
        
        // Show success message for adding/removing meals
        if (changeType === 'add') {
          toast.success("Meal added to plan");
        } else if (changeType === 'remove') {
          toast.success("Meal removed from plan");
        }
        
      } catch (error) {
        console.error('Error auto-saving meal plan:', error);
        toast.error("Failed to save changes");
      } finally {
        // Clear the saving state for affected meals
        setSavingMeals(prev => {
          const updated = { ...prev };
          affectedMeals.forEach(meal => {
            delete updated[`${meal.dateKey}-${meal.mealType}`];
          });
          return updated;
        });
      }
    }, 500); // 500ms delay before auto-saving
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
    const plannedMeals = currentMealPlan.filter(meal => meal.name);
    const totalCalories = plannedMeals.reduce((sum, meal) => sum + (parseInt(meal.calories) || 0), 0);
    
    const consumedCalories = plannedMeals
      .filter(meal => meal.completed === true)
      .reduce((sum, meal) => sum + (parseInt(meal.calories) || 0), 0);
    
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
    
    // Save completion status
    toggleMealCompletion(updatedMealPlan[currentMealIndex].type);
  };

  const toggleMealCompletion = async (mealType) => {
    const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
    if (mealIndex === -1) return;
    
    const currentCompleted = mealPlan[mealIndex].completed;
    const newCompleted = !currentCompleted;
    
    const updatedMealPlan = [...mealPlan];
    updatedMealPlan[mealIndex] = {
      ...updatedMealPlan[mealIndex],
      completed: newCompleted
    };
    setMealPlan(updatedMealPlan);
    
    setCompletedMeals(prev => ({
      ...prev,
      [mealType]: newCompleted
    }));
    
    updateCalorieCount(updatedMealPlan);
    
    try {
      await saveMealCompletion(mealType, newCompleted);
    } catch (error) {
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
      
      // Update the meal plan with the removed meal
      updateMealPlan(updatedMealPlan, 'remove', [{
        dateKey: getTodayDateString(),
        mealType
      }]);
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
        image: meal.image,
        id: meal.id
      };
      
      setMealPlan(updatedMealPlan);
      
      if (mealTypeIndex === currentMealIndex) {
        updateNextMealCard(updatedMealPlan[mealTypeIndex]);
      }
      
      updateCalorieCount(updatedMealPlan);
      
      // Update the meal plan with the new meal
      updateMealPlan(updatedMealPlan, 'add', [{
        dateKey: getTodayDateString(),
        mealType: selectedMealType
      }]);
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
  
  // Scroll to current day on load
  useEffect(() => {
    if (timelineRef.current) {
      const todayElement = timelineRef.current.querySelector('[data-today="true"]');
      if (todayElement) {
        todayElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [isDataReady]);

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
                  timelineRef={timelineRef}
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
                    savingMeals={savingMeals}
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
