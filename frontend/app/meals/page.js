"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useApiService } from '../../lib/api-service';
// Use our new Zustand store instead of the context
import { useMealStore } from '../../lib/stores/mealStore';
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
  // API service with token refresh support
  const { makeAuthenticatedRequest } = useApiService();
  
  // Set the isPro state from the auth context
  useEffect(() => {
    if (authIsPro) {
      setIsPro(true);
    }
  }, [authIsPro]);

  // Use the new Zustand store for state management
  const { 
    isGenerating, 
    setIsGenerating,
    mealGenerationComplete,
    setMealGenerationComplete,
    currentMealPlanId,
    setCurrentMealPlanId,
    mealPlan: storeMealPlan,
    setMealPlan: setStoreMealPlan,
    hasViewedGeneratedMeals,
    setHasViewedGeneratedMeals,
    displayedMealType: storeDisplayedMealType,
    setDisplayedMealType: setStoreDisplayedMealType,
    resetMealGeneration,
    updateGlobalState,
    notifyMealPlanReady
  } = useMealStore();
  
  // Get additional actions needed for proper functionality
  const markStoreHydrated = useMealStore(state => state.actions?.markHydrated) || (() => {});
  const viewGeneratedMeals = useMealStore(state => state.viewGeneratedMeals) || (() => true);

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

  // Set up global chatbot toggle function
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Create chatbot toggle function only
      window.toggleChatbot = () => setShowChatbot(prev => !prev);
      
      return () => {
        // Clean up when component unmounts
        delete window.toggleChatbot;
      };
    }
  }, []);
  
  // Centralized status handler that gets called when meal generation is complete
  // This centralizes the processing of meal plan data that was previously duplicated
  const handleMealPlanReady = useCallback((mealPlanData) => {
    if (!mealPlanData || !mealPlanData.meal_plan || !Array.isArray(mealPlanData.meal_plan)) {
      console.error("Invalid meal plan data received");
      return;
    }
    
    console.log(`Meal plan ready with ${mealPlanData.meal_plan.length} meals`);
    
    // Update state
    setIsGenerating(false);
    setMealGenerationComplete(true);
    
    // Process meal plan
    let processedMealPlan = [...mealPlanData.meal_plan];
    
    // Handle full day plans - make sure each meal has a proper meal_type
    if (mealType === 'Full Day') {
      const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
      
      // Check if we have the right number of meals
      if (mealPlanData.meal_plan.length >= 4) {
        console.log("[MealPage] Full day plan with at least 4 meals - ensuring proper meal types");
        
        // First check if meal_type properties are already set
        const hasMealTypes = mealPlanData.meal_plan.some(meal => 
          meal.meal_type && ['breakfast', 'lunch', 'dinner', 'snack'].includes(meal.meal_type.toLowerCase())
        );
        
        if (hasMealTypes) {
          console.log("[MealPage] Meals already have meal_type properties, ensuring they're in the right order");
          
          // We need to make sure we have exactly one of each type in the right order
          const orderedMeals = [];
          
          // Add meals in the right order based on their type
          mealTypes.forEach(type => {
            const mealOfType = mealPlanData.meal_plan.find(meal => 
              meal.meal_type && meal.meal_type.toLowerCase() === type.toLowerCase()
            );
            
            if (mealOfType) {
              // Found a meal of this type - standardize its type property
              orderedMeals.push({
                ...mealOfType,
                meal_type: type
              });
            }
          });
          
          // Then add any remaining meals
          mealPlanData.meal_plan.forEach(meal => {
            const alreadyIncluded = orderedMeals.some(m => m.id === meal.id);
            if (!alreadyIncluded) {
              orderedMeals.push(meal);
            }
          });
          
          processedMealPlan = orderedMeals;
        } else {
          // No meal types - assign them based on index
          console.log("[MealPage] Assigning meal types based on index order");
          processedMealPlan = mealPlanData.meal_plan.map((meal, idx) => {
            if (idx < mealTypes.length) {
              return { ...meal, meal_type: mealTypes[idx] };
            }
            return meal;
          });
        }
      } else {
        console.warn("[MealPage] Full Day meal plan has fewer than 4 meals!", mealPlanData.meal_plan.length);
        // Just assign types sequentially to whatever meals we have
        processedMealPlan = mealPlanData.meal_plan.map((meal, idx) => {
          if (idx < mealTypes.length) {
            return { ...meal, meal_type: mealTypes[idx] };
          }
          return meal;
        });
      }
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
  }, [mealType, currentMealPlanId, setIsGenerating, setMealGenerationComplete, setMealPlan, setDisplayedMealType, setShowChatbot, setHasViewedGeneratedMeals]);

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
      // Always load preferences and numDays
      setPreferences(savedData.preferences || '');
      setNumDays(savedData.numDays || 1);
      
      // If we have an existing meal plan, prioritize keeping its type
      if (Array.isArray(savedData.mealPlan) && savedData.mealPlan.length > 0) {
        console.log("[MealPage] Found existing meal plan in localStorage with", savedData.mealPlan.length, "meals");
        setMealPlan(savedData.mealPlan);
        
        // Determine if this is a Full Day meal plan
        const isFullDayPlan = (savedData.displayedMealType === 'Full Day' || savedData.mealType === 'Full Day') ||
                             (savedData.mealPlan.length >= 4 && numDays === 1);
                             
        // Set displayedMealType based on actual content (not just what was selected previously)
        const actualMealType = isFullDayPlan ? 'Full Day' : (savedData.displayedMealType || savedData.mealType || 'Breakfast');
        console.log(`[MealPage] Initial load: Detected meal type: ${actualMealType}`);
        
        // IMPORTANT: Set both mealType and displayedMealType to ensure consistency
        setMealType(actualMealType);
        setDisplayedMealType(actualMealType);
      } else {
        // No meal plan, just load the saved meal type or default to Breakfast
        setMealType(savedData.mealType || 'Breakfast');
        setDisplayedMealType(savedData.mealType || 'Breakfast');
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
  
  // Ensure displayedMealType always stays synchronized with mealType
  useEffect(() => {
    console.log(`Synchronizing displayedMealType with mealType: ${mealType}`);
    setDisplayedMealType(mealType);
    
    // If meal type changes, we should clear any existing meal plan to prevent conflicts
    if (mealPlan.length > 0) {
      console.log(`Meal type changed to: ${mealType} - clearing existing meal plan`);
      setMealPlan([]);
      resetMealGeneration();
    }
  }, [mealType]);
  
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

  // Pro status checking
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
      // Make sure displayedMealType is set properly before generating a new plan
      setDisplayedMealType(mealType);
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
    
    // IMPORTANT: Set displayedMealType to match the current mealType immediately to prevent conflicts
    setDisplayedMealType(mealType);
  
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
  // and check for cached meal plans on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.generateMeals = fetchMealPlan;
      
      // Check for cached meal plan on page load
      if (userId && !mealPlan.length && !isGenerating) {
        const loadCachedMealPlan = async () => {
          try {
            console.log("[MealPage] Checking for cached meal plan on initial load");
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
            const headers = await getAuthHeaders();
            
            // First check if there's a cached meal plan ID in localStorage
            const cachedMealPlanId = localStorage.getItem('currentMealPlanId');
            if (cachedMealPlanId) {
              console.log(`[MealPage] Found cached meal plan ID in localStorage: ${cachedMealPlanId}`);
              
              // Load the meal plan directly
              const fullUrl = `${apiUrl}/mealplan/by_id/${cachedMealPlanId}`;
              console.log(`[MealPage] Fetching cached meal plan: ${fullUrl}`);
              const response = await fetch(fullUrl, { headers });
              
              if (response.ok) {
                const data = await response.json();
                if (data && data.meal_plan && Array.isArray(data.meal_plan) && data.meal_plan.length > 0) {
                  console.log("[MealPage] Successfully loaded cached meal plan with", data.meal_plan.length, "meals");
                  
                  // Update state with the cached meal plan
                  setMealPlanReady(true);
                  setMealGenerationComplete(true);
                  setCurrentMealPlanId(cachedMealPlanId);
                  setHasViewedGeneratedMeals(true);
                  
                  // Process and display the meal plan
                  let processedMealPlan = [...data.meal_plan];
                  
                  // Handle full day plan meal types
                  if (mealType === 'Full Day') {
                    const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
                    
                    // Check if we have the right number of meals
                    if (data.meal_plan.length >= 4) {
                      // First check if meal_type properties are already set
                      const hasMealTypes = data.meal_plan.some(meal => 
                        meal.meal_type && ['breakfast', 'lunch', 'dinner', 'snack'].includes(meal.meal_type.toLowerCase())
                      );
                      
                      if (hasMealTypes) {
                        // We need to make sure we have exactly one of each type in the right order
                        const orderedMeals = [];
                        
                        // Add meals in the right order based on their type
                        mealTypes.forEach(type => {
                          const mealOfType = data.meal_plan.find(meal => 
                            meal.meal_type && meal.meal_type.toLowerCase() === type.toLowerCase()
                          );
                          
                          if (mealOfType) {
                            // Found a meal of this type - standardize its type property
                            orderedMeals.push({
                              ...mealOfType,
                              meal_type: type
                            });
                          }
                        });
                        
                        // Then add any remaining meals
                        data.meal_plan.forEach(meal => {
                          const alreadyIncluded = orderedMeals.some(m => m.id === meal.id);
                          if (!alreadyIncluded) {
                            orderedMeals.push(meal);
                          }
                        });
                        
                        processedMealPlan = orderedMeals;
                      } else {
                        // No meal types - assign them based on index
                        processedMealPlan = data.meal_plan.map((meal, idx) => {
                          if (idx < mealTypes.length) {
                            return { ...meal, meal_type: mealTypes[idx] };
                          }
                          return meal;
                        });
                      }
                    }
                  }
                  
                  setMealPlan(processedMealPlan);
                  setDisplayedMealType(mealType);
                  
                  return true;
                }
              }
            }
            
            return false;
          } catch (err) {
            console.error("[MealPage] Error loading cached meal plan:", err);
            return false;
          }
        };
        
        loadCachedMealPlan();
      }
      
      return () => {
        window.generateMeals = undefined;
      };
    }
  }, [fetchMealPlan, userId, isGenerating, mealPlan.length, getAuthHeaders, mealType]);

  // Handle chatbot completion - fetch meal plan if ready
  const handleChatComplete = async () => {
    console.log("[MealPage] Chatbot complete, checking for meal plan");
    setShowChatbot(false);
    
    // CRITICAL: Immediately stop the loading spinner if meal is ready
    if (mealPlanReady) {
      setIsGenerating(false);
    }
    
    // Get meal plan ID, checking both context state and localStorage
    const mealPlanIdToUse = currentMealPlanId || 
                            (typeof window !== 'undefined' ? localStorage.getItem('currentMealPlanId') : null);
    
    // Special check for immediately ready meal plans
    if (typeof window !== 'undefined' && userId && !mealPlanIdToUse) {
      try {
        // Try to find an immediately ready meal plan
        console.log("[MealPage] Checking for immediately ready meal plans");
        const readyCheckResponse = await fetch(`/api/webhook/meal-ready?user_id=${userId}&checkReadyPlans=true`);
        
        if (readyCheckResponse.ok) {
          const readyData = await readyCheckResponse.json();
          if (readyData.has_notification && readyData.notification?.meal_plan_id) {
            console.log("[MealPage] Found immediately ready meal plan:", readyData.notification.meal_plan_id);
            
            // Update state
            setMealPlanReady(true);
            setIsGenerating(false);
            setMealGenerationComplete(true);
            setCurrentMealPlanId(readyData.notification.meal_plan_id);
            
            // Store ID
            localStorage.setItem('currentMealPlanId', readyData.notification.meal_plan_id);
          }
        }
      } catch (err) {
        console.error("[MealPage] Error checking for immediately ready meal plans:", err);
      }
    }
    
    if (mealPlanReady && mealPlanIdToUse && (!mealPlan || !mealPlan.length)) {
      try {
        console.log("[MealPage] Loading meal plan from chatbot completion:", mealPlanIdToUse);
        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        
        // CRITICAL: Store this ID in localStorage to ensure it's available
        // for other components and page reloads
        if (typeof window !== 'undefined' && mealPlanIdToUse) {
          console.log(`[MealPage] Storing currentMealPlanId in localStorage: ${mealPlanIdToUse}`);
          localStorage.setItem('currentMealPlanId', mealPlanIdToUse);
          
          // Also update context state
          if (currentMealPlanId !== mealPlanIdToUse) {
            setCurrentMealPlanId(mealPlanIdToUse);
          }
          
          // Immediately update global window state
          window.mealLoading = false;
          window.mealPlanReady = true;
        }
        
        // Get auth headers
        const headers = await getAuthHeaders();
        
        // Fetch the meal plan
        const fullUrl = `${apiUrl}/mealplan/by_id/${mealPlanIdToUse}`;
        console.log(`[MealPage] Making API request to: ${fullUrl}`);
        const response = await fetch(fullUrl, { headers });
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        let data = await response.json();
        
        // Validate the meal plan data
        if (data && data.meal_plan && Array.isArray(data.meal_plan)) {
          console.log("[MealPage] Chat complete: Received meal plan with", data.meal_plan.length, "meals");
          
          // IMPORTANT: Determine if this is a Full Day meal plan by checking the ID or meal count
          const isFullDayPlan = mealPlanIdToUse.toLowerCase().includes('full day') || 
                               (data.meal_plan.length >= 4 && numDays === 1);
          
          // Set the displayed meal type based on the actual meal plan content
          const actualMealType = isFullDayPlan ? 'Full Day' : mealType;
          console.log(`[MealPage] Setting displayed meal type to: ${actualMealType}`);
          
          // For Full Day plans, ensure all 4 meal types are assigned
          if (isFullDayPlan && data.meal_plan.length > 0) {
            const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
            
            console.log("[MealPage] Processing Full Day meal plan with meal types");
            
            // Check if we have distinct meal types or need to assign them
            const existingTypes = new Set(data.meal_plan.map(meal => meal.meal_type));
            if (existingTypes.size < 4 || existingTypes.has('Full Day')) {
              console.log("[MealPage] Assigning specific meal types for Full Day plan");
              
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
          
          // Update state in the component and the context
          setMealPlan(data.meal_plan);
          setDisplayedMealType(actualMealType); // Use the detected meal type
          setIsGenerating(false);
          setMealGenerationComplete(true);
          setHasViewedGeneratedMeals(true);
          
          // Store in localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('mealPlanInputs', JSON.stringify({
              preferences,
              mealType: actualMealType, // Store the actual detected type
              numDays,
              mealPlan: data.meal_plan,
              displayedMealType: actualMealType // Store the actual detected type
            }));
            
            // Update context state
            const currentState = JSON.parse(localStorage.getItem('mealGenerationState') || '{}');
            localStorage.setItem('mealGenerationState', JSON.stringify({
              ...currentState,
              isGenerating: false,
              mealGenerationComplete: true,
              currentMealPlanId: mealPlanIdToUse,
              hasViewedGeneratedMeals: true
            }));
            
            console.log("[MealPage] Successfully loaded and displayed meal plan");
          }
        } else {
          throw new Error("No meal plan data found in API response");
        }
      } catch (error) {
        console.error("[MealPage] Error fetching ready meal plan:", error);
        setError("Could not retrieve your meal plan. Please try again.");
        setIsGenerating(false);
      } finally {
        setLoading(false);
      }
    } else if (!mealPlanReady) {
      console.log("[MealPage] Meal plan not yet ready, continuing to wait for notification");
    } else if (!mealPlanIdToUse) {
      console.error("[MealPage] No meal plan ID available");
      setError("Missing meal plan information. Please try generating a new meal plan.");
    } else if (mealPlan && mealPlan.length > 0) {
      console.log("[MealPage] Already have meal plan loaded, no need to fetch again");
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
      
      console.log('[Meals Page] URL check - showMealCards:', showMealCards, 'mealPlanId:', urlMealPlanId);
      
      // Always handle the showMealCards parameter - this is the trigger
      if (showMealCards === 'true') {
        console.log('[Meals Page] Meal cards view requested');
        
        // First check if we already have a meal plan loaded
        if (Array.isArray(mealPlan) && mealPlan.length > 0) {
          console.log('[Meals Page] Already have meal plan in component state', mealPlan.length, 'meals');
          // No need to load anything, just mark as viewed through our hook
          setHasViewedGeneratedMeals(true);
          return;
        }
          
        // Try to get meal plan from Zustand store
        const storeState = useMealStore.getState();
        
        if (Array.isArray(storeState.mealPlan) && storeState.mealPlan.length > 0) {
          console.log('[Meals Page] Using meal plan from Zustand store', storeState.mealPlan.length, 'meals');
          
          // Apply to component state
          setMealPlan(storeState.mealPlan);
          setDisplayedMealType(storeState.displayedMealType || mealType);
          
          // Mark as viewed through our hook (turns off green checkmark)
          setHasViewedGeneratedMeals(true);
          
          // We're done - no need to load from API
          return;
        }
        
        // If we get here, we need to load the meal plan from API
        console.log('[Meals Page] Loading meal plan from API');
        
        // Get the meal plan ID from all possible sources
        const localMealPlanId = localStorage.getItem('currentMealPlanId');
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
                
                // IMPORTANT: Check if this is actually a Full Day meal plan by inspecting the meal plan ID or count
                const isFullDayPlan = mealPlanApiId.toLowerCase().includes('full day') || 
                                     (data.meal_plan.length >= 4 && numDays === 1);
                
                // Set the correct meal type based on the detected plan type
                const actualMealType = isFullDayPlan ? 'Full Day' : mealType;
                console.log(`[MealPage] URL param: Detected meal type from plan data: ${actualMealType}`);
                
                // For Full Day plans, ensure all 4 meal types are assigned
                if (isFullDayPlan && data.meal_plan.length > 0) {
                  const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
                  
                  // Check if we have distinct meal types or need to assign them
                  const existingTypes = new Set(data.meal_plan.map(meal => meal.meal_type));
                  if (existingTypes.size < 4 || existingTypes.has('Full Day')) {
                    console.log("Assigning specific meal types to meals for a Full Day plan");
                    
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
                setDisplayedMealType(actualMealType); // Use the detected meal type, not just mealType
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
            // Check if this is a Full Day meal plan by inspecting the meal count or saved type
            const isFullDayPlan = (savedData.displayedMealType === 'Full Day' || savedData.mealType === 'Full Day') ||
                                 (savedData.mealPlan.length >= 4 && numDays === 1);
                                 
            const actualMealType = isFullDayPlan ? 'Full Day' : (savedData.displayedMealType || savedData.mealType);
            console.log(`[MealPage] Loading from localStorage: Detected meal type: ${actualMealType}`);
            
            setMealPlan(savedData.mealPlan);
            setDisplayedMealType(actualMealType); // Use the detected meal type
            setShowChatbot(false);
            setHasViewedGeneratedMeals(true);
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
  // Centralized polling mechanism that combines all meal plan status checks 
  useEffect(() => {
    // Skip if not generating or already complete
    if (!isGenerating || mealGenerationComplete) {
      return;
    }
    
    console.log("[MealPage] Setting up centralized polling for meal plan status");
    
    // Single function that checks all possible sources for meal plan status
    const checkMealPlanStatus = async () => {
      // Avoid multiple concurrent checks
      if (typeof window !== 'undefined' && window._mealPageChecking) {
        console.log("[MealPage] Skipping duplicate status check");
        return;
      }
      
      if (typeof window !== 'undefined') {
        window._mealPageChecking = true;
      }
      
      try {
        // Early return if we're no longer generating
        if (!isGenerating || mealGenerationComplete) {
          console.log("[MealPage] Meal generation no longer in progress, stopping checks");
          if (typeof window !== 'undefined') {
            window._mealPageChecking = false;
          }
          return;
        }
        
        if (typeof window !== 'undefined') {
          window._mealPageCheckingNotification = true;
        }
        
        // Use authenticated headers
        const headers = await getAuthHeaders();
        
        // Check with the backend directly to see if the meal plan is ready
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        console.log("[MealPage] Checking meal plan status for user:", userId);
        
        const response = await fetch(`${apiUrl}/mealplan/get_latest_session`, {
          headers
        });
        
        if (!response.ok) {
          console.error(`[MealPage] Error checking meal plan status: ${response.status}`);
          return;
        }
        
        const data = await response.json();
        
        // Check if the response was throttled - if so, handle gracefully
        if (data.throttled) {
          console.log('[MealPage] Session check was throttled, will try again later');
          return;
        }
        
        // Check both meal_plan_ready AND the all_meals_ready flag to ensure images are also generated
        if (data.meal_plan_ready && data.meal_plan_id && data.all_meals_ready) {
          console.log("[MealPage] Found completely ready meal plan with all images:", data.meal_plan_id);
          
          // Update state in this component and the meal generation context
          setMealGenerationComplete(true);
          setCurrentMealPlanId(data.meal_plan_id);
          setIsGenerating(false);
          setMealPlanReady(true);
          
          if (showChatbot) {
            setShowChatbot(false);
          }
          
          // Store in localStorage for persistence
          if (typeof window !== 'undefined') {
            window.mealLoading = false;
            window.mealPlanReady = true;
            localStorage.setItem('currentMealPlanId', data.meal_plan_id);
            localStorage.setItem('hasViewedGeneratedMeals', 'false');
            
            // Update context state in localStorage
            const currentState = JSON.parse(localStorage.getItem('mealGenerationState') || '{}');
            localStorage.setItem('mealGenerationState', JSON.stringify({
              ...currentState,
              isGenerating: false,
              mealGenerationComplete: true,
              currentMealPlanId: data.meal_plan_id
            }));
            
            console.log("✅ [MealPage] Meal plan is fully ready with all images generated!");
            
            // Process the meal plan using our central handler
            handleMealPlanReady(data);
          }
        } else if (data.meal_plan_ready && !data.all_meals_ready) {
          // Meals are ready but images are still processing
          console.log("⏱️ [MealPage] Meal data is ready but still waiting for images to be generated...");
          if (typeof window !== 'undefined') {
            window.imagesGenerating = true;
          }
        } else if (data.meal_plan_processing) {
          console.log("⏳ [MealPage] Meal plan still generating, will continue checking...");
        }
      } catch (error) {
        console.error("[MealPage] Error checking meal plan status:", error);
      } finally {
        // Always clear the checking flag when we're done
        if (typeof window !== 'undefined') {
          window._mealPageChecking = false;
          window._mealPageCheckingNotification = false;
        }
      }
    };
    
    // Check immediately
    checkMealPlanStatus();
    
    // Set up interval to check periodically, with shorter initial check
    const firstCheckId = setTimeout(() => checkMealPlanStatus(), 10000); // 10 seconds initially
    const intervalId = setInterval(() => checkMealPlanStatus(), 30000);  // Then every 30 seconds
    
    // Set up event listener for meal plan ready events
    const handleMealPlanReadyEvent = (event) => {
      console.log("[MealPage] Received mealPlanReady event:", event.detail);
      
      if (event.detail.mealPlanId) {
        setMealGenerationComplete(true);
        setCurrentMealPlanId(event.detail.mealPlanId);
        setIsGenerating(false);
        setMealPlanReady(true);
        
        if (showChatbot) {
          setShowChatbot(false);
        }
      }
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('mealPlanReady', handleMealPlanReadyEvent);
    }
    
    return () => {
      clearTimeout(firstCheckId);
      clearInterval(intervalId);
      
      if (typeof window !== 'undefined') {
        window._mealPageCheckingNotification = false;
        window.removeEventListener('mealPlanReady', handleMealPlanReadyEvent);
      }
    };
  }, [userId, isGenerating, mealGenerationComplete, showChatbot, setMealGenerationComplete, setCurrentMealPlanId, setIsGenerating, getAuthHeaders, handleMealPlanReady]);

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
      // Send save request via API service (handles token refresh on 401)
      await makeAuthenticatedRequest('/api/user-recipes/saved-recipes/', {
        method: 'POST',
        body: JSON.stringify({
          recipes: selectedMeals,
          plan_name: `Meal Plan - ${preferences || 'Custom'}`,
        }),
      });
      // Notify success
      alert('Your recipes have been saved successfully!');
      setSelectedRecipes([]);
    } catch (error) {
      console.error('❌ Error saving recipes:', error);
      setError(error.message || 'Failed to save recipes. Please try again later.');
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

  // Effect to handle FAB state update when showing meal cards
  useEffect(() => {
    // If we're showing the meal plan and it's loaded, update the FAB state
    if (Array.isArray(mealPlan) && mealPlan.length > 0) {
      console.log('[Meals Page] Meal plan loaded with', mealPlan.length, 'meals - updating FAB state');
      
      // Always use the setHasViewedGeneratedMeals directly from the component scope
      // This is more reliable than accessing the store directly
      setHasViewedGeneratedMeals(true);
      
      // For compatibility with other views that might still be using the store directly
      // we still need to mark the store as hydrated
      markStoreHydrated();
    }
  }, [mealPlan, setHasViewedGeneratedMeals, markStoreHydrated]);

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
        
        {((Array.isArray(mealPlan) && mealPlan.length > 0) || 
          (typeof window !== 'undefined' && window.location.search.includes('showMealCards=true'))) && 
          !showChatbot && (
          <MealPlanDisplay
            mealPlan={mealPlan}
            mealType={displayedMealType} // IMPORTANT: Always use displayedMealType here for consistent UI display
            numDays={numDays}
            handleMealSelection={handleMealSelection}
            selectedRecipes={selectedRecipes}
            saveSelectedRecipes={saveSelectedRecipes}
            handleOrderPlanIngredients={handleOrderPlanIngredients}
            loading={loading}
            orderingPlanIngredients={orderingPlanIngredients}
            showChatbot={showChatbot}
            onReturnToInput={() => {
              // Log what's happening
              console.log("[MealPage] Returning to input screen - resetting meal plan and state");
              
              // Use Zustand's reset function to clear all state
              resetMealGeneration();
              
              // Also clear component local state
              setMealPlan([]);
              
              // Update URL without the parameters - this is critical
              window.history.replaceState({}, document.title, '/meals');
              
              // Trigger a state update to refresh the UI
              setMealGenerationComplete(false);
              setDisplayedMealType(mealType);
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