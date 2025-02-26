"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import MealCard from "../../components/mealcard";
import { useUser } from "@auth0/nextjs-auth0"; 
import { getAccessToken } from "@auth0/nextjs-auth0";


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


  // useEffect(() => {
  //   const fetchSubscriptionStatus = async () => {
  //     if (!user) return;

  //     try {
        // const { accessToken } = await getAccessToken({
        //   authorizationParams: {
        //     audience: "https://grovli.citigrove.com/audience", 
        //     scope: "openid profile email read:users update:users update:users_app_metadata read:app_metadata"
        //   }
        // });

        // console.log("Retrieved Access Token:", accessToken);

        // if (!accessToken) {
        //   throw new Error("Failed to retrieve access token.");
        // }

      //   // ✅ Decode JWT and check the app_metadata
      //   const tokenPayload = JSON.parse(atob(accessToken.split(".")[1])); // Decode JWT payload
      //   console.log("Decoded Token Payload:", tokenPayload);

      //   // ✅ Ensure metadata is correctly set
      //   const userSubscription = tokenPayload?.["https://dev-rw8ff6vxgb7t0i4c.us.auth0.com/app_metadata"]?.subscription;
      //   setIsPro(userSubscription === "pro");

      // } catch (err) {
      //   console.error("Error fetching subscription status:", err);
      // }
  //   };

  //   if (!isLoading) {
  //     fetchSubscriptionStatus();
  //   }
  // }, [user, isLoading]);
  
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

const fetchMealPlan = async () => {
  try {
    setError('');
    setLoading(true);

    const tokenResponse = await getAccessToken(); 
    const token = tokenResponse?.accessToken || "";

    const { accessToken } = await getAccessToken();

    // const { accessToken } = await getAccessToken({
    //   authorizationParams: {
    //     audience: "https://grovli.citigrove.com/audience",
    //     scope: "openid profile email read:users update:users update:users_app_metadata read:app_metadata"        
    //   }
    // });
    
    // if (!accessToken) {
    //   throw new Error("Failed to retrieve access token.");
    // }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mealplan/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`   
      },      
      body: JSON.stringify({
        dietary_preferences: preferences.trim(),
        meal_type: mealType,
        num_days: numDays,
        carbs: carbs,
        calories: calories,
        protein: protein,
        sugar: sugar,
        fat: fat,
        fiber: fiber,
      }),
    });

    const data = await response.json();
    console.log("API Response:", data); // Debugging output

    if (!response.ok) {
      throw new Error(data.detail || 'API request failed');
    }

    // Ensure mealPlan is correctly updated
    setMealPlan(Array.isArray(data.meal_plan) ? data.meal_plan : []);
    console.log("Meal Plan Data After Set:", data.meal_plan); // ✅ Confirming state update
  } catch (error) {
    console.error('Error:', error);
    setError(error.message);
  } finally {
    setLoading(false);
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
                            onClick={async() => { 
                              localStorage.removeItem("token"); // Log out
                              setIsAuthenticated(false);
                              router.push('/api/auth/login');
                              setMenuOpen(false); 
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
          
          {/* Dietary Preferences Section */}
          <div className="mb-6">
            <label className="block text-xl font-semibold text-gray-800 mb-2">
              Plan Your Meals
            </label>

            {/* Dietary Preferences - Teal Color */}
            <p className="text-md font-semibold text-gray-700 mb-1">Dietary Preferences</p>
            <div className="flex flex-wrap gap-2 mb-3">
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
                      : "bg-gray-200 text-gray-700 border-white hover:bg-gray-300" 
                  } transition-all`}
                >
                  {option}
                </button>
              ))}
            </div>

            {/* Culture Preferences - Orange Color */}
            <p className="text-md font-semibold text-gray-700 mb-1">Cultural Preferences</p>
            <div className="flex flex-wrap gap-2">
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
                      : "bg-gray-200 text-gray-700 border-white hover:bg-gray-300" 
                  } transition-all`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
  
            {/* Macro Calculation Mode */}
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-800 mb-2">
                Macro Calculation Mode
              </label>
  
              <div className="flex items-center space-x-4">
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
  
              {/* Pro Feature Message */}
              {!isPro && (
                <p className="text-sm text-gray-600 mt-2">
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
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-800 mb-2">
                Meal Type
              </label>

              <div className="flex flex-wrap gap-2">
                {["Full Day", "Breakfast", "Lunch", "Dinner", "Snack"].map((option) => (
                  <button
                    key={option}
                    onClick={() => setMealType(option)}
                    className={`px-4 py-2 rounded-full border-2 ${
                      mealType === option 
                        ? "bg-teal-500 text-white border-white" // Selected: Teal background, white border
                        : "bg-gray-200 text-gray-700 border-white hover:bg-gray-300" // Unselected: Gray background, white border
                    } transition-all`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Number of Days Selection */}
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-800 mb-2">
                Number of Days
              </label>

              <div className="flex flex-wrap gap-2">
                {[1, 3, 5, 7].map((option) => (
                  <button
                    key={option}
                    onClick={() => isPro ? setNumDays(option) : setNumDays(1)}
                    className={`px-4 py-2 rounded-full border-2 transition-all ${
                      numDays === option
                        ? "bg-teal-500 text-white border-white" // Selected: Teal background, white border
                        : "bg-gray-200 text-gray-700 border-white hover:bg-gray-300" // Unselected: Gray background, white border
                    } ${!isPro && option !== 1 ? "opacity-50 cursor-not-allowed" : ""}`}
                    disabled={!isPro && option !== 1}
                  >
                    {option} {option === 1 ? "Day" : "Days"}
                  </button>
                ))}
              </div>

              {/* Pro Feature Message */}
              {!isPro && (
                <p className="text-sm text-gray-600 mt-2">
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
              
            {/* Calorie & Macro Selection Section */}
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-800 mb-2">
                Set Your Daily Calories
              </label>
  
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
                <span className="text-lg font-semibold text-gray-800">
                  {calories} kcal
                </span>
              </div>
            </div>
  
            {/* Macros - Only Show When Calories are Set */}
            {calories > 0 && (
              <div className="mt-4">
                <h3 className="text-md font-semibold text-gray-700 mb-2">Macronutrients</h3>
  
                {/* Carbs Slider */}
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-medium">Carbs (g/day)</label>
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
                    <span className="text-gray-800 font-medium">{carbs} g</span>
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
                      ingredients={meal?.ingredients || []}
                      instructions={meal?.instructions || "No instructions provided."}
                    />
                  ))}
                </div>
  
                {/* Accept Meal Plan Button */}
                <button
                  onClick={handleOrderPlanIngredients}
                  disabled={loading || orderingPlanIngredients}
                  className="w-full py-2 px-4 mt-6 bg-teal-600 hover:bg-teal-800 text-white font-bold rounded-lg"
                >
                  {orderingPlanIngredients ? "Processing..." : "Order Plan Ingredients"}
                </button>
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