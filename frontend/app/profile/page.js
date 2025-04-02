"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { useAuth } from "../../contexts/AuthContext";
import { Coffee, Utensils, Apple, Moon, ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';
import DayTimelineSlider from '../../components/features/profile/timeline/daytimeline';
import MealTimeline from '../../components/features/profile/mealplan/mealtimeline';
import NextMealCard from '../../components/features/profile/timeline/nextmeal';
import CalorieProgressBar from '../../components/features/profile/common/caloriebar';
import SavedMeals from '../../components/features/profile/mealplan/savedmeals';
import ProfileHeaderSection from '../../components/features/profile/common/profileheader';
import AutoUpdatingComponent from '../../components/features/profile/mealplan/autoupdating';
import { useApiService } from '../../lib/api-service';

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
    id: null,
    completed: false
  };
  
  const [mealPlan, setMealPlan] = useState([
    { ...defaultMeal, type: 'breakfast', time: '8:00 AM' },
    { ...defaultMeal, type: 'lunch', time: '12:30 PM' },
    { ...defaultMeal, type: 'snack', time: '3:30 PM' },
    { ...defaultMeal, type: 'dinner', time: '7:00 PM' }
  ]);
  
  // Initialize the AutoUpdatingComponent
  const autoUpdater = AutoUpdatingComponent({
    user,
    activePlanId,
    setActivePlanId,
    mealPlan,
    setMealPlan,
    savingMeals,
    setSavingMeals,
    onAfterSave: () => loadMealCompletions(),
    defaultMeal
  });

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

  // Use getTodayDateString from autoUpdater
  const { getTodayDateString } = autoUpdater;

  // Get auth context at the component level
  const auth = useAuth();
  const getAuthTokenFromContext = auth?.getAuthToken;
  
  // Use the API service for authenticated requests
  const { makeAuthenticatedRequest } = useApiService();

  // Use the updateMealPlan function from autoUpdater
  const updateMealPlan = autoUpdater.updateMealPlan;

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
    // Verify user exists
    if (!user?.sub) {
      console.error("Cannot load meal completions - missing user.sub");
      return {};
    }
    
    // Get the most reliable token available
    let currentToken = accessToken;
    if (!currentToken) {
      // Try to get a token from various sources if we don't have one
      // 1. Try auth context
      if (getAuthTokenFromContext) {
        try {
          currentToken = await getAuthTokenFromContext();
        } catch (err) {
          console.error("Error getting token from context in loadMealCompletions:", err);
        }
      }
      
      // 2. Try window auth token
      if (!currentToken && typeof window !== 'undefined' && window.__auth0_token) {
        currentToken = window.__auth0_token;
      }
      
      // 3. Finally try localStorage
      if (!currentToken && typeof window !== 'undefined') {
        currentToken = localStorage.getItem('accessToken');
      }
      
      // Save token for future use if we found one
      if (currentToken) {
        setAccessToken(currentToken);
      }
    }
    
    // Verify we have a token
    if (!currentToken) {
      console.error("Cannot load meal completions - missing accessToken after all attempts");
      return {};
    }
    
    try {
      const today = getTodayDateString();
      console.log(`Loading meal completions for ${user.sub} on ${today}`);
      
      // Use direct fetch with explicit token to avoid any auth issues
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/user-profile/meal-completion/${user.sub}/${today}`, {
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch meal completions: ${response.status} ${response.statusText}`);
      }
      
      const completions = await response.json();
      console.log("Loaded meal completions:", completions);
      
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
    // Check for required auth data - exit early if missing
    if (!user?.sub) {
      console.error("Missing user.sub in fetchUserMealPlans");
      return;
    }
    
    // Get a token if we don't already have one
    let token = accessToken;
    if (!token) {
      console.log("No accessToken in fetchUserMealPlans, trying to get one");
      
      // Try from auth context
      if (getAuthTokenFromContext) {
        try {
          token = await getAuthTokenFromContext();
        } catch (err) {
          console.error("Error getting token from context in fetchUserMealPlans:", err);
        }
      }
      
      // Try from window.__auth0_token
      if (!token && typeof window !== 'undefined' && window.__auth0_token) {
        token = window.__auth0_token;
      }
      
      // Try from localStorage
      if (!token && typeof window !== 'undefined') {
        token = localStorage.getItem('accessToken');
      }
      
      // Save token if we found one
      if (token) {
        setAccessToken(token);
      } else {
        console.error("No token available for fetchUserMealPlans");
        return; // Exit if no token is available
      }
    }

    try {
      console.log("Starting fetchUserMealPlans with token available:", !!token);
      setIsLoadingPlans(true);
      setIsDataReady(false);
      
      // Load completions FIRST
      console.log("Loading meal completions for user:", user.sub);
      const completions = await loadMealCompletions();
      
      // Then load plans
      const userId = user.sub;
      console.log("Fetching meal plans for user:", userId);
      
      // Use direct fetch with explicit token to avoid any auth issues
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/api/user-plans/user/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch meal plans: ${response.status} ${response.statusText}`);
      }
      
      const plans = await response.json();
      console.log(`Retrieved ${plans.length} meal plans`);
      setUserPlans(plans);
      
      if (plans.length > 0) {
        const sortedPlans = [...plans].sort((a, b) => 
          new Date(b.updated_at) - new Date(a.updated_at)
        );
        console.log("Loading latest plan to calendar:", sortedPlans[0].id);
        await loadPlanToCalendar(sortedPlans[0], completions);
      } else {
        console.log("No meal plans found for user");
        setIsDataReady(true);  // Still mark data as ready even with no plans
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
        // Log the full response from the API including meal_name property
        console.log(`Full mealItem for ${mealType}:`, JSON.stringify(mealItem, null, 2));
        console.log(`Full mealDetails for ${mealType}:`, JSON.stringify(mealDetails, null, 2));
        
        // Use the direct title/name property from the API without complex fallbacks
        // This matches how planner page handles it
        const mealName = mealDetails.title || mealDetails.name;
        
        console.log(`Using direct meal name for ${mealType}:`, mealName);
        
        updatedMealPlan[mealIndex] = {
          ...updatedMealPlan[mealIndex],
          // Primary name property for UI display
          name: mealName,
          // Also keep title for compatibility
          title: mealName,
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
          // First, log the raw meal data to see what we're receiving from the API
          console.log("Raw dateMeals data:", JSON.stringify(dateMeals, null, 2));
          
          for (const mealItem of dateMeals) {
            const { mealType, meal, meal_name } = mealItem; // Extract meal_name directly from the API response
            const mealIndex = updatedMealPlan.findIndex(m => m.type === mealType);
            
            // Log the entire mealItem to see all available properties
            console.log(`Full mealItem for ${mealType}:`, JSON.stringify(mealItem, null, 2));
            
            if (mealIndex !== -1 && meal) {
              // Use the directly provided meal name without complex fallbacks
              const mealName = meal.title || meal.name || mealItem.meal_name;
              
              // Log it for debugging
              console.log(`Using direct meal name for ${mealType}:`, mealName);
              
              updatedMealPlan[mealIndex] = {
                ...updatedMealPlan[mealIndex],
                name: mealName,
                title: mealName,
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
    if (!user) return [];
    
    // Always refresh meal data when explicitly requesting it
    try {
      console.log(`Fetching saved meals for ${mealType}...`);
      setIsLoadingSavedMeals(true);
      
      // Use the API service which already handles authentication properly
      const data = await makeAuthenticatedRequest('/api/user-recipes/saved-recipes/');
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        console.log('No saved recipes data available');
        return [];
      }
      
      console.log(`Received saved recipes data:`, data);
      
      const categorizedMeals = { ...savedMeals };
      const addedMealNames = new Set();
  
      // Clear existing meals for this type to ensure we get fresh data
      categorizedMeals[mealType] = [];
      
      for (const plan of data) {
        if (!plan.recipes || !Array.isArray(plan.recipes)) {
          console.warn('Plan has no recipes array:', plan);
          continue;
        }
  
        for (const recipe of plan.recipes) {
          if (addedMealNames.has(recipe.title)) continue;
  
          const recipeMealType = (recipe.meal_type || '').toLowerCase();
          const category = ['breakfast', 'lunch', 'dinner', 'snack'].includes(recipeMealType) 
            ? recipeMealType : 'snack';
            
          if (category !== mealType) continue;
  
          console.log(`Fetching details for meal ${recipe.title} (${recipe.recipe_id})`);
          const mealDetails = await makeAuthenticatedRequest(`/mealplan/${recipe.recipe_id}`);
          console.log(`Meal details for ${recipe.title}:`, mealDetails);
  
          const formattedMeal = {
            id: recipe.recipe_id,
            name: mealDetails.title || recipe.title || "Unnamed Meal",
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
  
      console.log(`Setting saved meals for ${mealType}:`, categorizedMeals[mealType]);
      setSavedMeals(categorizedMeals);
      
      return categorizedMeals[mealType]; // Return the meals for the requested type
    } catch (error) {
      console.error('Error fetching saved meals:', error);
      toast.error("Failed to load saved meals");
      return []; // Return empty array on error
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
    try {
      // Use the toggleMealCompletion function from autoUpdater
      const newCompleted = autoUpdater.toggleMealCompletion(mealType);
      
      // Update the completedMeals state
      setCompletedMeals(prev => ({
        ...prev,
        [mealType]: newCompleted
      }));
      
      // Update calorie count
      updateCalorieCount(mealPlan);
      
      // Also save to the backend completion API
      await saveMealCompletion(mealType, newCompleted);
    } catch (error) {
      console.error('Failed to toggle meal completion:', error);
      toast.error('Failed to update meal completion status');
    }
  };

  const handleRemoveMeal = async (mealType) => {
    try {
      console.log(`Removing meal of type: ${mealType}`);
      
      // First update UI state while the meal is being removed
      setSelectedMealType(mealType);
      // Start loading indicator immediately
      setIsLoadingSavedMeals(true);
      
      // Use the removeMealFromView function from autoUpdater - this hits the API
      await autoUpdater.removeMealFromView(new Date(), mealType);

      // After removing, update the UI components that depend on the meal plan
      const updatedMealPlan = [...mealPlan];
      const mealIndex = updatedMealPlan.findIndex(meal => meal.type === mealType);
      
      // Update next meal if we removed the current meal
      if (mealIndex === currentMealIndex) {
        const { nextMealIndex } = updateCurrentAndNextMeals(updatedMealPlan);
        setCurrentMealIndex(nextMealIndex);
        updateNextMealCard(updatedMealPlan[nextMealIndex]);
      }
      
      // Update calorie counts
      updateCalorieCount(updatedMealPlan);
      
      try {
        // Immediately switch to saved meals view (with loading state)
        setActiveSection('savedMeals');
        
        // Fetch the saved meals for this meal type
        console.log(`Pre-loading saved meals for ${mealType}...`);
        const fetchedMeals = await fetchSavedMeals(mealType);
        console.log(`Fetched ${fetchedMeals?.length || 0} saved meals for ${mealType}`);
        
        // When loaded, check if we have any meals
        if (!fetchedMeals || fetchedMeals.length === 0) {
          console.log(`No saved ${mealType} meals found, showing empty state`);
          toast.info(`No saved ${mealType} meals available. Create new meals to add them.`);
        } else {
          console.log(`Found ${fetchedMeals.length} saved meals for ${mealType}`);
        }
      } catch (fetchError) {
        console.error(`Error fetching saved meals: ${fetchError.message}`);
        toast.error(`Couldn't load saved meals. Try again later.`);
        
        // On fetch error, go back to timeline
        setActiveSection('timeline');
      } finally {
        setIsLoadingSavedMeals(false);
      }
    } catch (error) {
      console.error('Error in handleRemoveMeal:', error);
      toast.error(`Error removing meal: ${error.message}`);
      // Make sure loading indicator is turned off on error
      setIsLoadingSavedMeals(false);
    }
  };

  const handleCreateNewMeals = () => router.push('/meals');
  const handleViewMealPlanner = () => router.push('/planner');
  
  const handleAddMeal = async (mealType) => {
    try {
      console.log(`Loading saved meals for ${mealType}...`);
      
      // Update UI state immediately
      setSelectedMealType(mealType);
      setIsLoadingSavedMeals(true);
      setActiveSection('savedMeals');
      
      // Fetch saved meals
      await fetchSavedMeals(mealType);
      
      // Check if we have meals to show
      if (!savedMeals[mealType] || savedMeals[mealType].length === 0) {
        toast.info(`No saved ${mealType} meals available. Create new meals to add them.`);
      }
    } catch (error) {
      console.error(`Error loading saved meals for ${mealType}:`, error);
      toast.error(`Couldn't load saved meals. Try again later.`);
    } finally {
      setIsLoadingSavedMeals(false);
    }
  };

  const handleSelectSavedMeal = (meal) => {
    // Use the addMealToPlan function from autoUpdater
    autoUpdater.addMealToPlan(meal, selectedMealType);
    
    // Manually update UI components that depend on the meal - will be done after autoUpdater finishes
    setTimeout(() => {
      // Find the meal in the updated plan
      const mealTypeIndex = mealPlan.findIndex(item => item.type === selectedMealType);
      
      if (mealTypeIndex !== -1) {
        // Update next meal card if this was the current meal
        if (mealTypeIndex === currentMealIndex) {
          updateNextMealCard(mealPlan[mealTypeIndex]);
        }
        
        // Update calorie counts
        updateCalorieCount(mealPlan);
      }
    }, 100);
    
    // Return to the timeline view
    setActiveSection('timeline');
  };

  // Token retrieval - simpler and more reliable
  useEffect(() => {
    async function getAndSetToken() {
      if (isAuthenticated && !isAuthLoading) {
        try {
          console.log("Profile page: Getting auth token");
          
          // 1. Try auth context first (most reliable)
          let token = null;
          if (getAuthTokenFromContext) {
            try {
              token = await getAuthTokenFromContext();
              console.log("Profile page: Got token from auth context:", !!token);
            } catch (err) {
              console.error("Error getting token from context:", err);
            }
          }
          
          // 2. Try to get token directly from Auth0
          if (!token && auth?.accessToken) {
            token = auth.accessToken;
            console.log("Profile page: Got token from auth object:", !!token);
          }
          
          // 3. Check window.__auth0_token which is set by our AuthContext
          if (!token && typeof window !== 'undefined' && window.__auth0_token) {
            token = window.__auth0_token;
            console.log("Profile page: Got token from window.__auth0_token");
          }
          
          // 4. Check localStorage as last resort
          if (!token) {
            token = localStorage.getItem('accessToken');
            console.log("Profile page: Got token from localStorage:", !!token);
          }
          
          // If we found a token, set it and proceed
          if (token) {
            console.log("Profile page: Setting access token");
            setAccessToken(token);
            localStorage.setItem('accessToken', token);
            
            // Fetch user data now that we have a token
            console.log("Profile page: Fetching meal plans with token");
            await fetchUserMealPlans();
            loadDataForDate(selectedDate);
          } else {
            console.error("Failed to get access token from any source");
            // Try to get a new token by redirecting to login
            setTimeout(() => {
              if (typeof window !== 'undefined' && 
                  !localStorage.getItem('accessToken') && 
                  window.location.pathname === '/profile') {
                console.log("No token available after 2s, redirecting to login");
                window.location.href = '/auth/login?returnTo=/profile';
              }
            }, 2000);
          }
        } catch (error) {
          console.error("Error retrieving access token:", error);
        }
      }
    }
    
    getAndSetToken();
  }, [isAuthenticated, isAuthLoading, auth, user, selectedDate, getAuthTokenFromContext]);

  // Load user settings effect - separate from token logic
  useEffect(() => {
    // Only run if we're authenticated and not loading
    if (!isAuthenticated || isAuthLoading) return;
    
    console.log("Loading user settings for profile page");
    
    // 1. First try localStorage settings
    const savedSettings = JSON.parse(localStorage.getItem('globalMealSettings') || '{}');
    if (Object.keys(savedSettings).length > 0) {
      console.log("Found settings in localStorage");
      setGlobalSettings(savedSettings);
      setCalorieData(prev => ({
        ...prev,
        target: savedSettings.calories || 2000
      }));
    }
    
    // 2. Then try to get settings from server
    if (user?.sub) {
      (async () => {
        try {
          console.log("Fetching user settings from server");
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          const response = await fetch(`${apiUrl}/user-settings/${user.sub}`);
          
          if (response.ok) {
            const serverSettings = await response.json();
            console.log("Received server settings:", serverSettings);
            setGlobalSettings(serverSettings);
            setCalorieData(prev => ({
              ...prev,
              target: serverSettings.calories || 2000
            }));
          }
        } catch (error) {
          console.error("Error fetching user settings:", error);
        }
      })();
    }
  }, [isAuthenticated, isAuthLoading, user]);
  
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading || !accessToken) return;
    
    const refreshMealPlans = () => {
      if (accessToken && user?.sub) {
        fetchUserMealPlans();
      }
    };
    
    const handleFocus = () => refreshMealPlans();
    window.addEventListener('focus', handleFocus);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && accessToken && user?.sub) {
        loadMealCompletions();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, isAuthLoading, accessToken, user]);

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

  // Helper for meal type icon
  const getMealTypeIcon = (type) => {
    const Icon = { breakfast: Coffee, lunch: Utensils, snack: Apple, dinner: Moon }[type];
    return Icon ? <Icon className="w-6 h-6 mr-2 text-teal-600" /> : null;
  };

  // Render sections based on loading state
  const renderContent = () => {
    if (isLoadingPlans) {
      return (
        <div className="flex justify-center items-center py-8">
          <div className="animate-pulse text-gray-500">Loading your meal plan...</div>
        </div>
      );
    }
    
    if (!isDataReady) {
      return null;
    }
    
    return (
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

        {/* Next Meal Section */}
        <section className="mb-6 bg-white p-4">
          <h2 className="text-2xl font-semibold mb-3 flex items-center">
            {getMealTypeIcon(nextMeal.type)}
            {nextMeal.type.charAt(0).toUpperCase() + nextMeal.type.slice(1)}
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
        
        {/* Timeline or Saved Meals Section */}
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
    );
  };

  return (
    <>
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 border-none w-full max-w-4xl flex-grow flex flex-col">
          <ProfileHeaderSection
            title="Today's Meals"
            onViewMealPlanner={handleViewMealPlanner}
          />
          
          {renderContent()}
        </div>
      </main>
    </>
  );
}