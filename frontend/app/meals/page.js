"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken  } from "@auth0/nextjs-auth0"; 
import { Menu } from 'lucide-react';
import MealCard from "../../components/MealCard";

export default function Home() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [preferences, setPreferences] = useState('');
  const [mealType, setMealType] = useState('Full Day');
  const [numDays, setNumDays] = useState(1);
  const [carbs, setCarbs] = useState(0);
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [sugar, setSugar] = useState(0);
  const [fat, setFat] = useState(0);
  const [fiber, setFiber] = useState(0);
  const [mealPlan, setMealPlan] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [calculationMode ] = useState('auto');
  const [ingredients, setIngredients] = useState([]);  
  const [orderingPlanIngredients, setOrderingPlanIngredients] = useState(false);
  const { user, isLoading } = useUser();
  const isAuthenticated = !!user;
  const [isPro, setIsPro] = useState(false);
  const [manualInput, setManualInput] = useState(false);
  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const dietOptions = [
    "Asian",
    "Caribbean",
    "Clean", 
    "Keto", 
    "Mediterranean",
    "Paleo",
    "Vegan", 
    "Vegetarian",
  ];

  // Handle recipe selection/deselection
  const handleMealSelection = (id) => {
    console.log("Selection toggled for meal:", id);
    setSelectedRecipes(prevSelected => {
      if (prevSelected.includes(id)) {
        return prevSelected.filter(recipeId => recipeId !== id);
      } else {
        return [...prevSelected, id];
      }
    });
  };

    // 1. fetchMealPlan with updated Auth0 token retrieval
    const fetchMealPlan = async () => {
      try {
        setError('');
        setLoading(true);
        setSelectedRecipes([]);
        
        // Reset UI state
        setMealPlan([]); 
        setIngredients([]);
        setOrderingPlanIngredients(false);
        
        // Get the token using the client-side getAccessToken helper
        let accessToken;
        if (user) {
          try {
            // Updated Auth0 v4 token retrieval with audience parameter
            const token = await getAccessToken({
              authorizationParams: {
                audience: "https://grovli.citigrove.com/audience"
              }
            });
            accessToken = token;
            console.log("✅ Access token retrieved successfully");
          } catch (tokenError) {
            console.error("❌ Error retrieving access token:", tokenError);
          }
        }
        
        // Check API URL
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) {
          throw new Error("API URL is not defined. Check your environment variables.");
        }
        
        // Prepare headers
        const headers = {
          'Content-Type': 'application/json',
        };
        
        // Add authorization header if token exists
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }
        
        // Make request
        const response = await fetch(`${apiUrl}/mealplan/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            dietary_preferences: preferences.trim(),
            meal_type: mealType,
            num_days: numDays,
            carbs,
            calories,
            protein,
            sugar,
            fat,
            fiber,
          }),
        });
        
        // Handle HTTP errors
        if (!response.ok) {
          let errorDetail;
          try {
            const errorData = await response.json();
            errorDetail = errorData.detail || `HTTP error ${response.status}`;
          } catch (e) {
            errorDetail = `HTTP error ${response.status}`;
          }
          throw new Error(errorDetail);
        }
        
        // Parse response
        const data = await response.json();
        
        // Update state with meal plan data
        if (data && data.meal_plan) {
          setMealPlan(Array.isArray(data.meal_plan) ? data.meal_plan : []);
        } else {
          setMealPlan([]);
          throw new Error("Invalid API response format");
        }
      } catch (error) {
        console.error('Error fetching meal plan:', error);
        setError(`Error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

  // 2. fetchSubscriptionStatus with updated Auth0 token retrieval
  const fetchSubscriptionStatus = async () => {
    if (!user) return;

    try {
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
  };


  // 3. saveSelectedRecipes with updated Auth0 token retrieval
  const saveSelectedRecipes = async () => {
    if (!user) {
      console.warn("User is not authenticated. Redirecting to login.");
      // Updated login route without /api prefix
      router.push("/auth/login?returnTo=/dashboard");
      return;
    }

    if (!Array.isArray(mealPlan) || mealPlan.length === 0) {
      console.warn("Meal plan is empty.");
      alert("No meal plan available.");
      return;
    }

    const selectedMeals = mealPlan.filter((meal) => selectedRecipes.includes(meal.id));
    if (selectedMeals.length === 0) {
      console.warn("No meals selected.");
      alert("Please select at least one recipe to save.");
      return;
    }

    try {
      console.log("🔑 Attempting to retrieve access token...");
      
      // Updated Auth0 v4 token retrieval with audience parameter
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      if (!token) {
        console.error("🚨 Failed to retrieve access token.");
        alert("Session error. Please log in again.");
        router.push("/auth/login?returnTo=/dashboard");
        return;
      }

      console.log("📤 Sending selected meals to API");
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
        console.error("🚨 Unauthorized: Token may be expired.");
        alert("Session expired. Please log in again.");
        router.push("/auth/login?returnTo=/dashboard");
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "API request failed");
      }

      console.log("✅ Successfully saved recipes:", data);
      alert("Your recipes have been saved successfully!");
      setSelectedRecipes([]); // Clear selection after saving

    } catch (error) {
      console.error("❌ Error saving recipes:", error);
      setError("Failed to save recipes. Please try again later.");
    }
  };

  useEffect(() => {
    // Only fetch subscription status when user is loaded and authenticated
    if (!isLoading && user) {
      fetchSubscriptionStatus();
    }
  }, [user, isLoading]); // Re-run when user or isLoading changes
  
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
    const savedData = JSON.parse(localStorage.getItem("mealPlanInputs"));

    if (savedData) {
      setPreferences(savedData.preferences || '');
      setMealType(savedData.mealType || 'All');
      setNumDays(savedData.numDays || 1);
      setCarbs(savedData.carbs || 0);
      setCalories(savedData.calories || 0);
      setProtein(savedData.protein || 0);
      setSugar(savedData.sugar || 0);
      setFat(savedData.fat || 0);
      setFiber(savedData.fiber || 0);
      setMealPlan(savedData.mealPlan || []);
    }
  }, []);

  // 🔹 Save inputs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(
      "mealPlanInputs",
      JSON.stringify({
        preferences,
        mealType,
        numDays,
        carbs,
        calories,
        protein,
        sugar,
        fat,
        fiber,
        mealPlan
      })
    );
  }, [preferences, mealType, numDays, carbs, calories, protein, sugar, fat, fiber, mealPlan]);

  // Auto-calculate macros based on calories
  useEffect(() => {
    if (calculationMode === 'auto' && calories > 0) {
      if (preferences.toLowerCase().includes('keto')) {
        // Adjust macros for Keto
        const fatCalories = calories * 0.80; // 80% of calories for fat
        const proteinCalories = calories * 0.15; // 15% of calories for protein
        const carbCalories = calories * 0.05; // 5% of calories for carbs
  
        setFat(Math.round(fatCalories / 9)); // Fat in grams
        setProtein(Math.round(proteinCalories / 4)); // Protein in grams
        setCarbs(Math.round(carbCalories / 4)); // Carbs in grams
      } else {
        // Default macro calculation for non-Keto diets
        const proteinCalories = calories * 0.30; // 30% for protein
        const carbCalories = calories * 0.45; // 45% for carbs
        const fatCalories = calories * 0.25; // 25% for fat
  
        setProtein(Math.round(proteinCalories / 4));
        setCarbs(Math.round(carbCalories / 4));
        setFat(Math.round(fatCalories / 9));
      }
  
      // General calculations for fiber and sugar
      setFiber(Math.round((calories / 1000) * 14)); // 14g fiber per 1000 kcal
      setSugar(Math.round((calories * 0.10) / 4)); // 10% of calories for sugar
    } else if (calculationMode === 'manual') {
      // Reset values in manual mode
      setProtein(0);
      setCarbs(0);
      setFat(0);
      setFiber(0);
      setSugar(0);
    }
  }, [calories, calculationMode, preferences]);  
    
    const handleOrderPlanIngredients = async () => {
      if (!Array.isArray(mealPlan) || mealPlan.length === 0) {
        setError("No meal plan available to extract ingredients.");
        return;
      }

      try {
        setError("");
        setOrderingPlanIngredients(true);

        console.log("📢 Sending request to create shopping list...");

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/shopping_list/create_shopping_list/`, {
          method: "POST", // ✅ Ensure this is a POST request
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            meal_plan: JSON.stringify(mealPlan), // ✅ Ensure proper structure
            list_name: `Meal Plan - ${preferences}`
          }),
        });

        const data = await response.json();
        console.log("Full API Response:", data);

        if (!response.ok) {
          throw new Error(data.detail || "Failed to create shopping list.");
        }

        // ✅ Extract shopping list and URL
        const cleanedIngredients = data.shopping_list?.items?.map(item => item.description) || [];
        setIngredients(cleanedIngredients);

        // ✅ Redirect to Instacart
        const urlToOpen = data.redirect_url || data.shopping_list?.url;
        if (urlToOpen) {
          console.log("✅ Redirecting to:", urlToOpen);
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
      
    return ( 
      <>
        {/* Navigation Bar */}
        <nav className="fixed top-0 left-0 w-full py-3 px-4 bg-gray-500 bg-opacity-90 shadow-md z-50">            
          <div className="flex justify-between items-center max-w-6xl mx-auto">
            {/* Title with Link (Smaller Text) */}
            <div 
              className="text-white text-2xl font-bold cursor-pointer" 
              onClick={() => router.push('/')}
            >
              Grovli
            </div>
  
            {/* Mobile Navigation - Always Visible */}
            <div className="md:hidden relative mobile-menu">
              <button onClick={() => setMenuOpen(!menuOpen)} className="text-white">
                <Menu size={32} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg z-50">
                  <ul className="py-2 text-gray-900">
                    {!isAuthenticated ? (
                      <>
                        <li>
                          <button 
                            onClick={async() => { 
                              router.push('/api/auth/login'); 
                              setMenuOpen(false); 
                            }} 
                            className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
                          >
                            Login
                          </button>
                        </li>
                        <li>
                          <button 
                            onClick={async() => { 
                              router.push('/register'); 
                              setMenuOpen(false); 
                            }} 
                            className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
                          >
                            Register
                          </button>
                        </li>
                      </>
                    ) : (
                      <>
                        <li>
                          <button 
                            onClick={async() => { 
                              router.push('/subscriptions'); 
                              setMenuOpen(false); 
                            }} 
                            className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
                          >
                            Plans
                          </button>
                        </li>
                        <li>
                          <button 
                            onClick={async() => { 
                              router.push('/account'); 
                              setMenuOpen(false); 
                            }} 
                            className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
                          >
                            Account
                          </button>
                        </li>
                        <li>
                          <button 
                            onClick={() => {
                              router.push('/auth/logout');
                            }} 
                            className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
                          >
                            Logout
                          </button>
                        </li>
                      </>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </nav>
  
      {/* Full-screen white background */}
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
  
      {/* Main Content Container - Ensures content starts below navbar */}
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg w-full max-w-4xl flex-grow flex flex-col">
        {/* Plan Your Meals - main title */}
        <h2 className="text-2xl font-semibold text-gray-800 mb-6">
          Plan Your Meals
        </h2>

        {/* Dietary Preferences Section */}
        <div className="mb-8"> {/* Consistent mb-8 for all major sections */}
          {/* First subsection */}
          <p className="text-base font-semibold text-gray-700 mb-3"> {/* Same mb-3 for all subsection titles */}
            A Taste of…
          </p>
          <div className="flex flex-wrap gap-2 mb-6"> {/* All button groups have the same mb-6 */}
            {["Asian", "American", "Caribbean", "Mediterranean"].map((option) => (
              <button
                key={option}
                onClick={() => {
                  setPreferences((prev) => {
                    const preferencesArray = prev.split(" ").filter(Boolean);
                    const updatedPreferences = preferencesArray.filter((item) =>
                      !["Asian", "American", "Caribbean", "Mediterranean"].includes(item)
                    );

                    return [...updatedPreferences, option].join(" "); 
                  });
                }}
                className={`px-4 py-2 rounded-full border-2 ${
                  preferences.includes(option)
                    ? "bg-orange-500 text-white border-white" 
                    : "bg-gray-300 text-gray-700 border-white hover:bg-gray-400" 
                } transition-all`}
              >
                {option}
              </button>
            ))}
          </div>

          {/* Second subsection */}
          <p className="text-base font-semibold text-gray-700 mb-3"> {/* Same mb-3 for all subsection titles */}
            Your Eating Philosophy
          </p>
          <div className="flex flex-wrap gap-2"> {/* No bottom margin on last element */}
            {["Clean", "Keto", "Paleo", "Vegan", "Vegetarian"].map((option) => (
              <button
                key={option}
                onClick={() => {
                  setPreferences((prev) => {
                    const preferencesArray = prev.split(" ").filter(Boolean);
                    const updatedPreferences = preferencesArray.filter((item) =>
                      !["Clean", "Keto", "Paleo", "Vegan", "Vegetarian"].includes(item)
                    );

                    return [...updatedPreferences, option].join(" "); 
                  });
                }}
                className={`px-4 py-2 rounded-full border-2 ${
                  preferences.includes(option)
                    ? "bg-teal-500 text-white border-white" 
                    : "bg-gray-300 text-gray-700 border-white hover:bg-gray-400" 
                } transition-all`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Macro Calculation Mode */}
        <div className="mb-8"> {/* Consistent mb-8 for all major sections */}
          <p className="text-base font-semibold text-gray-700 mb-3"> {/* Same mb-3 for all section titles */}
            Macro Calculation Mode
          </p>

          <div className="flex items-center gap-4 mb-3"> {/* Consistent mb-3 for all button groups */}
            {/* Auto Mode - Default Selection */}
            <button 
              onClick={() => setCalculationMode("auto")}
              className={`px-4 py-2 rounded-full border-2 ${
                calculationMode === "auto"
                  ? "bg-teal-500 text-white border-teal-500"
                  : "bg-gray-200 text-gray-700 border-gray-300 hover:bg-gray-300"
              } transition-all`}
            >
              Auto
            </button>

            {/* Manual Mode - Disabled for Non-Pro Users */}
            <button 
              disabled={!isPro}
              onClick={() => isPro && setCalculationMode("manual")}
              className={`px-4 py-2 rounded-full border-2 ${
                isPro
                  ? calculationMode === "manual"
                    ? "bg-teal-500 text-white border-teal-500"
                    : "bg-gray-200 text-gray-700 border-gray-300 hover:bg-gray-300"
                  : "bg-gray-300 text-gray-500 border-gray-300 cursor-not-allowed"
              } transition-all`}
            >
              Manual
            </button>
          </div>

          {/* Pro Feature Message - same spacing for all pro messages */}
          {!isPro && (
            <p className="text-sm text-gray-600">
              Manual mode is a <strong>Pro feature</strong>.{" "}
              <span
                className="text-blue-600 cursor-pointer hover:underline"
                onClick={() => router.push('/subscriptions')}
              >
                Upgrade Now
              </span>
            </p>
          )}
        </div>

        {/* Meal Type Selection */}
        <div className="mb-8"> {/* Consistent mb-8 for all major sections */}
          <p className="text-base font-semibold text-gray-700 mb-3"> {/* Same mb-3 for all section titles */}
            Meal Type
          </p>

          <div className="flex flex-wrap gap-2"> {/* No bottom margin on last element */}
            {["Full Day", "Breakfast", "Lunch", "Dinner", "Snack"].map((option) => (
              <button
                key={option}
                onClick={() => setMealType(option)}
                className={`px-4 py-2 rounded-full border-2 ${
                  mealType === option 
                    ? "bg-teal-500 text-white border-white" 
                    : "bg-gray-200 text-gray-700 border-white hover:bg-gray-300" 
                } transition-all`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

            {/* Number of Days Selection */}
            <div className="mb-8"> {/* Keep consistent mb-8 spacing */}
              <p className="text-base font-semibold text-gray-700 mb-3">
                Number of Days
              </p>

              <div className="flex flex-wrap gap-2 mb-3">
                {[1, 3, 5, 7].map((option) => (
                  <button
                    key={option}
                    onClick={() => isPro ? setNumDays(option) : setNumDays(1)}
                    className={`px-4 py-2 rounded-full border-2 transition-all ${
                      numDays === option
                        ? "bg-teal-500 text-white border-white" 
                        : "bg-gray-200 text-gray-700 border-white hover:bg-gray-300" 
                    } ${!isPro && option !== 1 ? "opacity-50 cursor-not-allowed" : ""}`}
                    disabled={!isPro && option !== 1}
                  >
                    {option} {option === 1 ? "Day" : "Days"}
                  </button>
                ))}
              </div>

              {/* Pro Feature Message */}
              {!isPro && (
                <p className="text-sm text-gray-600">
                  Days over 1 is a <strong>Pro feature</strong>.{" "}
                  <span
                    className="text-blue-600 cursor-pointer hover:underline"
                    onClick={() => router.push('/subscriptions')}
                  >
                    Upgrade Now
                  </span>
                </p>
              )}
            </div>
                
            {/* Calorie & Macro Selection Section - REDUCED spacing */}
            <div className="mb-4"> {/* Reduced from mb-8 to mb-4 to bring closer to macros */}
              <p className="text-base font-semibold text-gray-700 mb-3">
                Set Your Daily Calories
              </p>

              <div className="flex items-center space-x-4">
                <input 
                  type="range" 
                  min="1000" 
                  max="4000" 
                  step="50" 
                  value={calories} 
                  onChange={(e) => setCalories(Number(e.target.value))}
                  className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-lg font-semibold text-gray-800 min-w-16 text-right">
                  {calories} kcal
                </span>
              </div>
            </div>

            {/* Macros Section - Add a small top spacing */}
            {calories > 0 && (
              <div className="mb-8 mt-2"> {/* Added mt-2 for a small gap */}
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Macronutrients</h3>

                {/* Carbs Slider */}
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-medium mb-2">Carbs (g/day)</label>
                  <div className="flex items-center space-x-4">
                    <input 
                      type="range" 
                      min="0" 
                      max="600" 
                      step="1" 
                      value={carbs} 
                      onChange={(e) => isPro && setCarbs(Number(e.target.value))}
                      disabled={!isPro}
                      className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                        ${isPro ? "bg-gray-300" : "bg-gray-200 cursor-not-allowed"}`}
                    />
                    <span className="text-gray-800 font-medium min-w-12 text-right">{carbs} g</span>
                  </div>
                </div>
  
                {/* Protein Slider */}
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-medium">Protein (g/day)</label>
                  <div className="flex items-center space-x-4">
                    <input 
                      type="range" 
                      min="0" 
                      max="300" 
                      step="1" 
                      value={protein} 
                      onChange={(e) => isPro && setProtein(Number(e.target.value))}
                      disabled={!isPro}
                      className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                        ${isPro ? "bg-gray-300" : "bg-gray-200 cursor-not-allowed"}`}
                    />
                    <span className="text-gray-800 font-medium">{protein} g</span>
                  </div>
                </div>
  
                {/* Fat Slider */}
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-medium">Fat (g/day)</label>
                  <div className="flex items-center space-x-4">
                    <input 
                      type="range" 
                      min="0" 
                      max="200" 
                      step="1" 
                      value={fat} 
                      onChange={(e) => isPro && setFat(Number(e.target.value))}
                      disabled={!isPro}
                      className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                        ${isPro ? "bg-gray-300" : "bg-gray-200 cursor-not-allowed"}`}
                    />
                    <span className="text-gray-800 font-medium">{fat} g</span>
                  </div>
                </div>
  
                {/* Fiber Slider */}
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-medium">Fiber (g/day)</label>
                  <div className="flex items-center space-x-4">
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="1" 
                      value={fiber} 
                      onChange={(e) => isPro && setFiber(Number(e.target.value))}
                      disabled={!isPro}
                      className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                        ${isPro ? "bg-gray-300" : "bg-gray-200 cursor-not-allowed"}`}
                    />
                    <span className="text-gray-800 font-medium">{fiber} g</span>
                  </div>
                </div>
  
                {/* Sugar Slider */}
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-medium">Sugar (g/day limit)</label>
                  <div className="flex items-center space-x-4">
                    <input 
                      type="range" 
                      min="0" 
                      max="200" 
                      step="1" 
                      value={sugar} 
                      onChange={(e) => isPro && setSugar(Number(e.target.value))}
                      disabled={!isPro}
                      className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                        ${isPro ? "bg-gray-300" : "bg-gray-200 cursor-not-allowed"}`}
                    />
                    <span className="text-gray-800 font-medium">{sugar} g</span>
                  </div>
                </div>
              </div>
            )}
  
            {/* Error Message */}
            {error && <p style={{ color: 'red' }}>{error}</p>}
  
            {/* Upgrade Now Button */}
            <button
              onClick={() => router.push('/subscriptions')}  // Redirect to subscriptions page
              className="w-full py-2 px-4 mb-4 text-white bg-teal-600 rounded-lg hover:bg-teal-900 transition-colors text-lg font-medium"
            >
              Upgrade Now
            </button>
  
            {/* Generate Free Plan - Now a Text Button */}
            <div className="flex justify-center mt-2">
              <p
                onClick={fetchMealPlan}
                className="text-teal-600 text-lg cursor-pointer font-bold"
              >
                {loading ? "Loading..." : "Generate Free Plan"}
              </p>
            </div>

            {/* Display Meal Plan */}
            {Array.isArray(mealPlan) && mealPlan.length > 0 && (
              <div className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {mealPlan.map((meal, index) => (
                    <MealCard
                      key={index}
                      id={meal.id}
                      title={meal?.title || "Untitled Meal"}
                      nutrition={meal?.nutrition || {
                        calories: 0,
                        protein: 0,
                        carbs: 0,
                        fat: 0,
                        fiber: 0,
                        sugar: 0
                      }}
                      imageUrl={meal.imageUrl}
                      ingredients={meal?.ingredients || []}
                      instructions={meal?.instructions || "No instructions provided."}
                      onSelect={handleMealSelection}
                      isSelected={selectedRecipes.includes(meal.id)}
                    />
                  ))}
                </div>

                {/* This div adds consistent spacing */}
                <div className="mt-6"> 
                  {/* Save Selected Recipes Button - appears only when recipes are selected */}
                  {selectedRecipes.length > 0 && (
                    <button
                      onClick={saveSelectedRecipes}
                      className="w-full py-2 px-4 mb-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-all"
                    >
                      Save Meals ({selectedRecipes.length})
                    </button>
                  )}

                  {/* Order Plan Ingredients Button */}
                  <button
                    onClick={handleOrderPlanIngredients}
                    disabled={loading || orderingPlanIngredients}
                    className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-800 text-white font-bold rounded-lg"
                  >
                    {orderingPlanIngredients ? "Processing..." : "Order Ingredients"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
  
        {/* Footer - Sticks to bottom without pushing content behind */}
        <footer className="fixed bottom-0 left-0 w-full bg-gray-500 text-white text-center py-3 text-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center px-4">
            <div className="font-semibold">© {new Date().getFullYear()} Grovli</div>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <a href="/about" className="hover:text-gray-300 transition-colors">About</a>
              <a href="https://form.typeform.com/to/r6ucQF6l" className="hover:text-gray-300 transition-colors">Contact</a>
              <a href="/terms" className="hover:text-gray-300 transition-colors">Terms</a>
              <a href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</a>
            </div>
          </div>
        </footer>
      </>
    );
  }