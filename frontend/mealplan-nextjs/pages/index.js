import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export default function Home() {
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
  const [calculationMode, setCalculationMode] = useState('manual'); // 'manual' or 'auto'
  const [ingredients, setIngredients] = useState([]);  
  const [acceptingMealPlan, setAcceptingMealPlan] = useState(false);

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
      setMealPlan('');
      setLoading(true);
  
      if (!preferences.trim()) {
        throw new Error('Please enter your dietary preferences');
      }
  
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mealplan/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  
      if (!response.ok) {
        throw new Error(data.detail || 'API request failed');
      }
  
      // Update state with adjusted macros from backend
      setCarbs(data.adjusted_macros.carbs);
      setProtein(data.adjusted_macros.protein);
      setFat(data.adjusted_macros.fat);
      setFiber(data.adjusted_macros.fiber);
  
      setMealPlan(data.meal_plan);
    } catch (error) {
      console.error('Error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptMealPlan = async () => {
    if (!mealPlan.trim()) {
        setError("No meal plan available to extract ingredients.");
        return;
    }

    try {
        setError("");
        setAcceptingMealPlan(true);
        
        console.log("📢 Sending request to create shopping list...");
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mealplan/create_shopping_list/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                meal_plan: mealPlan,
                list_name: `Meal Plan - ${preferences}`
            }),
        });

        const data = await response.json();
        console.log("Full API Response:", data);

        if (!response.ok) {
            throw new Error(data.detail || "Failed to create shopping list.");
        }

        const cleanedIngredients = data.shopping_list?.items?.map(item => item.description) || [];
        setIngredients(cleanedIngredients);
        
        const urlToOpen = data.redirect_url || data.shopping_list?.url;
        if (urlToOpen) {
            console.log("✅ Redirecting to:", urlToOpen);
            window.open(urlToOpen, "_blank", "noopener,noreferrer");
        } else {
            console.error("No URL found in API response.");
            throw new Error("No URL found in API response.");
        }
    } catch (error) {
        console.error("Error:", error);
        setError(error.message);
    } finally {
        setAcceptingMealPlan(false);
    }    
  };
  
return (
  <div className="relative min-h-screen w-full bg-gray-900 overflow-hidden">
    {/* Background Image */}
    <div 
      className="fixed inset-0 z-0"
      style={{
        backgroundImage: `url('/background.jpeg')`, 
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" />
    </div>

    {/* Main Content */}
    <div className="relative z-10 p-6 font-sans max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-8">Grovli AI (Beta)</h1>

      {/* Form Container */}
      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg">
        {/* Dietary Preferences */}
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-1">
            Dietary Preferences:
          </label>
          <input
            type="text"
            placeholder="e.g., Vegetarian, Vegan"
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Calculation Mode Toggle */}
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-1">
            Macro Calculation Mode:
          </label>
          <select
            value={calculationMode}
            onChange={(e) => setCalculationMode(e.target.value)}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="manual">Manual</option>
            <option value="auto">Auto</option>
          </select>
        </div>

        {/* Meal Type Dropdown */}
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-1">
            Meal Type:
          </label>
          <select
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="All">All (Breakfast, Lunch, Dinner, 2 Snacks)</option>
            <option value="Breakfast">Breakfast</option>
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
            <option value="Snack">Snack</option>
          </select>
        </div>

        {/* Number of Days */}
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-1">
            Number of Days:
          </label>
          <input
            type="number"
            value={numDays}
            onChange={(e) => setNumDays(Number(e.target.value))}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Calories */}
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-1">
            Calories (daily total):
          </label>
          <input
            type="number"
            value={calories}
            onChange={(e) => setCalories(Number(e.target.value))}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Auto-calculated or manual input fields */}
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-1">
            Carbs (grams per day):
          </label>
          <input
            type="number"
            value={carbs}
            onChange={(e) => setCarbs(Number(e.target.value))}
            disabled={calculationMode === 'auto'}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              calculationMode === 'auto' ? 'bg-gray-100' : 'bg-white'
            }`}
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-1">
            Protein (grams per day):
          </label>
          <input
            type="number"
            value={protein}
            onChange={(e) => setProtein(Number(e.target.value))}
            disabled={calculationMode === 'auto'}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              calculationMode === 'auto' ? 'bg-gray-100' : 'bg-white'
            }`}
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-1">
            Fat (grams per day):
          </label>
          <input
            type="number"
            value={fat}
            onChange={(e) => setFat(Number(e.target.value))}
            disabled={calculationMode === 'auto'}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              calculationMode === 'auto' ? 'bg-gray-100' : 'bg-white'
            }`}
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-1">
            Fiber (grams per day):
          </label>
          <input
            type="number"
            value={fiber}
            onChange={(e) => setFiber(Number(e.target.value))}
            disabled={calculationMode === 'auto'}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              calculationMode === 'auto' ? 'bg-gray-100' : 'bg-white'
            }`}
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-1">
            Sugar (grams per day limit):
          </label>
          <input
            type="number"
            value={sugar}
            onChange={(e) => setSugar(Number(e.target.value))}
            disabled={calculationMode === 'auto'}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              calculationMode === 'auto' ? 'bg-gray-100' : 'bg-white'
            }`}
          />
        </div>

        {/* Error Message */}
        {error && <p className="text-red-500 my-4">{error}</p>}

        {/* Loading Indicator */}
        {loading && <p className="text-gray-700">Loading...</p>}

        {/* Generate Meal Plan Button */}
        <button
          onClick={fetchMealPlan}
          disabled={loading}
          className="w-full py-3 px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-400"
        >
          Generate Meal Plan
        </button>

        {/* Display Meal Plan and Accept Button */}
        {mealPlan && (
          <div className="mt-8">
            <div className="bg-gray-50 rounded-lg p-6 shadow-inner">
              <ReactMarkdown
                components={{
                  h2: ({ node, ...props }) => (
                    <h2 className="text-xl font-bold mt-5 mb-3" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-2xl font-bold mt-6 mb-4 text-gray-800" {...props} />
                  ),
                  h4: ({ node, ...props }) => (
                    <h4 className="text-lg font-bold mt-4 mb-2" {...props} />
                  ),
                  p: ({ node, ...props }) => (
                    <p className="my-2 text-sm" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc pl-5 text-left" {...props} />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="mb-2 leading-relaxed text-left" {...props} />
                  ),
                  strong: ({ node, children, ...props }) => {
                    const text = String(children);
                    if (
                      text.includes('BREAKFAST:') || 
                      text.includes('LUNCH:') || 
                      text.includes('DINNER:') || 
                      text.includes('SNACK:')
                    ) {
                      return (
                        <strong className="block text-xl font-bold mt-6 mb-4" {...props}>
                          {children}
                        </strong>
                      );
                    } else if (
                      text.includes('Nutrition:') || 
                      text.includes('Ingredients:') || 
                      text.includes('Instructions:')
                    ) {
                      return (
                        <strong className="block text-lg font-bold mt-4 mb-2" {...props}>
                          {children}
                        </strong>
                      );
                    }
                    return <strong className="font-bold" {...props}>{children}</strong>;
                  }
                }}
              >
                {mealPlan}
              </ReactMarkdown>
            </div>

            {/* Accept Meal Plan Button */}
            <button
              onClick={handleAcceptMealPlan}
              disabled={loading || acceptingMealPlan}
              className="w-full py-3 px-6 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:bg-gray-400 mt-6"
            >
              {acceptingMealPlan ? "Processing..." : "Accept Meal Plan"}
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
  );
}