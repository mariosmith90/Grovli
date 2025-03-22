"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import Header from '../../components/header';
import Footer from '../../components/footer';

export default function GlobalSettings() {
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
  const [showCalorieInfo, setShowCalorieInfo] = useState(false);
  const [showPhilosophyInfo, setShowPhilosophyInfo] = useState(false);
  const [resetOnboarding, setResetOnboarding] = useState(false);
  const [showResetInfo, setShowResetInfo] = useState(false);

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

  // Calorie Range Calculation Function
  const getCalorieRange = () => {
    return { 
      min: 1000, 
      max: 4000, 
      step: 50 
    };
  };

  // Handle dietary philosophy change
  const handleDietaryPhilosophyChange = (philosophy) => {
    // If the same philosophy is clicked, remove it
    if (dietaryPhilosophy === philosophy) {
      setDietaryPhilosophy('');
    } else {
      // Otherwise, set the new philosophy
      setDietaryPhilosophy(philosophy);
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

  // Reset onboarding status
  const resetOnboardingStatus = async () => {
    if (!user) return false;
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      const response = await fetch(`${apiUrl}/user-profile/reset-onboarding/${user.sub}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to reset onboarding status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error("Error resetting onboarding status:", error);
      return false;
    }
  };

  // Load settings from localStorage and server
  useEffect(() => {
    // First load default settings from localStorage as a fallback
    const savedSettings = JSON.parse(localStorage.getItem('globalMealSettings') || '{}');
    if (savedSettings) {
      setCalculationMode(savedSettings.calculationMode || 'auto');
      setCalories(savedSettings.calories || 2400);
      setCarbs(savedSettings.carbs || 270);
      setProtein(savedSettings.protein || 180);
      setFat(savedSettings.fat || 67);
      setFiber(savedSettings.fiber || 34);
      setSugar(savedSettings.sugar || 60);
      setDietaryPhilosophy(savedSettings.dietaryPhilosophy || '');
    }
    
    // If user is authenticated, fetch their settings from server
    if (user && user.sub) {
      const fetchUserSettings = async () => {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          const response = await fetch(`${apiUrl}/user-settings/${user.sub}`);
          
          if (response.ok) {
            const serverSettings = await response.json();
            console.log("Loaded server settings:", serverSettings);
            setCalculationMode(serverSettings.calculationMode);
            setCalories(serverSettings.calories);
            setCarbs(serverSettings.carbs);
            setProtein(serverSettings.protein);
            setFat(serverSettings.fat); 
            setFiber(serverSettings.fiber);
            setSugar(serverSettings.sugar);
            setDietaryPhilosophy(serverSettings.dietaryPhilosophy || '');
            
            // Also update localStorage with these settings
            localStorage.setItem('globalMealSettings', JSON.stringify(serverSettings));
          }
        } catch (error) {
          console.error("Error fetching user settings:", error);
        }
      };
      
      fetchUserSettings();
    }
  }, [user]);

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
        calculationMode,
        calories,
        carbs,
        protein,
        fat,
        fiber,
        sugar,
        dietaryPhilosophy
      };
  
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      console.log("API URL:", apiUrl);
      
      // Step 1: Save the user settings
      console.log("Saving user settings...");
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
  
      console.log("Settings saved successfully!");
      
      // Update localStorage with these settings
      localStorage.setItem('globalMealSettings', JSON.stringify(settingsData));
      
      // Show success message
      setSaveSuccess(true);
      
      // Step 2: If reset onboarding is selected, call the reset endpoint
      if (resetOnboarding) {
        console.log("Reset onboarding flag is ON, attempting to reset...");
        
        // The full URL to the reset-onboarding endpoint
        const resetUrl = `${apiUrl}/user-profile/reset-onboarding/${user.sub}`;
        console.log("Reset endpoint URL:", resetUrl);
        
        try {
          const resetResponse = await fetch(resetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          // Log the response for debugging
          console.log("Reset response status:", resetResponse.status);
          
          if (resetResponse.ok) {
            const resetData = await resetResponse.json();
            console.log("Reset successful:", resetData);
            
            // Clear any cached onboarding state data
            localStorage.removeItem('onboardingStatus');
            localStorage.removeItem('onboardingCompleted');
            localStorage.removeItem('onboardingData');
            
            // Show success message before redirecting
            setSaveSuccess(true);
            
            // Set a flag to indicate we're coming from reset
            localStorage.setItem('comingFromReset', 'true');
            
            // Use a short delay to show the success message
            setTimeout(() => {
              console.log("Executing redirect to onboarding...");
              
              // Force a hard refresh to the onboarding page with a query parameter
              // This ensures we get fresh data from the server instead of using cached data
              window.location.href = `${window.location.origin}/onboarding?reset=true&t=${Date.now()}`;
            }, 1000);
          } else {
            console.error("Reset endpoint returned error:", resetResponse.status);
            
            // Try to log more details about the error
            try {
              const errorText = await resetResponse.text();
              console.error("Error details:", errorText);
            } catch (e) {
              console.error("Could not get error details", e);
            }
            
            // Still try to redirect even if there's an error
            setSaveSuccess(true);
            setTimeout(() => {
              console.log("Redirecting to onboarding despite reset error...");
              window.location.href = '/onboarding?reset=true';
            }, 1000);
          }
        } catch (resetError) {
          console.error("Error calling reset endpoint:", resetError);
          
          // Still try to redirect even if there's an exception
          setSaveSuccess(true);
          setTimeout(() => {
            console.log("Redirecting to onboarding despite exception...");
            window.location.href = '/onboarding?reset=true';
          }, 1000);
        }
        
        // Important: return early to prevent further execution
        return;
      }
      
      // Only hide success message after 3 seconds if not redirecting
      setTimeout(() => setSaveSuccess(false), 3000);
      
    } catch (error) {
      console.error("Error in saveSettings:", error);
      setError(`Failed to save settings: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate macros when calories change
  useEffect(() => {
    if (calculationMode === 'auto' && calories > 0) {
      const { protein, carbs, fat, fiber, sugar } = adjustMacrosForMealType(
        calories
      );

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

  return (
    <>
      <Header />
      
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg w-full max-w-4xl flex-grow flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-semibold text-gray-800">
              Global Meal Settings
            </h2>
          </div>

          {/* Manual Mode Section */}
          <div className="mb-8">
            <p className="text-xl font-semibold text-gray-700 mb-3">
              Macro Calculation Mode
            </p>

            <div className="flex items-center gap-4 mb-3">
              {/* Auto Mode - Default Selection */}
              <button 
                onClick={() => setCalculationMode("auto")}
                className={`px-4 py-2 rounded-full border-2 ${
                  calculationMode === "auto"
                    ? "bg-teal-500 text-white border-white"
                    : "bg-gray-200 text-gray-700 border-white hover:bg-gray-300"
                } transition-all`}
              >
                Auto
              </button>

              {/* Manual Mode - Enabled for Pro Users */}
              <button 
                onClick={() => {
                  if (isPro) {
                    setCalculationMode("manual");
                  }
                }}
                className={`px-4 py-2 rounded-full border-2 ${
                  isPro
                    ? calculationMode === "manual"
                      ? "bg-teal-500 text-white border-white"
                      : "bg-gray-200 text-gray-700 border-white hover:bg-gray-300"
                    : "bg-gray-200 text-gray-500 border-white cursor-not-allowed"
                } transition-all`}
              >
                Manual
              </button>
            </div>

            {/* Pro Feature Message - Only show if not pro */}
            {!isPro && (
              <p className="text-sm text-gray-600">
                Manual mode is a <strong>Pro feature</strong>.{" "}
                <span
                  className="text-blue-600 cursor-pointer hover:underline"
                  onClick={() => window.location.href = 'https://buy.stripe.com/aEU7tX2yi6YRe9W3cg'}
                >
                  Upgrade Now
                </span>
              </p>
            )}
          </div>

        {/* Dietary Philosophy Section */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            Your Eating Philosophy
            <button 
              onClick={() => setShowPhilosophyInfo(!showPhilosophyInfo)}
              className="ml-2 text-gray-500 focus:outline-none"
              aria-label="Show information about eating philosophy"
            >
              <Info className="w-6 h-6" />
            </button>
          </h3>
          
          {/* Info message that toggles based on state */}
          {showPhilosophyInfo && (
            <div className="text-sm text-gray-600 bg-gray-100 p-2 rounded-md mb-3">
              This will be applied to all your meal plans.
            </div>
          )}
          
          <div className="flex flex-wrap gap-2">
            {["Clean", "Keto", "Paleo", "Vegan", "Vegetarian"].map((option) => (
              <button
                key={option}
                onClick={() => handleDietaryPhilosophyChange(option)}
                className={`px-4 py-2 rounded-full border-2 ${
                  dietaryPhilosophy === option
                    ? "bg-teal-500 text-white border-white" 
                    : "bg-gray-300 text-gray-700 border-white hover:bg-gray-400" 
                } transition-all`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>


        {/* Calories Slider */}
        <div className="mb-8">
        <p className="text-xl font-semibold text-gray-700 mb-3 flex items-center">
          Calorie Target
          <button 
            onClick={() => setShowCalorieInfo(!showCalorieInfo)}
            className="ml-2 text-gray-500 focus:outline-none"
            aria-label="Show information about calorie targets"
          >
            <Info className="w-6 h-6" />
          </button>
        </p>

        {/* Info message that toggles based on state */}
        {showCalorieInfo && (
          <div className="text-sm text-gray-600 bg-gray-100 p-2 rounded-md mb-3">
            Changes to calorie target will affect your meal generation results.
          </div>
        )}

        <div className="flex items-center space-x-4">
            <input 
              type="range" 
              min={getCalorieRange().min} 
              max={getCalorieRange().max} 
              step={getCalorieRange().step} 
              value={calories} 
              disabled={false} // Always enable calorie adjustment
              onChange={(e) => {
                  const newCalories = Number(e.target.value);
                  setCalories(newCalories);
                  
                  // In auto mode, macros will be adjusted automatically via the useEffect
                  // In manual mode for pro users, we adjust here
                  if (calculationMode === 'manual' && isPro) {
                  const { protein, carbs, fat, fiber, sugar } = adjustMacrosForMealType(
                      newCalories
                  );
                  
                  setProtein(protein);
                  setCarbs(carbs);
                  setFat(fat);
                  setFiber(fiber);
                  setSugar(sugar);
                  }
              }}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-300"
            />
            <span className="text-lg font-semibold text-gray-800 min-w-16 text-right">
            {calories} kcal
            </span>
        </div>
        </div>

          {/* Macro Sliders Section */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-gray-700 mb-3">
              Macronutrients
            </h3>

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
                  disabled={!isPro || calculationMode === 'auto'}
                  onChange={(e) => setCarbs(Number(e.target.value))}
                  className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                    ${(!isPro || calculationMode === 'auto') 
                      ? "bg-gray-200 cursor-not-allowed" 
                      : "bg-gray-300 cursor-pointer"}`}
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
                  disabled={!isPro || calculationMode === 'auto'}
                  onChange={(e) => setProtein(Number(e.target.value))}
                  className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                    ${(!isPro || calculationMode === 'auto') 
                      ? "bg-gray-200 cursor-not-allowed" 
                      : "bg-gray-300 cursor-pointer"}`}
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
                  disabled={!isPro || calculationMode === 'auto'}
                  onChange={(e) => setFat(Number(e.target.value))}
                  className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                    ${(!isPro || calculationMode === 'auto') 
                      ? "bg-gray-200 cursor-not-allowed" 
                      : "bg-gray-300 cursor-pointer"}`}
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
                  disabled={!isPro || calculationMode === 'auto'}
                  onChange={(e) => setFiber(Number(e.target.value))}
                  className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                    ${(!isPro || calculationMode === 'auto') 
                      ? "bg-gray-200 cursor-not-allowed" 
                      : "bg-gray-300 cursor-pointer"}`}
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
                  disabled={!isPro || calculationMode === 'auto'}
                  onChange={(e) => setSugar(Number(e.target.value))}
                  className={`w-full h-2 rounded-lg appearance-none cursor-pointer 
                    ${(!isPro || calculationMode === 'auto') 
                      ? "bg-gray-200 cursor-not-allowed" 
                      : "bg-gray-300 cursor-pointer"}`}
                />
                <span className="text-gray-800 font-medium">{sugar} g</span>
              </div>
            </div>
          </div>

          {/* Reset Onboarding Toggle Section */}
          <div className="mb-8 border-t pt-6 border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                Reset Onboarding
                <button 
                  onClick={() => setShowResetInfo(!showResetInfo)}
                  className="ml-2 text-gray-500 focus:outline-none"
                  aria-label="Show information about resetting onboarding"
                >
                  <Info className="w-6 h-6" />
                </button>
              </h3>
              
              <label className="inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={resetOnboarding}
                  onChange={() => setResetOnboarding(!resetOnboarding)}
                  className="sr-only peer" 
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
              </label>
            </div>
            
            {/* Info message that toggles based on state */}
            {showResetInfo && (
              <div className="text-sm text-gray-600 bg-gray-100 p-3 rounded-md mb-3">
                Turning this on will reset your onboarding status. After saving your settings, you will be redirected to complete the onboarding process again. This is useful if you want to change your meal preferences or health goals.
              </div>
            )}
            
            {resetOnboarding && (
              <p className="text-sm text-orange-600 mt-2">
                <strong>Note:</strong> When you save your settings, you will be redirected to complete the onboarding process again.
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg text-center">
              {error}
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-center mt-6">
            <button
              onClick={saveSettings}
              disabled={isSaving}
              className="w-full max-w-md py-3 px-6 text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-colors text-lg font-medium shadow-md"
            >
              {isSaving ? "Saving..." : resetOnboarding ? "Save & Restart Onboarding" : "Save Settings"}
            </button>
          </div>
          
          {/* Success Message */}
          {saveSuccess && (
            <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg text-center">
              {resetOnboarding 
                ? "Settings saved successfully! Redirecting to onboarding..."
                : "Settings saved successfully!"}
            </div>
          )}
          
          {/* Upgrade Now Button for non-Pro users */}
          {!isPro && (
            <div className="mt-8">
              <button
                onClick={() => window.location.href = 'https://buy.stripe.com/aEU7tX2yi6YRe9W3cg'}
                className="w-full py-2 px-4 text-white bg-teal-600 rounded-lg hover:bg-teal-900 transition-colors text-lg font-medium"
              >
                Upgrade Now for Full Customization
              </button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}