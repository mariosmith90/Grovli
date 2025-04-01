"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from "@auth0/nextjs-auth0";
import { useAuth } from "../../contexts/AuthContext";
import { Coffee, Utensils, Apple, Moon, ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';
import DayTimelineSlider from '../../components/features/profile/daytimeline';
import MealTimeline from '../../components/features/profile/mealtimeline';
import NextMealCard from '../../components/features/profile/nextmeal';
import CalorieProgressBar from '../../components/features/profile/caloriebar';
import SavedMeals from '../../components/features/profile/savedmeals';
import ProfileHeaderSection from '../../components/features/profile/profileheader';
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

  // Reusable date formatter
  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  // Get auth context at the component level
  const auth = useAuth();
  const getAuthTokenFromContext = auth?.getAuthToken;
  
  // Use the API service for authenticated requests
  const { makeAuthenticatedRequest } = useApiService();

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
    // Verify user exists
    if (!user?.sub) {
      console.error("Cannot load meal completions - missing user.sub");
      return {};
    }
    
    // Get most up-to-date token (either from state or localStorage)
    const currentToken = accessToken || localStorage.getItem('accessToken');
    
    // Verify we have a token
    if (!currentToken) {
      console.error("Cannot load meal completions - missing accessToken");
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
    
    if (!accessToken) {
      console.error("Missing accessToken in fetchUserMealPlans");
      return;
    }

    try {
      console.log("Starting fetchUserMealPlans with token:", accessToken.substring(0, 10) + "...");
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
          'Authorization': `Bearer ${accessToken}`,
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

  // Fixed token retrieval without hooks inside callbacks
  useEffect(() => {
    async function getAndSetToken() {
      if (isAuthenticated && !isAuthLoading) {
        try {
          // Log the state for debugging
          console.log("Profile page auth state:", { 
            isAuthenticated, 
            user: user?.sub,
            hasUserToken: !!user?.accessToken
          });
          
          // Try each token source in order of preference
          let token = null;
          
          // 1. Direct from Auth0 user object (most reliable source)
          if (user?.accessToken) {
            console.log("Using token directly from Auth0 user object");
            token = user.accessToken;
          } 
          // 2. From auth context using the already retrieved function
          else if (getAuthTokenFromContext) {
            console.log("Attempting to get token from auth context");
            try {
              token = await getAuthTokenFromContext();
              console.log("Got token from context:", !!token);
            } catch (err) {
              console.error("Error getting token from context:", err);
            }
          }
          
          // 3. Try getIdTokenClaims if available
          if (!token && user && typeof user.getIdTokenClaims === 'function') {
            try {
              console.log("Trying getIdTokenClaims from user object");
              const claims = await user.getIdTokenClaims();
              if (claims && claims.__raw) {
                token = claims.__raw;
                console.log("Got token from claims");
              }
            } catch (err) {
              console.error("Error getting token claims:", err);
            }
          }
          
          // 4. From localStorage as fallback
          if (!token) {
            console.log("Falling back to localStorage token");
            token = localStorage.getItem('accessToken');
          }
          
          // 5. Special case for test user - use a hardcoded token for testing purposes
          if (!token && user?.sub === "auth0|67b82eb657e61f81cdfdd503") {
            console.log("Using special test user fallback token");
            // This is just a placeholder token that will be replaced by the backend
            // with a valid token for the test user
            token = "test_user_special_token";
          }
          
          // If we found a token, use it
          if (token) {
            console.log("Setting access token from valid source");
            
            setAccessToken(token);
            localStorage.setItem('accessToken', token);
            
            // Fetch meal plans once we have the token
            console.log("Fetching meal plans with token");
            await fetchUserMealPlans();
            loadDataForDate(selectedDate);
          } else {
            console.error("Failed to get access token from any source");
            // Try to redirect to login if we can't get a token
            setTimeout(() => {
              if (!localStorage.getItem('accessToken') && window.location.pathname === '/profile') {
                console.log("No token available, redirecting to login");
                window.location.href = '/api/auth/login?returnTo=/profile';
              }
            }, 2000);
          }
        } catch (error) {
          console.error("Error retrieving access token:", error);
        }
      }
    }
    
    getAndSetToken();
  }, [isAuthenticated, isAuthLoading, user, selectedDate, getAuthTokenFromContext]);

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