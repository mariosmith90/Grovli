"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { useMealGeneration } from '../../contexts/MealGenerationContext';
import MealCard, { MealPlanDisplay } from '../../components/mealcard';
import ChatbotWindow from '../../components/chatbot';
import CulturalInfo from '../../components/culturalinfo';
import SearchBox from '../../components/searchbox'

export default function Home() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [preferences, setPreferences] = useState('');
  const [mealType, setMealType] = useState('Breakfast');
  const [numDays, setNumDays] = useState(1);
  const [mealPlan, setMealPlan] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ingredients, setIngredients] = useState([]);  
  const [orderingPlanIngredients, setOrderingPlanIngredients] = useState(false);
  const { user, isLoading } = useUser();
  const [isPro, setIsPro] = useState(false);
  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const [showChatbot, setShowChatbot] = useState(false);
  const [mealPlanReady, setMealPlanReady] = useState(false);
  const [displayedMealType, setDisplayedMealType] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState('');
  const [mealAlgorithm, setMealAlgorithm] = useState('experimental');

  const { 
    isGenerating, 
    setIsGenerating,
    mealGenerationComplete,
    setMealGenerationComplete,
    currentMealPlanId,
    setCurrentMealPlanId,
    setBackgroundTaskId,
    startTaskChecking
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

  useEffect(() => {
    if (typeof window !== 'undefined' && isGenerating) {
      window.mealLoading = true;
    }
  }, [isGenerating]);

  useEffect(() => {
    setGlobalSettings((prev) => ({
      ...prev,
      calories: globalSettings.calories,
    }));
  }, [calories]);

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

  useEffect(() => {
    const savedData = JSON.parse(localStorage.getItem("mealPlanInputs"));
    if (savedData) {
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
      setGlobalSettings(savedSettings);
      setCalories(savedSettings.calories || 2400);
    }
    
    if (user && user.sub) {
      const fetchUserSettings = async () => {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          const response = await fetch(`${apiUrl}/user-settings/${user.sub}`);
          
          if (response.ok) {
            const serverSettings = await response.json();
            console.log("Loaded server settings on meal plan page:", serverSettings);
            setGlobalSettings(serverSettings);
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
  
  useEffect(() => {
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

  const fetchSubscriptionStatus = async () => {
    if (!user) return;
  
    try {
      if (user.sub === "auth0|67b82eb657e61f81cdfdd503") {
        setIsPro(true);
        console.log("✅ Special user detected - Pro features enabled");
        return;
      }
  
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      if (!token) {
        throw new Error("Failed to retrieve access token.");
      }
  
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

  const handleMealSelection = (id) => {
    setSelectedRecipes(prevSelected => {
      if (prevSelected.includes(id)) {
        return prevSelected.filter(recipeId => recipeId !== id);
      } else {
        return [...prevSelected, id];
      }
    });
  };

  const fetchMealPlan = async () => {
    if (!isPro && mealType === 'Full Day') {
      setMealType('Breakfast');
    }
  
    setIsGenerating(true);
    setMealGenerationComplete(false);
    setCurrentMealPlanId(null);
    setError('');
    setLoading(true);
    
    try {
      setSelectedRecipes([]);
      setShowChatbot(true);
      setMealPlanReady(false);
      setMealPlan([]);
      setIngredients([]);
      setOrderingPlanIngredients(false);
  
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
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const headers = { 'Content-Type': 'application/json' };
      
      if (user?.sub) {
        headers['user-id'] = user.sub;
        
        try {
          const token = await getAccessToken({
            authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
          });
          if (token) headers['Authorization'] = `Bearer ${token}`;
        } catch (tokenError) {
          console.error("Error retrieving access token:", tokenError);
        }
      }
      
      console.log("Sending meal plan request to:", `${apiUrl}/mealplan/`);
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
          pantry_ingredients: pantryIngredients
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || 
          errorData.detail || 
          `HTTP error ${response.status}`
        );
      }
      
      const data = await response.json();
      console.log("API Response Data:", data);
  
      // Case 1: Immediate meal plan data
      if (data.meal_plan && Array.isArray(data.meal_plan)) {
        console.log("Received immediate meal plan");
        setMealPlan(data.meal_plan);
        setDisplayedMealType(mealType);
        setShowChatbot(false);
        setIsGenerating(false);
        setMealGenerationComplete(true);
        return;
      }
      
      // Case 2: Background processing response
      if (data.status === "processing" && data.meal_plan_id) {
        console.log("Meal plan processing in background");
        setCurrentMealPlanId(data.meal_plan_id);
        
        // Use request_hash if available, otherwise fallback to meal_plan_id
        const taskIdentifier = data.request_hash || data.meal_plan_id;
        setBackgroundTaskId(taskIdentifier);
        startTaskChecking(taskIdentifier);
        return;
      }
      
      // Case 3: Unexpected response format
      console.error("Unexpected API response format:", data);
      throw new Error(
        `Invalid API response format. Expected either:
         - meal_plan array, or
         - processing status with meal_plan_id
         Received: ${JSON.stringify(data, null, 2)}`
      );
      
    } catch (error) {
      console.error('Error fetching meal plan:', error);
      setError(`Error: ${error.message}`);
      setShowChatbot(false);
      setIsGenerating(false);
      
      // Optional: Show more detailed error to user in development
      if (process.env.NODE_ENV === 'development') {
        setError(`Error: ${error.message}\n\nResponse: ${JSON.stringify(error.response?.data, null, 2)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChatComplete = async () => {
    setShowChatbot(false);
    
    if (mealPlanReady && currentMealPlanId && (!mealPlan || !mealPlan.length)) {
      try {
        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        const response = await fetch(`${apiUrl}/mealplan/by_id/${currentMealPlanId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.meal_plan) {
          setMealPlan(Array.isArray(data.meal_plan) ? data.meal_plan : []);
          setDisplayedMealType(mealType);
          setIsGenerating(false);
          setMealGenerationComplete(true);
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const showMealCards = params.get('showMealCards');
      
      if (showMealCards === 'true' && mealGenerationComplete) {
        // If we have a stored mealPlanId, load that meal plan
        if (currentMealPlanId && (!mealPlan || mealPlan.length === 0)) {
          const fetchMealPlanById = async () => {
            try {
              setLoading(true);
              const apiUrl = process.env.NEXT_PUBLIC_API_URL;
              const response = await fetch(`${apiUrl}/mealplan/by_id/${currentMealPlanId}`);
              
              if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
              }
              
              const data = await response.json();
              
              if (data && data.meal_plan) {
                setMealPlan(Array.isArray(data.meal_plan) ? data.meal_plan : []);
                setDisplayedMealType(mealType);
                setShowChatbot(false);
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
        } else if (Array.isArray(savedData?.mealPlan) && savedData.mealPlan.length > 0) {
          // If we have a saved meal plan in localStorage, use that
          setMealPlan(savedData.mealPlan);
          setDisplayedMealType(savedData.displayedMealType || savedData.mealType);
          setShowChatbot(false);
        }
      }
      
      // Clean up the URL after we've processed the parameter
      if (showMealCards) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [currentMealPlanId, mealGenerationComplete]);

  useEffect(() => {
    if (!isLoading && user) {
      // Add this line to make user ID available globally
      if (typeof window !== 'undefined' && user.sub) {
        window.userId = user.sub;
      }
      
      checkOnboardingStatus().then((onboardingComplete) => {
        if (!onboardingComplete) {
          console.log("User has not completed onboarding, redirecting...");
          router.push('/onboarding');
        } else {
          fetchSubscriptionStatus().then(() => {
            loadUserProfileData();
          });
        }
      });
    }
  }, [user, isLoading]);

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
      setSelectedRecipes([]);
    } catch (error) {
      console.error("❌ Error saving recipes:", error);
      setError("Failed to save recipes. Please try again later.");
    }
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

      const cleanedIngredients = data.shopping_list?.items?.map(item => item.description) || [];
      setIngredients(cleanedIngredients);

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

  useEffect(() => {
    const savedSettings = JSON.parse(localStorage.getItem('globalMealSettings') || '{}');
    if (savedSettings.mealAlgorithm) {
      setMealAlgorithm(savedSettings.mealAlgorithm);
    } else {
      const savedAlgorithm = localStorage.getItem('mealAlgorithm');
      if (savedAlgorithm) {
        setMealAlgorithm(savedAlgorithm);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user && user.sub && !mealGenerationComplete && showChatbot) {
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
              setMealGenerationComplete(true);
              setCurrentMealPlanId(data.meal_plan_id);
              setIsGenerating(false);
            }
          }
        } catch (error) {
          console.error("Error checking meal plan status:", error);
        }
      };
      
      checkMealPlanStatus();
      const intervalId = setInterval(checkMealPlanStatus, 5000);
      return () => clearInterval(intervalId);
    }
  }, [user, mealGenerationComplete, showChatbot]);

  useEffect(() => {
    if (!isLoading && user) {
      fetchSubscriptionStatus();
    }
  }, [user, isLoading]);
  
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
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.generateMeals = fetchMealPlan;
      window.mealLoading = isGenerating;
      
      return () => {
        window.generateMeals = undefined;
        window.mealLoading = undefined;
      };
    }
  }, [fetchMealPlan, isGenerating]);

  useEffect(() => {
    window.saveSelectedRecipes = saveSelectedRecipes;
    return () => {
      window.saveSelectedRecipes = undefined;
    };
  }, [saveSelectedRecipes]);

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
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
  
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
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
  
          <div className="mb-8">
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
                  
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="text-white font-medium">{cuisine.name}</p>
                  </div>
                  
                  <button 
                    className="absolute top-2 right-2 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-800 hover:bg-white transition-colors shadow-md z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCuisine(cuisine.name);
                      document.getElementById(`culture-info-${cuisine.name}`).classList.toggle('hidden');
                    }}
                    aria-label={`Information about ${cuisine.name} cuisine`}
                  >
                    <span className="text-sm font-semibold">i</span>
                  </button>
                  
                  {preferences.includes(cuisine.name) && (
                    <div className="absolute top-0 left-0 w-full h-full bg-orange-500/20 pointer-events-none" />
                  )}
                </div>
              ))}
            </div>
            
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
                  
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="text-white font-medium">{meal.name}</p>
                  </div>
                  
                  {mealType === meal.name && (
                    <div className="absolute top-0 left-0 w-full h-full bg-teal-500/20 pointer-events-none" />
                  )}
                </div>
              ))}
              
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
                <div className="aspect-[4/3] bg-gray-200">
                  <img 
                    src="/images/meals/full-day.jpg" 
                    alt="Full Day" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = "/placeholder.jpg";
                    }}
                  />
                  
                  {!isPro && (
                    <div className="absolute top-2 right-2 bg-teal-600 text-white text-xs px-2 py-1 rounded-full">
                      PRO
                    </div>
                  )}
                </div>
                
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="text-white font-medium">Full Day</p>
                </div>
                
                {mealType === "Full Day" && (
                  <div className="absolute top-0 left-0 w-full h-full bg-teal-500/20 pointer-events-none" />
                )}
              </div>
            </div>
            
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