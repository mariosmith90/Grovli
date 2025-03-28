"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import MealCard, { MealPlanDisplay } from '../../components/mealcard';
import ChatbotWindow from '../../components/chatbot';
import CulturalInfo from '../../components/culturalinfo'

export default function Home() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [preferences, setPreferences] = useState('');
  const [mealType, setMealType] = useState('Breakfast');
  const [numDays, setNumDays] = useState(1);
  const [mealPlan, setMealPlan] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ingredients, setIngredients] = useState([]);  
  const [orderingPlanIngredients, setOrderingPlanIngredients] = useState(false);
  const { user, isLoading } = useUser();
  const [isPro, setIsPro] = useState(false);
  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const [showChatbot, setShowChatbot] = useState(false);
  const [mealPlanReady, setMealPlanReady] = useState(false);
  const [currentMealPlanId, setCurrentMealPlanId] = useState(null);
  const [displayedMealType, setDisplayedMealType] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState('');
  const [mealAlgorithm, setMealAlgorithm] = useState('experimental');

  const checkOnboardingStatus = async () => {
    if (!user) return false;
  
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/user-profile/check-onboarding/${user.sub}`);
  
      if (response.ok) {
        const data = await response.json();
        return data.onboarded; // Ensure this matches the API response structure
      } else {
        console.error("Failed to fetch onboarding status:", response.status);
        return false; // Do not fall back to localStorage for onboarding status
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      return false; // Do not fall back to localStorage for onboarding status
    }
  };

  
  // Global Settings State
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

  // Separate calories state for UI
  const [calories, setCalories] = useState(globalSettings.calories);

  // Sync globalSettings.calories with calories state
  useEffect(() => {
    setGlobalSettings((prev) => ({
      ...prev,
      calories: globalSettings.calories,
    }));
  }, [calories]);

  // Sync with navbar's numDays
  useEffect(() => {
    // Sync with global numDays when available
    if (typeof window !== 'undefined') {
      // Set initial value from global if available
      if (window.numDays !== undefined) {
        setNumDays(window.numDays);
      }
      
      // Setup interval to check for changes
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

  // Load global settings from localStorage and server
  useEffect(() => {
    // First load from localStorage as fallback
    const savedData = JSON.parse(localStorage.getItem("mealPlanInputs"));
    if (savedData) {
      setPreferences(savedData.preferences || '');
      setMealType(savedData.mealType || 'Breakfast');
      setNumDays(savedData.numDays || 1);
      
      // Ensure mealPlan is properly restored if it exists
      if (Array.isArray(savedData.mealPlan) && savedData.mealPlan.length > 0) {
        setMealPlan(savedData.mealPlan);
        
        // Also restore the displayed meal type
        if (savedData.displayedMealType) {
          setDisplayedMealType(savedData.displayedMealType);
        } else {
          setDisplayedMealType(savedData.mealType || 'Breakfast');
        }
      }
    }
    
    // Load settings from localStorage first
    const savedSettings = JSON.parse(localStorage.getItem('globalMealSettings') || '{}');
    if (Object.keys(savedSettings).length > 0) {
      setGlobalSettings(savedSettings);
      setCalories(savedSettings.calories || 2400); // Sync calories state
    }
    
    // If user is authenticated, fetch settings from server (takes precedence)
    if (user && user.sub) {
      const fetchUserSettings = async () => {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          const response = await fetch(`${apiUrl}/user-settings/${user.sub}`);
          
          if (response.ok) {
            const serverSettings = await response.json();
            console.log("Loaded server settings on meal plan page:", serverSettings);
            
            // Update global settings from server
            setGlobalSettings(serverSettings);
            setCalories(serverSettings.calories || 2400); // Sync calories state
            
            // Also update localStorage with these settings for consistency
            localStorage.setItem('globalMealSettings', JSON.stringify(serverSettings));
          }
        } catch (error) {
          console.error("Error fetching user settings:", error);
        }
      };
      
      fetchUserSettings();
    }
  }, [user]);
  
  // Save to localStorage whenever relevant states change
  useEffect(() => {
    // Make sure mealPlan is an array before storing
    const mealPlanToStore = Array.isArray(mealPlan) ? mealPlan : [];
    
    localStorage.setItem(
      "mealPlanInputs",
      JSON.stringify({
        preferences,
        mealType,
        numDays,
        mealPlan: mealPlanToStore,
        displayedMealType: displayedMealType
      })
    );
  }, [preferences, mealType, numDays, mealPlan, displayedMealType]);

  // Fetch Subscription Status
  const fetchSubscriptionStatus = async () => {
    if (!user) return;
  
    try {
      // Check for specific user ID with special access
      if (user.sub === "auth0|67b82eb657e61f81cdfdd503") {
        setIsPro(true);
        console.log("✅ Special user detected - Pro features enabled");
        return;
      }
  
      // Updated Auth0 v4 token retrieval
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      if (!token) {
        throw new Error("Failed to retrieve access token.");
      }
  
      // Decode JWT and check subscription
      const tokenPayload = JSON.parse(atob(token.split(".")[1]));
      const userSubscription = tokenPayload?.["https://dev-rw8ff6vxgb7t0i4c.us.auth0.com/app_metadata"]?.subscription;
      setIsPro(userSubscription === "pro");
    } catch (err) {
      console.error("Error fetching subscription status:", err);
    }
    if (!isPro && mealType === 'Full Day') {
      setMealType('Breakfast');
    }
  };

  // Handle recipe selection/deselection
  const handleMealSelection = (id) => {
    setSelectedRecipes(prevSelected => {
      if (prevSelected.includes(id)) {
        return prevSelected.filter(recipeId => recipeId !== id);
      } else {
        return [...prevSelected, id];
      }
    });
  };

  // Fetch Meal Plan 
  const fetchMealPlan = async () => {
    if (!isPro && mealType === 'Full Day') {
      setMealType('Breakfast');
    }
    
    try {
      setError('');
      setLoading(true);
      setSelectedRecipes([]);
      
      // Show chatbot window while meal plan is generating
      setShowChatbot(true);
      setMealPlanReady(false);
      setCurrentMealPlanId(null);
      
      // Reset UI state
      setMealPlan([]); 
      setIngredients([]);
      setOrderingPlanIngredients(false);
      
      // Fetch pantry ingredients if using pantry algorithm
      let pantryIngredients = [];
      if (mealAlgorithm === 'pantry' && user) {
        try {
          const token = await getAccessToken({
            authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
          });
          
          const pantryResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-pantry/items`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (pantryResponse.ok) {
            const pantryData = await pantryResponse.json();
            pantryIngredients = pantryData.items.map(item => item.name);
          }
        } catch (error) {
          console.error("Error fetching pantry ingredients:", error);
        }
      }
      
      // Send initial request to start meal plan generation
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const headers = { 'Content-Type': 'application/json' };
      
      if (user && user.sub) {
        headers['user-id'] = user.sub;
      }
      
      // Get the token using the client-side getAccessToken helper
      if (user) {
        try {
          const token = await getAccessToken({
            authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
          });
          headers['Authorization'] = `Bearer ${token}`;
        } catch (tokenError) {
          console.error("❌ Error retrieving access token:", tokenError);
        }
      }
      
      // Make the initial request to start meal plan generation
      const response = await fetch(`${apiUrl}/mealplan/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dietary_preferences: preferences,
          meal_type: mealType,
          num_days: numDays,
          carbs: globalSettings.carbs,
          calories: globalSettings.calories,
          protein: globalSettings.protein,
          sugar: globalSettings.sugar,
          fat: globalSettings.fat,
          fiber: globalSettings.fiber,
          meal_algorithm: mealAlgorithm,
          pantry_ingredients: pantryIngredients // Use the fetched ingredients
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      // If the meal plan is already complete (cached), use it immediately
      if (data.meal_plan && Array.isArray(data.meal_plan)) {
        setMealPlan(data.meal_plan);
        setDisplayedMealType(mealType);
        setShowChatbot(false);
        return;
      }
      
      // Otherwise, get the meal plan ID and start polling
      if (data.status === "processing" && data.meal_plan_id) {
        setCurrentMealPlanId(data.meal_plan_id);
        
        // Poll until the meal plan is ready
        let isReady = false;
        let retries = 0;
        const maxRetries = 20; // Maximum 5 minutes (15s * 20)
        
        while (!isReady && retries < maxRetries) {
          // Wait 15 seconds between checks
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          try {
            // Check if the meal plan is ready
            const statusResponse = await fetch(`${apiUrl}/mealplan/by_id/${data.meal_plan_id}`);
            
            if (statusResponse.ok) {
              // Meal plan is ready, get it
              const mealPlanData = await statusResponse.json();
              
              if (mealPlanData.meal_plan && Array.isArray(mealPlanData.meal_plan)) {
                setMealPlan(mealPlanData.meal_plan);
                setDisplayedMealType(mealType);
                isReady = true;
              }
            } else if (statusResponse.status === 404) {
              // Not ready yet, continue polling
              console.log(`Meal plan not ready yet, retry ${retries + 1}/${maxRetries}`);
            } else {
              // Unexpected error
              throw new Error(`HTTP error ${statusResponse.status}`);
            }
          } catch (error) {
            console.error("Error checking meal plan status:", error);
          }
          
          retries++;
        }
        
        if (!isReady) {
          throw new Error("Meal plan generation timed out. Please try again.");
        }
      } else {
        throw new Error("Invalid API response");
      }
      
      // Close the chatbot when complete
      setShowChatbot(false);
      
    } catch (error) {
      console.error('Error fetching meal plan:', error);
      setError(`Error: ${error.message}`);
      setShowChatbot(false);
    } finally {
      setLoading(false);
    }
  };

  // Handle Chat Complete
  const handleChatComplete = async () => {
    setShowChatbot(false);
    
    // If meal plan is ready but we don't have the data, fetch it now
    if (mealPlanReady && currentMealPlanId && (!mealPlan || !mealPlan.length)) {
      try {
        setLoading(true);
        
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        
        // Use the exact meal_plan_id from the notification
        const response = await fetch(`${apiUrl}/mealplan/by_id/${currentMealPlanId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.meal_plan) {
          setMealPlan(Array.isArray(data.meal_plan) ? data.meal_plan : []);
          setDisplayedMealType(mealType); // Set the displayed meal type when data is ready
        } else {
          throw new Error("No meal plan data found");
        }
      } catch (error) {
        console.error("Error fetching ready meal plan:", error);
        setError("Could not retrieve your meal plan. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  // Load user profile and prefill meal form
  const loadUserProfileData = async () => {
    if (!user) return;
    
    try {
      // First fetch user profile from API
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const profileResponse = await fetch(`${apiUrl}/user-profile/${user.sub}`);
      
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        
        if (profileData.found) {
          const userProfile = profileData.profile;
          console.log("Found user profile:", userProfile);
          
          // 1. Set dietary preferences based on profile
          if (userProfile.dietary_preferences && userProfile.dietary_preferences.length > 0) {
            // Join all preferences with spaces to match the format expected by the UI
            setPreferences(userProfile.dietary_preferences.join(" "));
          }
          
          // 2. Set meal type based on the meal_plan_preference
          if (userProfile.meal_plan_preference) {
            const mealTypeMapping = {
              'breakfast': 'Breakfast',
              'lunch': 'Lunch',
              'dinner': 'Dinner',
              'snacks': 'Snack',
              'full_day': 'Full Day'
            };
            
            const mappedMealType = mealTypeMapping[userProfile.meal_plan_preference];
            
            // Only set Full Day if user is Pro
            if (mappedMealType === 'Full Day' && !isPro) {
              setMealType('Breakfast'); // Default to Breakfast for non-Pro users
            } else {
              setMealType(mappedMealType || 'Breakfast');
            }
          }
          
          // 3. Set number of days - default to 1 for now 
          // (can be expanded later to set based on user preferences)
          setNumDays(1);
          
          // Save to localStorage for persistence
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

  useEffect(() => {
    if (!isLoading && user) {
      checkOnboardingStatus().then((onboardingComplete) => {
        if (!onboardingComplete) {
          console.log("User has not completed onboarding, redirecting...");
          router.push('/onboarding');
        } else {
          // User has completed onboarding, proceed with normal flow
          fetchSubscriptionStatus().then(() => {
            loadUserProfileData();
          });
        }
      });
    }
  }, [user, isLoading]);

  // Save Selected Recipes
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
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      if (!token) {
        alert("Session error. Please log in again.");
        router.push("/auth/login?returnTo=/dashboard");
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-recipes/saved-recipes/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
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
      setSelectedRecipes([]); // Clear selection after saving

    } catch (error) {
      console.error("❌ Error saving recipes:", error);
      setError("Failed to save recipes. Please try again later.");
    }
  };

  // Handle Order Plan Ingredients
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

      // Extract shopping list and URL
      const cleanedIngredients = data.shopping_list?.items?.map(item => item.description) || [];
      setIngredients(cleanedIngredients);

      // Redirect to Instacart
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

  // Simple useEffect to load the mealAlgorithm from globalSettings
  useEffect(() => {
    // Load from localStorage
    const savedSettings = JSON.parse(localStorage.getItem('globalMealSettings') || '{}');
    
    if (savedSettings.mealAlgorithm) {
      setMealAlgorithm(savedSettings.mealAlgorithm);
    } else {
      // Fallback to separate localStorage item for backward compatibility
      const savedAlgorithm = localStorage.getItem('mealAlgorithm');
      if (savedAlgorithm) {
        setMealAlgorithm(savedAlgorithm);
      }
    }
  }, [user]);

  // Add this to useEffect in page.js
  useEffect(() => {
    // Check for ready meal plans if we have a user
    if (user && user.sub && !mealPlanReady && showChatbot) {
      const checkMealPlanStatus = async () => {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          const response = await fetch(`${apiUrl}/mealplan/get_latest_session`, {
            headers: { 'user-id': user.sub }
          });
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.meal_plan_ready && data.meal_plan_id) {
              console.log("Found ready meal plan:", data.meal_plan_id);
              setMealPlanReady(true);
              setCurrentMealPlanId(data.meal_plan_id);
            }
          }
        } catch (error) {
          console.error("Error checking meal plan status:", error);
        }
      };
      
      // Check immediately and set up polling
      checkMealPlanStatus();
      const intervalId = setInterval(checkMealPlanStatus, 5000);
      return () => clearInterval(intervalId);
    }
  }, [user, mealPlanReady, showChatbot]);
  

  // Subscription Status Effect
  useEffect(() => {
    // Only fetch subscription status when user is loaded and authenticated
    if (!isLoading && user) {
      fetchSubscriptionStatus();
    }
  }, [user, isLoading]);
  
  // Outside Click Handler for Mobile Menu
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuOpen && 
          !event.target.closest(".mobile-menu") && 
          !event.target.closest(".mobile-menu-content")) {
        setMenuOpen(false);
      }
    };
  
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpen]);

  // Add this function to handle different meal type calorie ranges
  const getCalorieRange = (type) => {
    const mealTypeToCheck = type || mealType;
    
    switch(mealTypeToCheck) {
      case 'Breakfast':
      case 'Lunch':
      case 'Dinner':
        return { min: 0, max: 1000, step: 25 };
      case 'Snack':
        return { min: 0, max: 500, step: 25 };
      default: // 'Full Day'
        return { min: 1000, max: 4000, step: 50 };
    }
  };

  // Add this function for macro calculations based on meal type and diet preferences
  const adjustMacrosForMealType = (caloriesValue, type, prefs) => {
    // Check for keto diet
    if (prefs && prefs.toLowerCase().includes('keto')) {
      // Adjust macros for Keto
      const fatCalories = caloriesValue * 0.80; // 80% of calories for fat
      const proteinCalories = caloriesValue * 0.15; // 15% of calories for protein
      const carbCalories = caloriesValue * 0.05; // 5% of calories for carbs

      return {
        fat: Math.round(fatCalories / 9), // Fat in grams
        protein: Math.round(proteinCalories / 4), // Protein in grams
        carbs: Math.round(carbCalories / 4), // Carbs in grams
        fiber: Math.round((caloriesValue / 1000) * 14), // 14g fiber per 1000 kcal
        sugar: Math.round((caloriesValue * 0.10) / 4) // 10% of calories for sugar
      };
    } else {
      // Default macro calculation for non-Keto diets
      const proteinCalories = caloriesValue * 0.30; // 30% for protein
      const carbCalories = caloriesValue * 0.45; // 45% for carbs
      const fatCalories = caloriesValue * 0.25; // 25% for fat

      return {
        protein: Math.round(proteinCalories / 4),
        carbs: Math.round(carbCalories / 4),
        fat: Math.round(fatCalories / 9),
        fiber: Math.round((caloriesValue / 1000) * 14), // 14g fiber per 1000 kcal
        sugar: Math.round((caloriesValue * 0.10) / 4) // 10% of calories for sugar
      };
    }
  };
  
  // Make fetchMealPlan globally accessible for the FAB button
  useEffect(() => {
    // Expose the function globally for the FAB to call
    window.generateMeals = fetchMealPlan;
    
    // Clean up when component unmounts
    return () => {
      window.generateMeals = undefined;
    };
  }, [fetchMealPlan]);

  // Make saveSelectedRecipes globally accessible
  useEffect(() => {
    // Expose the function globally for the FAB to call
    window.saveSelectedRecipes = saveSelectedRecipes;
    
    // Clean up when component unmounts
    return () => {
      window.saveSelectedRecipes = undefined;
    };
  }, [saveSelectedRecipes]);

  // Make selectedRecipes globally accessible
  useEffect(() => {
    window.selectedRecipes = selectedRecipes;
    window.setSelectedRecipes = setSelectedRecipes;
    
    return () => {
      window.selectedRecipes = undefined;
      window.setSelectedRecipes = undefined;
    };
  }, [selectedRecipes, setSelectedRecipes]);

  return ( 
    <>
      {/* Full-screen white background */}
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
  
      {/* Main Content Container */}
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 border-none w-full max-w-4xl flex-grow flex flex-col">
          {/* Plan Your Meals - main title with calorie counter */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold text-gray-800">
              Plan Your Meals
            </h2>
            
            {/* Calories Counter */}
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="text-xl font-semibold text-gray-700">{globalSettings.calories}</span>
                <span className="text-sm text-gray-500">kcal</span>
              </div>
              <button
                onClick={() => router.push('/settings')}
                className="text-xs text-teal-600 hover:text-teal-800 transition-colors font-medium"
              >
                Change
              </button>
            </div>
          </div>
  
          {/* Cuisine Preferences Section with Image Thumbnails */}
          <div className="mb-8">
            <p className="text-base font-semibold text-gray-700 mb-3">
              A Taste of…
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              {[
                { name: "American", image: "/images/cuisines/american.jpg" },
                { name: "Asian", image: "/images/cuisines/asian.jpg" },
                { name: "Caribbean", image: "/images/cuisines/caribbean.jpg" },
                { name: "Indian", image: "/images/cuisines/indian.jpg" },
                { name: "Latin", image: "/images/cuisines/latin.jpg" },
                { name: "Mediterranean", image: "/images/cuisines/mediterranean.jpg" }
              ].map((cuisine) => (
                <div 
                  key={cuisine.name} 
                  className={`relative rounded-lg overflow-hidden cursor-pointer transition-all transform hover:scale-105 ${
                    preferences.includes(cuisine.name) ? "ring-4 ring-orange-500" : ""
                  }`}
                  onClick={() => {
                    setSelectedCuisine(cuisine.name);
                    setPreferences((prev) => {
                      const preferencesArray = prev.split(" ").filter(Boolean);
                      const updatedPreferences = preferencesArray.filter((item) =>
                        !["American", "Asian", "Caribbean", "Indian", "Latin", "Mediterranean"].includes(item)
                      );
                      return [...updatedPreferences, cuisine.name].join(" "); 
                    });
                  }}
                >
                  {/* Cuisine Image */}
                  <div className="aspect-[4/3] bg-gray-200">
                    <img 
                      src={cuisine.image} 
                      alt={`${cuisine.name} cuisine`} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = "/placeholder.jpg";
                      }}
                    />
                  </div>
                  
                  {/* Cuisine Name Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="text-white font-medium">{cuisine.name}</p>
                  </div>
                  
                  {/* Info Button */}
                  <button 
                    className="absolute top-2 right-2 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-800 hover:bg-white transition-colors shadow-md z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCuisine(cuisine.name);
                      // Show cultural info modal or expand section
                      document.getElementById(`culture-info-${cuisine.name}`).classList.toggle('hidden');
                    }}
                    aria-label={`Information about ${cuisine.name} cuisine`}
                  >
                    <span className="text-sm font-semibold">i</span>
                  </button>
                  
                  {/* Selected Indicator */}
                  {preferences.includes(cuisine.name) && (
                    <div className="absolute top-0 left-0 w-full h-full bg-orange-500/20 pointer-events-none" />
                  )}
                </div>
              ))}
            </div>
            
            {/* Cultural Info Section - Hidden by default, shown when info button clicked */}
            {["American", "Asian", "Caribbean", "Indian", "Latin", "Mediterranean"].map((cuisine) => (
              <div 
                key={`culture-info-${cuisine}`}
                id={`culture-info-${cuisine}`}
                className={`mt-2 p-4 bg-gray-100 rounded-lg hidden ${
                  selectedCuisine === cuisine ? 'block' : 'hidden'
                }`}
              >
                {selectedCuisine === cuisine && <CulturalInfo selectedCuisine={cuisine} user={user} />}
              </div>
            ))}
          </div>
            
          {/* Meal Type Selection with Image Thumbnails */}
          <div className="mb-8">
            <p className="text-base font-semibold text-gray-700 mb-3">
              Meal Type
            </p>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {[
                { name: "Breakfast", image: "/images/meals/breakfast.jpg" },
                { name: "Lunch", image: "/images/meals/lunch.jpg" },
                { name: "Dinner", image: "/images/meals/dinner.jpg" },
                { name: "Snack", image: "/images/meals/snack.jpg" }
              ].map((meal) => (
                <div 
                  key={meal.name} 
                  className={`relative rounded-lg overflow-hidden cursor-pointer transition-all transform hover:scale-105 ${
                    mealType === meal.name ? "ring-4 ring-teal-500" : ""
                  }`}
                  onClick={() => setMealType(meal.name)}
                >
                  {/* Meal Image */}
                  <div className="aspect-[4/3] bg-gray-200">
                    <img 
                      src={meal.image} 
                      alt={`${meal.name}`} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = "/placeholder.jpg";
                      }}
                    />
                  </div>
                  
                  {/* Meal Name Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="text-white font-medium">{meal.name}</p>
                  </div>
                  
                  {/* Selected Indicator */}
                  {mealType === meal.name && (
                    <div className="absolute top-0 left-0 w-full h-full bg-teal-500/20 pointer-events-none" />
                  )}
                </div>
              ))}
              
              {/* Full Day Option - Pro feature */}
              <div 
                className={`relative rounded-lg overflow-hidden ${
                  isPro ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-70"
                } transition-all transform ${
                  mealType === "Full Day" ? "ring-4 ring-teal-500" : ""
                }`}
                onClick={() => {
                  if (isPro) {
                    setMealType("Full Day");
                  }
                }}
              >
                {/* Meal Image */}
                <div className="aspect-[4/3] bg-gray-200">
                  <img 
                    src="/images/meals/full-day.jpg" 
                    alt="Full Day" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = "/placeholder.jpg";
                    }}
                  />
                  
                  {/* Pro Badge */}
                  {!isPro && (
                    <div className="absolute top-2 right-2 bg-teal-600 text-white text-xs px-2 py-1 rounded-full">
                      PRO
                    </div>
                  )}
                </div>
                
                {/* Meal Name Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="text-white font-medium">Full Day</p>
                </div>
                
                {/* Selected Indicator */}
                {mealType === "Full Day" && (
                  <div className="absolute top-0 left-0 w-full h-full bg-teal-500/20 pointer-events-none" />
                )}
              </div>
            </div>
            
            {/* Pro Feature Message */}
            {!isPro && (
              <p className="text-sm text-gray-600 mt-2">
                Full Day is a <strong>Pro feature</strong>.{" "}
                <span
                  className="text-blue-600 cursor-pointer hover:underline"
                  onClick={() => window.location.href = 'https://buy.stripe.com/aEU7tX2yi6YRe9W3cg'}
                >
                  Upgrade Now
                </span>
              </p>
            )}
          </div>
  
          {/* Pro Feature Indicator for numDays */}
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
  
          {/* Error Message */}
          {error && <p style={{ color: 'red' }}>{error}</p>}
  
          {/* Upgrade Now Button */}
          {!isPro && (
            <button
              onClick={() => window.location.href = 'https://buy.stripe.com/aEU7tX2yi6YRe9W3cg'}
              className="w-full py-2 px-4 mb-4 text-white bg-teal-600 rounded-lg hover:bg-teal-900 transition-colors text-lg font-medium"
            >
              Upgrade Now
            </button>
          )}
        </div>
        
        {/* Display Meal Plan */}
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
              // This function returns the user to the form view
              setMealPlan([]);
            }}
          />
        )}
        
        {showChatbot && (
          <ChatbotWindow
            user={user}
            preferences={preferences}
            mealType={mealType}
            isVisible={showChatbot}
            onClose={() => setShowChatbot(false)}
            onChatComplete={handleChatComplete}
            onMealPlanReady={() => setMealPlanReady(true)}
            mealPlanReady={mealPlanReady}
          />
        )}
      </main>
    </>
  );
}