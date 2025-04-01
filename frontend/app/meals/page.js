"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useMealGeneration } from '../../contexts/MealGenerationContext';
import { MealPlanDisplay } from '../../components/ui/mealcard';
import ChatbotWindow from '../../components/features/meals/chatbot';
import SearchBox from '../../components/features/meals/searchbox';
import CuisineSelector from '../../components/features/meals/cuisineselector';
import MealTypeSelector from '../../components/features/meals/mealtypeselector';
import MealPlanGenerator from '../../components/features/meals/mealplangenerator';
import Header from '../../components/ui/header';

export default function Home() {
  const router = useRouter();
  const [preferences, setPreferences] = useState('');
  const [mealType, setMealType] = useState('Breakfast');
  const [numDays, setNumDays] = useState(1);
  const [mealPlan, setMealPlan] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderingPlanIngredients, setOrderingPlanIngredients] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const [showChatbot, setShowChatbot] = useState(false);
  const [mealPlanReady, setMealPlanReady] = useState(false);
  const [displayedMealType, setDisplayedMealType] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState('');
  
  // Use our centralized auth context
  const auth = useAuth();
  const user = auth?.user || null;
  const isLoading = auth?.isLoading !== false;
  const authIsPro = auth?.isPro === true;
  const userId = auth?.userId || null;
  const getAuthHeaders = auth?.getAuthHeaders || (async () => ({}));
  
  // Set the isPro state from the auth context
  useEffect(() => {
    if (authIsPro) {
      setIsPro(true);
    }
  }, [authIsPro]);

  const { 
    isGenerating, 
    setIsGenerating,
    mealGenerationComplete,
    setMealGenerationComplete,
    currentMealPlanId,
    setCurrentMealPlanId,
    setBackgroundTaskId,
    startTaskChecking,
    setHasViewedGeneratedMeals,
    resetMealGeneration
  } = useMealGeneration();

  const checkOnboardingStatus = async () => {
    if (!user) return false;
  
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/user-profile/check-onboarding/${user.sub}`);
  
      if (response.ok) {
        const data = await response.json();
        return data.onboarded;
      } else {
        console.error("Failed to fetch onboarding status:", response.status);
        return false;
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      return false;
    }
  };

  const [globalSettings, setGlobalSettings] = useState({
    calculationMode: 'auto',
    calories: 2400,
    carbs: 270,
    protein: 180,
    fat: 67,
    fiber: 34,
    sugar: 60,
    dietaryPhilosophy: '' 
  });

  const [calories, setCalories] = useState(globalSettings.calories);

  // Share mealPlan with window for global access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.mealPlan = mealPlan;
      return () => {
        window.mealPlan = undefined;
      };
    }
  }, [mealPlan]);

  // Simple polling to check meal plan status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Set global state
      window.mealLoading = isGenerating;
      
      // Create chatbot toggle function
      window.toggleChatbot = () => setShowChatbot(prev => !prev);
      
      // Poll for meal plan status
      let intervalId = null;
      
      if (isGenerating && currentMealPlanId) {
        console.log(`Polling for meal plan: ${currentMealPlanId}`);
        
        // Function to check meal status
        const checkMealStatus = async () => {
          try {
            if (!isGenerating || mealGenerationComplete) {
              if (intervalId) clearInterval(intervalId);
              return;
            }
            
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
            
            // Avoid "ea is not a function" error by ensuring ID is valid
            if (!currentMealPlanId || typeof currentMealPlanId !== 'string') {
              console.error("Invalid meal plan ID for status check:", currentMealPlanId);
              return;
            }
            
            let idToUse = currentMealPlanId;
            // DO NOT extract the numeric part - backend expects the full ID format
            // The meal plan ID format is type_cuisines_num1_num2_num3_num4_num5_num6_suffix
            // Keep the full ID for the API call
            console.log(`Using full meal plan ID for API call: ${idToUse}`);
            
            const response = await fetch(`${apiUrl}/mealplan/by_id/${idToUse}`);
            
            if (response.ok) {
              const data = await response.json();
              
              if (data && data.meal_plan && Array.isArray(data.meal_plan)) {
                console.log(`Meal plan loaded with ${data.meal_plan.length} meals`);
                
                // Update state
                setIsGenerating(false);
                setMealGenerationComplete(true);
                
                // Process meal plan
                let processedMealPlan = [...data.meal_plan];
                
                // Handle full day plans
                if (mealType === 'Full Day' && data.meal_plan.length >= 4) {
                  const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
                  processedMealPlan = data.meal_plan.map((meal, idx) => {
                    if (idx < 4) return { ...meal, meal_type: mealTypes[idx] };
                    return meal;
                  });
                }
                
                // Update UI
                setMealPlan(processedMealPlan);
                setDisplayedMealType(mealType);
                setShowChatbot(false);
                setHasViewedGeneratedMeals(true);
                
                // Dispatch event to notify other components
                if (typeof window !== 'undefined') {
                  const event = new CustomEvent('mealPlanReady', { 
                    detail: { mealPlanId: currentMealPlanId }
                  });
                  window.dispatchEvent(event);
                  window.mealPlanReady = true;
                }
                
                // Stop polling
                if (intervalId) clearInterval(intervalId);
              }
            }
          } catch (error) {
            console.error("Error checking meal plan status:", error);
            // Just continue polling
          }
        };
        
        // Check immediately
        checkMealStatus();
        
        // Then check every 5 seconds
        intervalId = setInterval(checkMealStatus, 5000);
      }
      
      return () => {
        if (intervalId) clearInterval(intervalId);
        window.mealLoading = undefined;
        window.toggleChatbot = undefined;
      };
    }
  }, [isGenerating, mealGenerationComplete, currentMealPlanId, mealType, setIsGenerating, setMealGenerationComplete, setHasViewedGeneratedMeals]);

  // Sync days selection with window
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.numDays !== undefined) {
        setNumDays(window.numDays);
      }
      
      const intervalId = setInterval(() => {
        if (window.numDays !== undefined && window.numDays !== numDays) {
          setNumDays(window.numDays);
        }
      }, 300);
      
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [numDays]);

  // Load saved inputs and settings
  useEffect(() => {
    // Clean up any global status flags on first load
    if (typeof window !== 'undefined') {
      // Clear all status tracking flags
      window._statusCheckInProgress = false;
      window._notificationPollingActive = false;
      window._mealPageCheckingNotification = false;
      
      // Force a reset of the meal generation state if needed
      if (window.forceResetOnLoad) {
        resetMealGeneration();
        window.forceResetOnLoad = false;
      }
    }
    
    const savedData = JSON.parse(localStorage.getItem("mealPlanInputs") || "{}");
    if (savedData && Object.keys(savedData).length > 0) {
      setPreferences(savedData.preferences || '');
      setMealType(savedData.mealType || 'Breakfast');
      setNumDays(savedData.numDays || 1);
      
      if (Array.isArray(savedData.mealPlan) && savedData.mealPlan.length > 0) {
        setMealPlan(savedData.mealPlan);
        
        if (savedData.displayedMealType) {
          setDisplayedMealType(savedData.displayedMealType);
        } else {
          setDisplayedMealType(savedData.mealType || 'Breakfast');
        }
      }
    }
    
    const savedSettings = JSON.parse(localStorage.getItem('globalMealSettings') || '{}');
    if (Object.keys(savedSettings).length > 0) {
      setGlobalSettings(prevSettings => ({
        ...prevSettings,
        ...savedSettings
      }));
      setCalories(savedSettings.calories || 2400);
    }
    
    // Load user settings from server if logged in
    if (user && user.sub) {
      const fetchUserSettings = async () => {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          const response = await fetch(`${apiUrl}/user-settings/${user.sub}`);
          
          if (response.ok) {
            const serverSettings = await response.json();
            console.log("Loaded server settings on meal plan page:", serverSettings);
            setGlobalSettings(prevSettings => ({
              ...prevSettings,
              ...serverSettings
            }));
            setCalories(serverSettings.calories || 2400);
            localStorage.setItem('globalMealSettings', JSON.stringify(serverSettings));
          }
        } catch (error) {
          console.error("Error fetching user settings:", error);
        }
      };
      
      fetchUserSettings();
    }
  }, [user]);
  
  // Save meal plan inputs to localStorage
  useEffect(() => {
    const mealPlanToStore = Array.isArray(mealPlan) ? mealPlan : [];
    
    localStorage.setItem(
      "mealPlanInputs",
      JSON.stringify({
        preferences,
        mealType,
        numDays,
        mealPlan: mealPlanToStore,
        displayedMealType
      })
    );
  }, [preferences, mealType, numDays, mealPlan, displayedMealType]);

  // Simplified Pro status checking
  useEffect(() => {
    // Check for special user with highest priority
    if (authIsPro || userId === "auth0|67b82eb657e61f81cdfdd503" || 
        (typeof window !== 'undefined' && (
          window.specialProUser === true || 
          localStorage.getItem('userIsPro') === 'true'
        ))) {
      setIsPro(true);
      
      // Special user ID handling
      if (userId === "auth0|67b82eb657e61f81cdfdd503" && typeof window !== 'undefined') {
        window.specialProUser = true;
        localStorage.setItem('userIsPro', 'true');
      }
    }
    
    // Apply meal type restriction if needed
    if (!isPro && mealType === 'Full Day') {
      setMealType('Breakfast');
    }
  }, [isPro, mealType, userId, authIsPro]);

  // Handle meal selection for saving recipes
  const handleMealSelection = (id) => {
    setSelectedRecipes(prevSelected => {
      if (prevSelected.includes(id)) {
        return prevSelected.filter(recipeId => recipeId !== id);
      } else {
        return [...prevSelected, id];
      }
    });
  };

  // Use the MealPlanGenerator as a custom hook
  const { generateMealPlan: mealPlanGenerator } = MealPlanGenerator({
    preferences,
    mealType,
    numDays,
    globalSettings,
    isPro,
    getAuthHeaders,
    onError: (errorMessage) => setError(errorMessage),
    onProcessingStarted: () => {
      setSelectedRecipes([]);
      setShowChatbot(true);
      setMealPlanReady(false);
      setMealPlan([]);
      setOrderingPlanIngredients(false);
    },
    showChatbot
  });
  
  // Main function to generate a meal plan - memoized to avoid recreation on every render
  const fetchMealPlan = useCallback(async () => {
    // Enforce Pro restriction - rely on state from the useEffect that runs earlier
    if (!isPro && mealType === 'Full Day') {
      setMealType('Breakfast');
      return;
    }
  
    // Reset previous states
    resetMealGeneration();
    setError('');
    setLoading(true);
    setHasViewedGeneratedMeals(false);
    
    try {
      // Use the generated meal plan function
      const result = await mealPlanGenerator();
      
      // Handle the result based on whether it's immediate or background processing
      if (result?.immediate && result.mealPlan) {
        // Process meal plan data
        let processedMealPlan = [...result.mealPlan];
        
        // Ensure all meals are included, especially for Full Day
        if (mealType === 'Full Day' && result.mealPlan.length >= 4) {
          const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
          
          // Assign meal types based on index for the first 4 meals
          processedMealPlan = result.mealPlan.map((meal, idx) => {
            if (idx < 4) return { ...meal, meal_type: mealTypes[idx] };
            return meal;
          });
        }
        
        // Update UI
        setMealPlan(processedMealPlan);
        setDisplayedMealType(mealType);
        setShowChatbot(false);
        setIsGenerating(false);
        setMealGenerationComplete(true);
        setHasViewedGeneratedMeals(true);
      } else if (result?.error) {
        setShowChatbot(false);
        setIsGenerating(false);
      }
    } catch (error) {
      console.error('Error in fetchMealPlan:', error);
      setError(`Error: ${error.message}`);
      setShowChatbot(false);
      setIsGenerating(false);
    } finally {
      setLoading(false);
    }
  }, [
    isPro, 
    mealType, 
    resetMealGeneration, 
    setError, 
    setLoading, 
    setHasViewedGeneratedMeals,
    mealPlanGenerator, 
    setMealPlan, 
    setDisplayedMealType, 
    setShowChatbot,
    setIsGenerating, 
    setMealGenerationComplete
  ]);

  // Share the meal generation function with the global window object
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.generateMeals = fetchMealPlan;
      return () => {
        window.generateMeals = undefined;
      };
    }
  }, [fetchMealPlan]);

  // Handle chatbot completion - fetch meal plan if ready
  const handleChatComplete = async () => {
    setShowChatbot(false);
    
    if (mealPlanReady && currentMealPlanId && (!mealPlan || !mealPlan.length)) {
      try {
        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        
        // Fetch the meal plan - we know it's ready because the backend notified us
        // that both meal data and all images are ready
        console.log("Backend notification indicates meal plan is fully ready, fetching plan:", currentMealPlanId);
        
        // We need to use the full ID for the API call, not just the numeric part
        const mealPlanApiId = currentMealPlanId;
        console.log(`Using full meal plan ID for API call: ${mealPlanApiId}`);
        
        // CRITICAL: Store this ID in localStorage to ensure it's available
        // for other components and page reloads
        if (typeof window !== 'undefined') {
          console.log(`Storing currentMealPlanId in localStorage: ${currentMealPlanId}`);
          localStorage.setItem('currentMealPlanId', currentMealPlanId);
        }
        
        const fullUrl = `${apiUrl}/mealplan/by_id/${mealPlanApiId}`;
        console.log(`Making API request to: ${fullUrl}`);
        const response = await fetch(fullUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        let data = await response.json();
        
        // Validate the meal plan data
        if (data && data.meal_plan && Array.isArray(data.meal_plan)) {
          console.log("Chat complete: Received meal plan with", data.meal_plan.length, "meals");
          
          // Additional validation for Full Day plans
          if (mealType === 'Full Day' && data.meal_plan.length < 4) {
            console.warn("Expected 4 meals for Full Day but received:", data.meal_plan.length);
            // This should not happen if the backend correctly implements the all_meals_ready flag,
            // but we leave this warning for debugging purposes
          }
          
          // For Full Day plans, ensure all 4 meal types are assigned
          if (mealType === 'Full Day' && data.meal_plan.length > 0) {
            const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
            
            // Check if we have distinct meal types or need to assign them
            const existingTypes = new Set(data.meal_plan.map(meal => meal.meal_type));
            if (existingTypes.size < 4 || existingTypes.has('Full Day')) {
              console.log("Assigning specific meal types to meals");
              
              // Assign meal types based on index
              data.meal_plan = data.meal_plan.map((meal, idx) => {
                if (idx < mealTypes.length) {
                  return {
                    ...meal,
                    meal_type: mealTypes[idx]
                  };
                }
                return meal;
              });
            }
          }
          
          setMealPlan(data.meal_plan);
          setDisplayedMealType(mealType);
          setIsGenerating(false);
          setMealGenerationComplete(true);
          setHasViewedGeneratedMeals(true);
        } else {
          throw new Error("No meal plan data found");
        }
      } catch (error) {
        console.error("Error fetching ready meal plan:", error);
        setError("Could not retrieve your meal plan. Please try again.");
        setIsGenerating(false);
      } finally {
        setLoading(false);
      }
    }
  };

  // Load user profile data
  const loadUserProfileData = async () => {
    if (!user) return;
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const profileResponse = await fetch(`${apiUrl}/user-profile/${user.sub}`);
      
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        
        if (profileData.found) {
          const userProfile = profileData.profile;
          console.log("Found user profile:", userProfile);
          
          if (userProfile.dietary_preferences && userProfile.dietary_preferences.length > 0) {
            setPreferences(userProfile.dietary_preferences.join(" "));
          }
          
          if (userProfile.meal_plan_preference) {
            const mealTypeMapping = {
              'breakfast': 'Breakfast',
              'lunch': 'Lunch',
              'dinner': 'Dinner',
              'snacks': 'Snack',
              'full_day': 'Full Day'
            };
            
            const mappedMealType = mealTypeMapping[userProfile.meal_plan_preference];
            
            if (mappedMealType === 'Full Day' && !isPro) {
              setMealType('Breakfast');
            } else {
              setMealType(mappedMealType || 'Breakfast');
            }
          }
          
          setNumDays(1);
          
          localStorage.setItem(
            "mealPlanInputs",
            JSON.stringify({
              preferences: userProfile.dietary_preferences.join(" "),
              mealType: mealType,
              numDays: numDays,
              mealPlan: [],
              displayedMealType: ""
            })
          );
        }
      }
    } catch (error) {
      console.error("Error loading user profile data:", error);
    }
  };

  // Handle URL parameters and load meal plan if needed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const showMealCards = params.get('showMealCards');
      const urlMealPlanId = params.get('mealPlanId'); // Check for ID in URL parameters
      
      console.log('URL check - showMealCards param:', showMealCards);
      console.log('URL check - mealPlanId param:', urlMealPlanId);
      console.log('Current meal generation state:', {
        mealGenerationComplete,
        currentMealPlanId,
        hasMealPlan: Array.isArray(mealPlan) && mealPlan.length > 0
      });
      
      // Always mark as viewed when parameter is present, even if not yet complete
      if (showMealCards === 'true') {
        console.log('[Meals Page] showMealCards=true parameter detected, loading meal plan');
        
        // First check URL parameter, then localStorage, then context
        const localMealPlanId = localStorage.getItem('currentMealPlanId');
        // URL parameter takes highest priority
        const mealPlanIdToUse = urlMealPlanId || currentMealPlanId || localMealPlanId;
        
        console.log(`[Meals Page] Using meal plan ID: ${mealPlanIdToUse || 'None'}`);
        
        // Set mealGenerationComplete to true if we're explicitly showing meal cards
        if (!mealGenerationComplete) {
          setMealGenerationComplete(true);
        }
        
        // If we have a stored mealPlanId, load that meal plan
        if (mealPlanIdToUse && (!mealPlan || mealPlan.length === 0)) {
          const fetchMealPlanById = async () => {
            try {
              setLoading(true);
              const apiUrl = process.env.NEXT_PUBLIC_API_URL;
              
              // Check if this is a test meal plan ID from manual override
              if (typeof mealPlanIdToUse === 'string' && 
                  mealPlanIdToUse.startsWith('manual_test_mealplan_')) {
                console.log('Detected test meal plan ID - using sample data instead of API call');
                
                // Create sample meal plan data instead of API call
                const sampleMeal = {
                  id: "sample_1",
                  title: "Sample Test Meal",
                  meal_type: mealType,
                  description: "This is a sample meal for testing",
                  imageUrl: "/images/salmon.jpg",
                  nutrition: {
                    calories: 500,
                    protein: 30,
                    carbs: 40,
                    fat: 20
                  },
                  ingredients: [
                    "4 oz protein", 
                    "1 cup vegetables",
                    "2 tbsp olive oil"
                  ],
                  instructions: "This is a sample meal created when you manually force the meal plan ready state."
                };
                
                // For full day, create multiple meals
                let meals = [sampleMeal];
                if (mealType === 'Full Day') {
                  const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
                  meals = mealTypes.map((type, idx) => ({
                    ...sampleMeal,
                    id: `sample_${idx + 1}`,
                    title: `Sample ${type} Meal`,
                    meal_type: type
                  }));
                }
                
                // Set meal plan with sample data
                setMealPlan(meals);
                setDisplayedMealType(mealType);
                setShowChatbot(false);
                setHasViewedGeneratedMeals(true);
                setLoading(false);
                return; // Skip API call
              }
              
              // Normal API call for real meal plans
              // The meal plan ID format is type_cuisines_num1_num2_num3_num4_num5_num6_suffix
              // For the backend API, we should NOT extract just the numeric part - use the whole ID
              console.log(`Using full meal plan ID for API call: ${mealPlanIdToUse}`);
              
              // For real API calls, we need to use the full ID
              const mealPlanApiId = mealPlanIdToUse;
              
              console.log(`Fetching meal plan with ID: ${mealPlanApiId}`);
              // Based on backend code, there's no /api/ prefix for the mealplan endpoint
              const fullUrl = `${apiUrl}/mealplan/by_id/${mealPlanApiId}`;
              console.log(`Making API request to: ${fullUrl}`);
              const response = await fetch(fullUrl);
              
              if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
              }
              
              const data = await response.json();
              
              // Check if we received the expected number of meals for Full Day plans
              if (mealType === 'Full Day' && data && data.meal_plan && 
                  Array.isArray(data.meal_plan) && data.meal_plan.length < 4) {
                
                console.log("Warning: Received fewer than 4 meals for Full Day plan");
                console.log(`Only received ${data.meal_plan.length} of 4 expected meals`);
                
                // This should not happen if the backend correctly implements the all_meals_ready flag,
                // which should only be set to true once all meals and images are ready.
                // But we keep this warning for debugging purposes.
                
                // We don't need to retry fetching here since the backend notification system
                // should already guarantee all meals are ready before we get the notification.
              }
              
              // If not a Full Day plan or we already have all the meals, just use the original data
              if (data && data.meal_plan && Array.isArray(data.meal_plan)) {
                console.log("Fetched meal plan by ID, received meals:", data.meal_plan.length);
                console.log("All meals and images are now fully loaded and ready to display!");
                
                // For Full Day plans, ensure all 4 meal types are assigned
                if (mealType === 'Full Day' && data.meal_plan.length > 0) {
                  const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
                  
                  // Check if we have distinct meal types or need to assign them
                  const existingTypes = new Set(data.meal_plan.map(meal => meal.meal_type));
                  if (existingTypes.size < 4 || existingTypes.has('Full Day')) {
                    console.log("Assigning specific meal types to meals");
                    
                    // Assign meal types based on index
                    data.meal_plan = data.meal_plan.map((meal, idx) => {
                      if (idx < mealTypes.length) {
                        return {
                          ...meal,
                          meal_type: mealTypes[idx]
                        };
                      }
                      return meal;
                    });
                  }
                }
                
                setMealPlan(data.meal_plan);
                setDisplayedMealType(mealType);
                setShowChatbot(false);
                setHasViewedGeneratedMeals(true);
              } else {
                throw new Error("No meal plan data found");
              }
            } catch (error) {
              console.error("Error fetching meal plan:", error);
              setError("Could not retrieve your meal plan. Please try again.");
            } finally {
              setLoading(false);
            }
          };
          
          fetchMealPlanById();
        } else {
          // Use local storage data if available
          const savedData = JSON.parse(localStorage.getItem("mealPlanInputs") || "{}");
          if (Array.isArray(savedData?.mealPlan) && savedData.mealPlan.length > 0) {
            setMealPlan(savedData.mealPlan);
            setDisplayedMealType(savedData.displayedMealType || savedData.mealType);
            setShowChatbot(false);
            setHasViewedGeneratedMeals(true);
          } else if ((typeof currentMealPlanId === 'string' && 
                    currentMealPlanId.startsWith('manual_test_mealplan_')) ||
                   (typeof localMealPlanId === 'string' && 
                    localMealPlanId.startsWith('manual_test_mealplan_'))) {
            // Handle test meal plan ID when no data is available
            console.log('Creating test meal data for manual test meal plan');
            
            // Try to get sample data from window first
            if (typeof window !== 'undefined' && 
                Array.isArray(window.mealPlan) && 
                window.mealPlan.length > 0) {
              console.log('Using sample meal plan from window:', window.mealPlan);
              setMealPlan(window.mealPlan);
              setDisplayedMealType(mealType);
              setHasViewedGeneratedMeals(true);
            } else {
              // Create new sample data
              console.log('Creating new sample meal plan data');
              const sampleMeal = {
                id: "sample_" + Date.now(),
                title: "Sample Test Meal",
                meal_type: mealType,
                description: "This is a sample meal for testing",
                imageUrl: "/images/salmon.jpg",
                nutrition: {
                  calories: 500,
                  protein: 30,
                  carbs: 40,
                  fat: 20
                },
                ingredients: ["4 oz protein", "1 cup vegetables", "2 tbsp olive oil"],
                instructions: "This is a sample meal created when you manually force the meal plan ready state."
              };
              
              // Set the meal plan data
              setMealPlan([sampleMeal]);
              setDisplayedMealType(mealType);
              setHasViewedGeneratedMeals(true);
              
              // Store in window as well for consistency
              if (typeof window !== 'undefined') {
                window.mealPlan = [sampleMeal];
              }
            }
          }
        }
      }
      
      // Clean up the URL after we've processed the parameter
      if (showMealCards) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [currentMealPlanId, mealGenerationComplete, mealType]);

  // Check onboarding status only - auth is handled by the context
  useEffect(() => {
    if (!isLoading && user) {
      checkOnboardingStatus().then((onboardingComplete) => {
        if (!onboardingComplete) {
          console.log("User has not completed onboarding, redirecting...");
          router.push('/onboarding');
        } else {
          // Just load profile data - subscription status is handled by auth context
          loadUserProfileData();
        }
      });
    }
  }, [user, isLoading]);

  // Check meal plan status when component mounts and when certain states change
  useEffect(() => {
    // Only run when user is logged in and we're generating a meal plan
    if (userId && isGenerating && !mealGenerationComplete) {
      // Use a single reference to track if this instance has already processed a notification
      const notificationProcessedRef = { current: false };
      
      const checkMealPlanStatus = async () => {
        // Skip if we've already processed a notification or if we're no longer generating
        if (notificationProcessedRef.current || !isGenerating || mealGenerationComplete) {
          return false;
        }

        try {
          // Check if the context is already handling notifications
          if (typeof window !== 'undefined' && window._notificationPollingActive) {
            console.log("Skipping meal page notification check - context is already polling");
            return false;
          }
          
          // Use a dedicated flag to prevent concurrent checks from this page
          if (typeof window !== 'undefined') {
            if (window._mealPageCheckingNotification) {
              console.log("Skipping duplicate meal page notification check");
              return false;
            }
            window._mealPageCheckingNotification = true;
          }
          
          try {
            // Only check if we haven't checked recently
            let canCheck = true;
            if (typeof window !== 'undefined') {
              // Implement a much longer cooldown period of 3 minutes for get_latest_session
              const lastSessionCheck = window._lastSessionCheck || 0;
              const now = Date.now();
              
              if (now - lastSessionCheck < 180000) { // 3 minutes (increased from 60 seconds)
                console.log('Skipping session check - checked too recently');
                canCheck = false;
              } else {
                // Only update the timestamp if we're actually proceeding with the check
                window._lastSessionCheck = now;
                console.log('Setting last session check time');
              }
            }
            
            if (!canCheck) {
              return false;
            }
            
            // Check with the backend directly to see if the meal plan is ready
            // This is more reliable than the webhook system that might have missed a notification
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
            const response = await fetch(`${apiUrl}/mealplan/get_latest_session`, {
              headers: { 'user-id': user.sub }
            });
            
            if (response.ok) {
              const data = await response.json();
              
              // Check if the response was throttled - if so, handle gracefully
              if (data.throttled) {
                console.log('Session check was throttled, will try again later');
                if (typeof window !== 'undefined') {
                  window._mealPageCheckingNotification = false;
                }
                return false;
              }
              
              // Check both meal_plan_ready AND the all_meals_ready flag to ensure images are also generated
              if (data.meal_plan_ready && data.meal_plan_id && data.all_meals_ready) {
                // Mark that we've processed a notification to prevent duplicates
                notificationProcessedRef.current = true;
                
                console.log("Found completely ready meal plan with all images:", data.meal_plan_id);
                setMealGenerationComplete(true);
                setCurrentMealPlanId(data.meal_plan_id);
                setIsGenerating(false);
                setMealPlanReady(true);
                
                if (showChatbot) {
                  setShowChatbot(false);
                }
                
                // Always dispatch the event when a meal plan is confirmed ready
                if (typeof window !== 'undefined') {
                  console.log("🚀 Dispatching mealPlanReady event for meal plan:", data.meal_plan_id);
                  
                  // Update global state variables directly
                  window.mealLoading = false;
                  window.mealPlanReady = true;
                  
                  // Create event with detailed payload for better debugging
                  const event = new CustomEvent('mealPlanReady', { 
                    detail: { 
                      mealPlanId: data.meal_plan_id,
                      timestamp: Date.now(),
                      source: 'meals_page_check',
                      mealType: mealType,
                      numDays: numDays
                    }
                  });
                  
                  // Dispatch event multiple times with delays to ensure it's received
                  console.log("🚀 Dispatching mealPlanReady event with payload:", event.detail);
                  window.dispatchEvent(event);
                  
                  // Update localStorage to ensure data persistence
                  localStorage.setItem('currentMealPlanId', data.meal_plan_id);
                  localStorage.setItem('hasViewedGeneratedMeals', 'false');
                  
                  // Dispatch again after a short delay as a backup
                  setTimeout(() => {
                    console.log("⏱️ Re-dispatching mealPlanReady event as backup");
                    window.dispatchEvent(event);
                  }, 1000);
                }
                
                console.log("✅ Meal plan is fully ready with all images generated successfully!");
                return true;
              } else if (data.meal_plan_ready && !data.all_meals_ready) {
                // Meals are ready but images are still processing
                console.log("⏱️ Meal data is ready but still waiting for images to be generated...");
                if (typeof window !== 'undefined') {
                  window.imagesGenerating = true;
                }
                return false;
              } else if (data.meal_plan_processing) {
                console.log("⏳ Meal plan still generating, waiting for backend notification...");
                return false;
              }
            }
            return false;
          } catch (error) {
            console.error("Error checking meal plan status:", error);
            return false;
          } finally {
            // Always clear the checking flag when we're done
            if (typeof window !== 'undefined') {
              window._mealPageCheckingNotification = false;
            }
          }
        } catch (outerError) {
          console.error("Outer error in meal status check:", outerError);
          if (typeof window !== 'undefined') {
            window._mealPageCheckingNotification = false;
          }
          return false;
        }
      };
      
      // Check once when this effect first runs
      checkMealPlanStatus();
      
      // Set up a single timeout for a retry, much more efficient than an interval
      // Add a variable to track if a check is scheduled to avoid multiple timeouts
      if (typeof window !== 'undefined') {
        // Clear any existing timeout to prevent stacking
        if (window._mealPageCheckTimeout) {
          clearTimeout(window._mealPageCheckTimeout);
        }
        
        // Use a much longer timeout (2 minutes) to prevent server overload
        window._mealPageCheckTimeout = setTimeout(() => {
          // Clear the reference
          window._mealPageCheckTimeout = null;
          // Only check if we haven't processed yet and still generating
          if (!notificationProcessedRef.current && isGenerating && !mealGenerationComplete) {
            checkMealPlanStatus();
          }
        }, 120000); // Only check again after 2 minutes if we're still waiting
      } else {
        // Fallback for server-side rendering
        const timeoutId = setTimeout(() => {
          if (!notificationProcessedRef.current && isGenerating && !mealGenerationComplete) {
            checkMealPlanStatus();
          }
        }, 30000);
      }
      
      return () => {
        // If using window timeout, clean that up
        if (typeof window !== 'undefined') {
          if (window._mealPageCheckTimeout) {
            clearTimeout(window._mealPageCheckTimeout);
            window._mealPageCheckTimeout = null;
          }
          window._mealPageCheckingNotification = false;
        } else if (typeof timeoutId !== 'undefined') {
          // Clean up SSR fallback timeout
          clearTimeout(timeoutId);
        }
      };
    }
  }, [user, isGenerating, mealGenerationComplete, showChatbot, setMealGenerationComplete, setCurrentMealPlanId, setIsGenerating]);

  // Save selected recipes to user's profile
  const saveSelectedRecipes = async () => {
    if (!user) {
      router.push("/auth/login?returnTo=/dashboard");
      return;
    }

    if (!Array.isArray(mealPlan) || mealPlan.length === 0) {
      alert("No meal plan available.");
      return;
    }

    const selectedMeals = mealPlan.filter((meal) => selectedRecipes.includes(meal.id));
    if (selectedMeals.length === 0) {
      alert("Please select at least one recipe to save.");
      return;
    }

    try {
      // Use auth context to get headers
      const headers = await getAuthHeaders();
      headers["Content-Type"] = "application/json";
      
      // No need to check for token separately - our auth context handles that

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-recipes/saved-recipes/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipes: selectedMeals,
          plan_name: `Meal Plan - ${preferences || "Custom"}`,
        }),
      });

      if (response.status === 401) {
        alert("Session expired. Please log in again.");
        router.push("/auth/login?returnTo=/dashboard");
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "API request failed");
      }

      alert("Your recipes have been saved successfully!");
      setSelectedRecipes([]);
    } catch (error) {
      console.error("❌ Error saving recipes:", error);
      setError("Failed to save recipes. Please try again later.");
    }
  };

  // Share saveSelectedRecipes with window for global access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.saveSelectedRecipes = saveSelectedRecipes;
      return () => {
        window.saveSelectedRecipes = undefined;
      };
    }
  }, [saveSelectedRecipes]);

  // Share selectedRecipes with window for global access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.selectedRecipes = selectedRecipes;
      window.setSelectedRecipes = setSelectedRecipes;
      return () => {
        window.selectedRecipes = undefined;
        window.setSelectedRecipes = undefined;
      };
    }
  }, [selectedRecipes]);

  const toggleChatbot = () => {
    setShowChatbot(prev => !prev);
  };

  const handleOrderPlanIngredients = async () => {
    if (!Array.isArray(mealPlan) || mealPlan.length === 0) {
      setError("No meal plan available to extract ingredients.");
      return;
    }

    try {
      setError("");
      setOrderingPlanIngredients(true);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/shopping_list/create_shopping_list/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          meal_plan: JSON.stringify(mealPlan),
          list_name: `Meal Plan - ${preferences}`
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to create shopping list.");
      }

      const urlToOpen = data.redirect_url || data.shopping_list?.url;
      if (urlToOpen) {
        window.open(urlToOpen, "_blank", "noopener,noreferrer");
      } else {
        console.error("No URL found in API response.");
        throw new Error("No shopping list URL found.");
      }
    } catch (error) {
      console.error("Error:", error);
      setError(error.message);
    } finally {
      setOrderingPlanIngredients(false);
    }    
  };

  // Share handleOrderIngredientsGlobal with window for global access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.handleOrderIngredientsGlobal = handleOrderPlanIngredients;
      return () => {
        window.handleOrderIngredientsGlobal = undefined;
      };
    }
  }, [handleOrderPlanIngredients]);

  // No need to load meal algorithm separately since we're using the globalSettings

  return ( 
    <>
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[3rem] pb-[5rem]">
        <Header toggleChatbot={toggleChatbot} />
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 border-none w-full max-w-4xl flex-grow flex flex-col">
          <div className="flex justify-between items-center mb-6">
            {/* Your header content could go here */}
          </div>
  
          {/* Insert the modern search box here */}
          <div className="mb-8">
            <SearchBox 
              placeholder="Search meals..." 
              onSearch={(query) => {
                console.log("Search query:", query);
                // Update state or call backend search API later
              }} 
            />
          </div>
  
          <CuisineSelector 
            selectedCuisines={preferences} 
            onSelect={(cuisine, updateFn) => {
              setSelectedCuisine(cuisine);
              setPreferences(updateFn);
            }} 
          />
            
          <MealTypeSelector
            selectedMealType={mealType}
            onSelect={setMealType}
            isPro={isPro}
            onUpgradeClick={() => window.location.href = 'https://buy.stripe.com/aEU7tX2yi6YRe9W3cg'}
          />
  
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              <span className="font-bold">Selected: {numDays} {numDays === 1 ? 'Day' : 'Days'}</span>
              {numDays > 1 && !isPro && (
                <span className="ml-2 text-orange-600">
                  Days over 1 is a <strong>Pro feature</strong>
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Adjust days using the menu button in the navbar
            </p>
          </div>
  
          {error && <p style={{ color: 'red' }}>{error}</p>}
  
          {!isPro && (
            <button
              onClick={() => window.location.href = 'https://buy.stripe.com/aEU7tX2yi6YRe9W3cg'}
              className="w-full py-2 px-4 mb-4 text-white bg-teal-600 rounded-lg hover:bg-teal-900 transition-colors text-lg font-medium"
            >
              Upgrade Now
            </button>
          )}
        </div>
        
        {Array.isArray(mealPlan) && mealPlan.length > 0 && !showChatbot && (
          <MealPlanDisplay
            mealPlan={mealPlan}
            mealType={displayedMealType}
            numDays={numDays}
            handleMealSelection={handleMealSelection}
            selectedRecipes={selectedRecipes}
            saveSelectedRecipes={saveSelectedRecipes}
            handleOrderPlanIngredients={handleOrderPlanIngredients}
            loading={loading}
            orderingPlanIngredients={orderingPlanIngredients}
            showChatbot={showChatbot}
            onReturnToInput={() => {
              // Instead of just clearing the meal plan, properly reset the state
              // This makes sure we can go back to the meal selection screen
              setMealPlan([]);
              resetMealGeneration();
              setMealGenerationComplete(false);
              localStorage.removeItem('mealPlanInputs');
              window.history.replaceState({}, document.title, '/meals'); // Clear URL params
            }}
          />
        )}
        
        {showChatbot && (
          <ChatbotWindow
            user={user}
            preferences={preferences}
            mealType={mealType}
            isVisible={showChatbot}
            onClose={() => {
              setShowChatbot(false);
              if (mealGenerationComplete && currentMealPlanId) {
                handleChatComplete();
              }
            }}
            onChatComplete={handleChatComplete}
            onMealPlanReady={() => setMealPlanReady(true)}
            mealPlanReady={mealPlanReady}
          />
        )}
      </main>
    </>
  );
}