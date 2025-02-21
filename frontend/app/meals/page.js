"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import MealCard from "../features/mealcard";
import { useUser } from "@auth0/nextjs-auth0"; 
import { getAccessToken } from "@auth0/nextjs-auth0";


export default function Home() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [preferences, setPreferences] = useState('');
  const [mealType, setMealType] = useState('All');
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
  const [calculationMode ] = useState('auto'); // 'manual' or 'auto'
  const [ingredients, setIngredients] = useState([]);  
  const [orderingPlanIngredients, setOrderingPlanIngredients] = useState(false);
  const { user, isLoading } = useUser();
  const isAuthenticated = !!user;
  
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
          <nav className="fixed top-0 left-0 w-full p-6 bg-gray-500 bg-opacity-90 shadow-md z-50">            
            <div className="flex justify-between items-center max-w-7xl mx-auto">
              {/* Title with Link */}
              <div 
                className="text-white text-5xl font-bold cursor-pointer" 
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

            {/* Push Content Below Fixed Header */}
            <div className="pt-24"></div>
              {/* Background Image */}
              <div 
                className="fixed inset-0 z-0 min-h-screen"
                style={{
                  backgroundImage: `url('/homepage.jpeg')`, 
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat'
                }}
              >
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/50" />
              </div>

              <main className="relative z-10 p-6 max-w-4xl mx-auto min-h-screen flex flex-col justify-center">
                <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg w-full">     
                  {/* Section Header */}
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '15px' }}>
                  Customize Meal Plan
                </h2>
              {/* Dietary Preferences */}
              <div style={{ marginBottom: '10px' }}>
                <label>
                  <strong>Dietary Preferences:</strong>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Vegetarian, Vegan"
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                />
              </div>

              {/* Calculation Mode Toggle */}
              <div style={{ marginBottom: '10px' }}>
                <label>
                  <strong>Macro Calculation Mode:</strong>
                </label>
                <select
                  value="auto"
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginTop: '5px',
                    backgroundColor: '#f0f0f0', // Greyed out
                    color: '#888', // Text color to indicate disabled
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'not-allowed', // Prevents selection
                  }}
                >
                  <option value="auto">Auto</option>
                </select>

                {/* Pro Feature Message */}
                <p className="text-sm text-gray-600 mt-1">
                  Manual mode is a <strong>Pro feature</strong>.{" "}
                  <span
                    className="text-blue-600 cursor-pointer hover:underline"
                    onClick={() => router.push('/subscriptions')}
                  >
                    Upgrade Now
                  </span>
                </p>
              </div>

              {/* Meal Type Dropdown */}
              <div style={{ marginBottom: '10px' }}>
                <label>
                  <strong>Meal Type:</strong>
                </label>
                <select
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value)}
                  style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                >
                  <option value="All">All (Breakfast, Lunch, Dinner, 2 Snacks)</option>
                  <option value="Breakfast">Breakfast</option>
                  <option value="Lunch">Lunch</option>
                  <option value="Dinner">Dinner</option>
                  <option value="Snack">Snack</option>
                </select>
              </div>

              {/* Number of Days */}
              <div style={{ marginBottom: '10px' }}>
                <label>
                  <strong>Number of Days:</strong>
                </label>
                <select
                  value="1"
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginTop: '5px',
                    backgroundColor: '#f0f0f0', // Greyed out
                    color: '#888', // Text color to indicate disabled
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'not-allowed', // Prevents selection
                  }}
                >
                  <option value="1">1</option>
                </select>

                {/* Pro Feature Message */}
                <p className="text-sm text-gray-600 mt-1">
                  Days over 1 is a <strong>Pro feature</strong>.{" "}
                  <span
                    className="text-blue-600 cursor-pointer hover:underline"
                    onClick={() => router.push('/subscriptions')}
                  >
                    Upgrade Now
                  </span>
                </p>
              </div>

              {/* Calories */}
              <div style={{ marginBottom: '10px' }}>
                <label>
                  <strong>Calories (daily total):</strong>
                </label>
                <input
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                />
              </div>

              {/* Auto-calculated or manual input fields */}
              <div style={{ marginBottom: '10px' }}>
                <label>
                  <strong>Carbs (grams per day):</strong>
                </label>
                <input
                  type="number"
                  value={carbs}
                  onChange={(e) => setCarbs(Number(e.target.value))}
                  disabled={calculationMode === 'auto'}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    marginTop: '5px',
                    backgroundColor: calculationMode === 'auto' ? '#f0f0f0' : 'white' 
                  }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label>
                  <strong>Protein (grams per day):</strong>
                </label>
                <input
                  type="number"
                  value={protein}
                  onChange={(e) => setProtein(Number(e.target.value))}
                  disabled={calculationMode === 'auto'}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    marginTop: '5px',
                    backgroundColor: calculationMode === 'auto' ? '#f0f0f0' : 'white' 
                  }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label>
                  <strong>Fat (grams per day):</strong>
                </label>
                <input
                  type="number"
                  value={fat}
                  onChange={(e) => setFat(Number(e.target.value))}
                  disabled={calculationMode === 'auto'}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    marginTop: '5px',
                    backgroundColor: calculationMode === 'auto' ? '#f0f0f0' : 'white' 
                  }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label>
                  <strong>Fiber (grams per day):</strong>
                </label>
                <input
                  type="number"
                  value={fiber}
                  onChange={(e) => setFiber(Number(e.target.value))}
                  disabled={calculationMode === 'auto'}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    marginTop: '5px',
                    backgroundColor: calculationMode === 'auto' ? '#f0f0f0' : 'white' 
                  }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label>
                  <strong>Sugar (grams per day limit):</strong>
                </label>
                <input
                  type="number"
                  value={sugar}
                  onChange={(e) => setSugar(Number(e.target.value))}
                  disabled={calculationMode === 'auto'}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    marginTop: '5px',
                    backgroundColor: calculationMode === 'auto' ? '#f0f0f0' : 'white' 
                  }}
                />
              </div>

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

            {console.log("Meal Plan Data in Render:", mealPlan)}

            {/* Display Meal Plan */}
            {Array.isArray(mealPlan) && mealPlan.length > 0 && (
              <div className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {mealPlan.map((meal, index) => (
                    <MealCard
                      key={index}
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
        <div className="w-full h-32"></div> {/* Empty box for future content */}
        <footer className="fixed bottom-0 left-0 right-0 z-30 w-full bg-gray-500 text-white text-center py-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center px-6">
            {/* Left - Branding */}
            <div className="text-lg font-semibold">© {new Date().getFullYear()} Grovli</div>
            
            {/* Middle - Links */}
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
