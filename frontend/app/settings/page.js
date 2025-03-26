"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Info as InfoIcon, 
  AlertTriangle as AlertTriangleIcon, 
  Settings as SettingsIcon, 
  Target as TargetIcon, 
  Leaf as LeafIcon, 
  Pizza as PizzaIcon, 
  Scale as ScaleIcon, 
  CircleCheck as CircleCheckIcon, 
  CircleAlert as CircleAlertIcon,
  LogOut
} from 'lucide-react';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";

export default function GlobalSettingsComprehensive() {
  const router = useRouter();
  const { user } = useUser();
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

// Global Settings State
const [calculationMode, setCalculationMode] = useState('auto');
const [calories, setCalories] = useState(2400);
const [carbs, setCarbs] = useState(270);
const [protein, setProtein] = useState(180);
const [fat, setFat] = useState(67);
const [fiber, setFiber] = useState(34);
const [sugar, setSugar] = useState(60);
const [dietaryPhilosophy, setDietaryPhilosophy] = useState('');
const [mealAlgorithm, setMealAlgorithm] = useState('experimental');
const [showCalorieInfo, setShowCalorieInfo] = useState(false);
const [showPhilosophyInfo, setShowPhilosophyInfo] = useState(false);
const [resetConfirmed, setResetConfirmed] = useState(false);
const [activeSection, setActiveSection] = useState('general');

  // Dietary philosophy options with icons and descriptions
  const philosophyOptions = [
    {
      name: "Clean",
      description: "Whole, minimally processed foods with maximum nutrients",
      icon: <LeafIcon className="w-6 h-6 text-green-600" />
    },
    {
      name: "Keto", 
      description: "High-fat, low-carb approach to metabolic health",
      icon: <ScaleIcon className="w-6 h-6 text-blue-600" />
    },
    {
      name: "Paleo",
      description: "Eating like our hunter-gatherer ancestors",
      icon: <CircleCheckIcon className="w-6 h-6 text-orange-600" />
    },
    {
      name: "Vegan",
      description: "Plant-based nutrition focusing on ethical eating",
      icon: <CircleAlertIcon className="w-6 h-6 text-purple-600" />
    },
    {
      name: "Vegetarian",
      description: "Plant-focused diet with flexible protein sources",
      icon: <LeafIcon className="w-6 h-6 text-teal-600" />
    }
  ];

  // Sections for navigation with icons
  const sections = [
    { 
      id: 'general', 
      label: 'General Settings', 
      icon: <SettingsIcon className="w-5 h-5 mr-2" />
    },
    { 
      id: 'calories', 
      label: 'Calorie Target', 
      icon: <TargetIcon className="w-5 h-5 mr-2" />
    },
    { 
      id: 'philosophy', 
      label: 'Dietary Philosophy', 
      icon: <LeafIcon className="w-5 h-5 mr-2" />
    },
    { 
      id: 'macros', 
      label: 'Macronutrients', 
      icon: <PizzaIcon className="w-5 h-5 mr-2" />
    },
    { 
      id: 'reset', 
      label: 'Profile Reset', 
      icon: <CircleAlertIcon className="w-5 h-5 mr-2 text-red-500" />
    }
  ];

  // Fetch Subscription Status
  const fetchSubscriptionStatus = async () => {
    if (!user) return;

    try {
      // Predefined list of special user IDs with pro access
      const proUserIds = [
        "auth0|67b82eb657e61f81cdfdd503",
        // Add other special user IDs here if needed
      ];

      // Check for specific user ID with special access
      if (proUserIds.includes(user.sub)) {
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
      
      // Multiple ways to check for pro status
      const userSubscription = 
        tokenPayload?.["https://dev-rw8ff6vxgb7t0i4c.us.auth0.com/app_metadata"]?.subscription ||
        tokenPayload?.subscription ||
        tokenPayload?.['https://grovli.com/subscription'];

      // Set pro status based on subscription
      setIsPro(userSubscription === "pro");

      // Additional logging for debugging
      console.log("User Subscription Status:", userSubscription);
      console.log("Pro Status:", userSubscription === "pro");
    } catch (err) {
      console.error("Error fetching subscription status:", err);
      
      // Fallback for special users or debugging
      const proUserIds = [
        "auth0|67b82eb657e61f81cdfdd503",
        // Add other special user IDs here if needed
      ];
      
      if (proUserIds.includes(user?.sub)) {
        setIsPro(true);
        console.log("✅ Fallback: Special user detected - Pro features enabled");
      }
    }
  };

  // Macro Adjustment Function 
  const adjustMacrosForMealType = (caloriesValue) => {
    const proteinCalories = caloriesValue * 0.30; // 30% for protein
    const carbCalories = caloriesValue * 0.45; // 45% for carbs
    const fatCalories = caloriesValue * 0.25; // 25% for fat

    return {
      protein: Math.round(proteinCalories / 4),
      carbs: Math.round(carbCalories / 4),
      fat: Math.round(fatCalories / 9),
      fiber: Math.round((caloriesValue / 1000) * 14),
      sugar: Math.round((caloriesValue * 0.10) / 4)
    };
  };

  // Save settings to both localStorage and server
  const saveSettings = async () => {
    if (!user) {
      setError("You must be logged in to save settings");
      return;
    }

    try {
      setIsSaving(true);
      setError("");
      setSaveSuccess(false);

      // Get the access token
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });

      if (!token) {
        throw new Error("Failed to get access token");
      }

      // Validate the settings before sending to API
      if (calories < 1000 || calories > 5000) {
        setError("Calories must be between 1000 and 5000");
        setIsSaving(false);
        return;
      }

      // Prepare the settings object
      const settingsData = {
        user_id: user.sub,
        calculationMode,
        calories,
        carbs,
        protein,
        fat,
        fiber,
        sugar,
        dietaryPhilosophy,
        mealAlgorithm
      };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      // Save the user settings
      const response = await fetch(`${apiUrl}/user-settings/${user.sub}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settingsData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error ${response.status}`);
      }

      // Update localStorage with these settings
      localStorage.setItem('globalMealSettings', JSON.stringify(settingsData));

      // Also update the separate mealAlgorithm localStorage item for backward compatibility
      localStorage.setItem('mealAlgorithm', mealAlgorithm);
      
      // Show success message
      setSaveSuccess(true);
      
      // If resetConfirmed is true, reset onboarding and redirect
      if (resetConfirmed) {
        await handleResetOnboarding(token, apiUrl);
        return;
      }
      
      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
      
    } catch (error) {
      console.error("Error in saveSettings:", error);
      setError(`Failed to save settings: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset onboarding process
  const handleResetOnboarding = async (token, apiUrl) => {
    try {
      const resetUrl = `${apiUrl}/user-profile/reset-onboarding/${user.sub}`;
      
      const resetResponse = await fetch(resetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (resetResponse.ok) {
        // Clear any cached onboarding state data
        localStorage.removeItem('onboardingStatus');
        localStorage.removeItem('onboardingCompleted');
        localStorage.removeItem('onboardingData');
        
        // Set a flag to indicate we're coming from reset
        localStorage.setItem('comingFromReset', 'true');
        
        // Redirect to onboarding
        setTimeout(() => {
          window.location.href = `${window.location.origin}/onboarding?forceReset=true&t=${Date.now()}`;
        }, 1500);
      } else {
        throw new Error("Failed to reset onboarding");
      }
    } catch (error) {
      console.error("Error resetting onboarding:", error);
      // Fallback redirect
      window.location.href = '/onboarding?forceReset=true';
    }
  };

  // Handle logout
  const handleLogout = () => {
    router.push('/auth/logout');
  };

  // Render macro sliders
  const renderMacroSliders = () => {
    const macroSliders = [
      { 
        label: 'Carbs (g/day)', 
        value: carbs, 
        setter: setCarbs, 
        min: 0, 
        max: 600 
      },
      { 
        label: 'Protein (g/day)', 
        value: protein, 
        setter: setProtein, 
        min: 0, 
        max: 300 
      },
      { 
        label: 'Fat (g/day)', 
        value: fat, 
        setter: setFat, 
        min: 0, 
        max: 200 
      },
      { 
        label: 'Fiber (g/day)', 
        value: fiber, 
        setter: setFiber, 
        min: 0, 
        max: 100 
      },
      { 
        label: 'Sugar (g/day limit)', 
        value: sugar, 
        setter: setSugar, 
        min: 0, 
        max: 200 
      }
    ];

    return (
      <div className="space-y-4">
        {macroSliders.map((macro) => (
          <div key={macro.label}>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              {macro.label}
            </label>
            <div className="flex items-center space-x-4">
              <input 
                type="range" 
                min={macro.min}
                max={macro.max}
                step="1" 
                value={macro.value} 
                disabled={!isPro || calculationMode === 'auto'}
                onChange={(e) => macro.setter(Number(e.target.value))}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                  ${(!isPro || calculationMode === 'auto') 
                    ? "bg-gray-200 cursor-not-allowed" 
                    : "bg-gray-300 cursor-pointer"}`}
              />
              <span className="text-gray-800 font-medium min-w-12 text-right">
                {macro.value} g
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

// Add this useEffect near the top of your component, after other state declarations
useEffect(() => {
  // Load settings from localStorage first
  const savedSettings = JSON.parse(localStorage.getItem('globalMealSettings') || '{}');
  
  // Also load meal algorithm from localStorage
  const savedAlgorithm = localStorage.getItem('mealAlgorithm');
  
  if (Object.keys(savedSettings).length > 0) {
    // Update state with localStorage settings
    setCalculationMode(savedSettings.calculationMode || 'auto');
    setCalories(savedSettings.calories || 2400);
    setCarbs(savedSettings.carbs || 270);
    setProtein(savedSettings.protein || 180);
    setFat(savedSettings.fat || 67);
    setFiber(savedSettings.fiber || 34);
    setSugar(savedSettings.sugar || 60);
    setDietaryPhilosophy(savedSettings.dietaryPhilosophy || '');
    // Set meal algorithm if present in settings
    if (savedSettings.mealAlgorithm) {
      setMealAlgorithm(savedSettings.mealAlgorithm);
    } else if (savedAlgorithm) {
      // Fallback to separate localStorage item
      setMealAlgorithm(savedAlgorithm);
    }
  } else if (savedAlgorithm) {
    // If no settings but algorithm exists
    setMealAlgorithm(savedAlgorithm);
  }
  
  // If user is authenticated, fetch settings from server
  if (user && user.sub) {
    const fetchUserSettings = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        const response = await fetch(`${apiUrl}/user-settings/${user.sub}`);
        
        if (response.ok) {
          const serverSettings = await response.json();
          console.log("Loaded server settings:", serverSettings);
          
          // Update state with server settings
          setCalculationMode(serverSettings.calculationMode || 'auto');
          setCalories(serverSettings.calories || 2400);
          setCarbs(serverSettings.carbs || 270);
          setProtein(serverSettings.protein || 180);
          setFat(serverSettings.fat || 67);
          setFiber(serverSettings.fiber || 34);
          setSugar(serverSettings.sugar || 60);
          setDietaryPhilosophy(serverSettings.dietaryPhilosophy || '');
          
          // Set meal algorithm if present in server settings
          if (serverSettings.mealAlgorithm) {
            setMealAlgorithm(serverSettings.mealAlgorithm);
          }
          
          // Update localStorage with server settings
          localStorage.setItem('globalMealSettings', JSON.stringify(serverSettings));
          
          // Also update the separate mealAlgorithm localStorage item for backward compatibility
          if (serverSettings.mealAlgorithm) {
            localStorage.setItem('mealAlgorithm', serverSettings.mealAlgorithm);
          }
        }
      } catch (error) {
        console.error("Error fetching user settings:", error);
      }
    };
    
    fetchUserSettings();
  }
}, [user]);

  // Calculate macros when calories change
  useEffect(() => {
    if (calculationMode === 'auto' && calories > 0) {
      const { protein, carbs, fat, fiber, sugar } = adjustMacrosForMealType(calories);

      setProtein(protein);
      setCarbs(carbs);
      setFat(fat);
      setFiber(fiber);
      setSugar(sugar);
    }
  }, [calories, calculationMode]);

  // Fetch subscription status when user changes
  useEffect(() => {
    if (user) {
      fetchSubscriptionStatus();
    }
  }, [user]);

  // Render section content
  const renderSectionContent = () => {
    switch(activeSection) {
      case 'general':
        return (
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
              <SettingsIcon className="w-7 h-7 mr-3 text-teal-600" /> 
              General Settings
            </h2>
            
            {/* Calculation Mode */}
            <div className="bg-white shadow-md rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">
                Calculation Mode
              </h3>
              <div className="flex space-x-4">
                <button 
                  className={`flex-1 py-3 rounded-lg transition-all ${
                    calculationMode === 'auto' 
                      ? 'bg-teal-500 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() => setCalculationMode('auto')}
                >
                  Auto Calculation
                </button>
                <button 
                  className={`flex-1 py-3 rounded-lg transition-all ${
                    calculationMode === 'manual' 
                      ? 'bg-teal-500 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } ${!isPro ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => isPro && setCalculationMode('manual')}
                >
                  Manual Adjustment
                </button>
              </div>
              {!isPro && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Manual mode is a Pro feature. 
                  <span 
                    className="text-teal-600 ml-1 cursor-pointer hover:underline"
                    onClick={() => window.location.href = 'https://buy.stripe.com/aEU7tX2yi6YRe9W3cg'}
                  >
                    Upgrade Now
                  </span>
                </p>
              )}
            </div>
            
            {/* Meal Algorithm Selection */}
            <div className="bg-white shadow-md rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">
                Meal Algorithm
              </h3>
              <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                <div className="relative inline-block w-[200px] h-10">
                  <div className="absolute inset-0 bg-gray-200 rounded-full"></div>
                  
                  {/* Sliding background for active state */}
                  <div 
                    className={`absolute top-0 bottom-0 w-1/2 bg-teal-500 rounded-full transition-all duration-300 ease-in-out ${
                      mealAlgorithm === 'pantry' ? 'left-0' : 'left-1/2'
                    }`}
                  ></div>
                  
                  {/* Toggle buttons */}
                  <div className="relative flex h-full">
                    <button
                      onClick={() => setMealAlgorithm('pantry')}
                      className={`flex-1 text-sm rounded-full flex items-center justify-center transition-colors ${
                        mealAlgorithm === 'pantry' ? 'text-white font-medium' : 'text-gray-600'
                      }`}
                    >
                      Pantry
                    </button>
                    <button
                      onClick={() => setMealAlgorithm('experimental')}
                      className={`flex-1 text-sm rounded-full flex items-center justify-center transition-colors ${
                        mealAlgorithm === 'experimental' ? 'text-white font-medium' : 'text-gray-600'
                      }`}
                    >
                      Experimental
                    </button>
                  </div>
                </div>
                
                <div className="flex-1">
                  <p className="text-sm text-gray-700">
                    {mealAlgorithm === 'pantry' 
                      ? "Generate meals based on what's in your pantry"
                      : "Discover new and creative meal ideas" 
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'calories':
        return (
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
              <TargetIcon className="w-7 h-7 mr-3 text-teal-600" /> 
              Calorie Target
            </h2>
            <div className="bg-white shadow-md rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-lg font-medium text-gray-700">
                  Daily Calorie Goal
                </span>
                <span className="text-2xl font-bold text-teal-600">
                  {calories} kcal
                </span>
              </div>
              <input 
                type="range" 
                min="1000" 
                max="4000" 
                step="50" 
                value={calories}
                onChange={(e) => setCalories(Number(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-2">
                <span>1000</span>
                <span>4000</span>
              </div>
            </div>
          </div>
        );
      case 'philosophy':
        return (
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
              <LeafIcon className="w-7 h-7 mr-3 text-teal-600" /> 
              Dietary Philosophy
            </h2>
            <div className="bg-white shadow-md rounded-xl p-6">
              <div className="flex items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-700 flex-grow">
                  Choose Your Eating Philosophy
                </h3>
                <button 
                  onClick={() => setShowPhilosophyInfo(!showPhilosophyInfo)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <InfoIcon className="w-5 h-5" />
                </button>
              </div>

              {showPhilosophyInfo && (
                <div className="bg-blue-50 p-3 rounded-lg mb-4 text-sm text-blue-800">
                  Select a dietary philosophy that aligns with your nutritional goals. 
                  This will help customize your meal plans and recommendations.
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {philosophyOptions.map((philosophy) => (
                  <button
                    key={philosophy.name}
                    onClick={() => setDietaryPhilosophy(
                      dietaryPhilosophy === philosophy.name ? '' : philosophy.name
                    )}
                    className={`p-4 rounded-lg border-2 transition-all flex items-center space-x-3 ${
                      dietaryPhilosophy === philosophy.name
                        ? 'bg-teal-50 border-teal-500 text-teal-800'
                        : 'bg-gray-100 border-transparent text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {philosophy.icon}
                    <div className="text-left">
                      <span className="font-semibold">{philosophy.name}</span>
                      <p className="text-xs text-gray-500 mt-1">
                        {philosophy.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'macros':
        return (
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
              <PizzaIcon className="w-7 h-7 mr-3 text-teal-600" /> 
              Macronutrients
            </h2>
            <div className="bg-white shadow-md rounded-xl p-6">
              {renderMacroSliders()}
              {!isPro && (
                <div className="mt-4 text-sm text-gray-500 text-center">
                  Detailed macro adjustments are a Pro feature. 
                  <span 
                    className="text-teal-600 ml-1 cursor-pointer hover:underline"
                    onClick={() => window.location.href = 'https://buy.stripe.com/aEU7tX2yi6YRe9W3cg'}
                  >
                    Upgrade Now
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      case 'reset':
        return (
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-bold text-red-800 flex items-center">
              <CircleAlertIcon className="w-7 h-7 mr-3 text-red-500" />
              Profile Reset
            </h2>
            <div className="bg-white shadow-md rounded-xl p-6 border-2 border-red-100">
              <div className="flex items-start mb-4">
                <AlertTriangleIcon className="w-8 h-8 text-red-500 mr-3 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-red-800">
                    Reset Onboarding Process
                  </h3>
                  <p className="text-sm text-red-600 mt-2">
                    This action will restart your onboarding process. Your existing meal plans and recipes will remain untouched.
                  </p>
                </div>
              </div>

              <div className="bg-red-50 p-4 rounded-lg mb-4">
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={resetConfirmed}
                    onChange={() => setResetConfirmed(!resetConfirmed)}
                    className="form-checkbox h-5 w-5 text-red-600 rounded focus:ring-red-500"
                  />
                  <span className="ml-3 text-sm text-red-700">
                    I understand this will reset my profile preferences and require me to complete onboarding again.
                  </span>
                </label>
              </div>

              <button
                onClick={saveSettings}
                disabled={!resetConfirmed || isSaving}
                className={`w-full py-3 rounded-lg transition-all ${
                  resetConfirmed && !isSaving
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSaving ? 'Resetting...' : 'Reset Profile'}
              </button>

              {error && (
                <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg text-center">
                  {error}
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6border-nonew-full max-w-4xl flex-grow flex flex-col">
          {/* Page Title Section */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-xl font-semibold text-gray-800">Account Settings</h1>
          </div>
  
          {/* Rest of the existing grid layout */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar Navigation */}
            <div className="md:col-span-1 bg-white shadow-md rounded-xl p-4">
              <nav className="space-y-2">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center p-3 rounded-lg transition-all ${
                      activeSection === section.id
                        ? 'bg-teal-50 text-teal-600'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {section.icon}
                    {section.label}
                  </button>
                ))}
              </nav>
            </div>
  
            {/* Main Content Area */}
            <div className="md:col-span-3">
              {renderSectionContent()}
              
              {/* Save and Logout Buttons */}
              {activeSection !== 'reset' && (
                <div className="mt-6 space-y-3">
                  <button
                    onClick={saveSettings}
                    disabled={isSaving}
                    className="w-full py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                  >
                    {isSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                  
                  {/* Logout Button */}
                  <button
                    onClick={handleLogout}
                    className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </button>
                </div>
              )}
  
              {/* Success Message */}
              {saveSuccess && (
                <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg text-center">
                  Settings saved successfully!
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}