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
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Grovli AI (Beta)</h1>
      
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
          value={calculationMode}
          onChange={(e) => setCalculationMode(e.target.value)}
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        >
          <option value="manual">Manual</option>
          <option value="auto">Auto</option>
        </select>
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
        <input
          type="number"
          value={numDays}
          onChange={(e) => setNumDays(Number(e.target.value))}
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
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

      {/* Loading Indicator */}
      {loading && <p>Loading...</p>}

      {/* Generate Meal Plan Button */}
      <button
        onClick={fetchMealPlan}
        disabled={loading}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007BFF',
          color: '#fff',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
        }}
      >
        Generate Meal Plan
      </button>


      {/* Display Meal Plan and Accept Button */}
      {mealPlan && (
        <div>
          <div style={{ marginTop: '20px', backgroundColor: '#f4f4f4', padding: '15px' }}>
            <ReactMarkdown
              components={{
                h2: ({ node, ...props }) => (
                  <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '20px' }} {...props} />
                ),
                h3: ({ node, ...props }) => (
                  <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '24px', color: '#333' }} {...props} />
                ),          
                h4: ({ node, ...props }) => (
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '14px' }} {...props} />
                ),
                p: ({ node, ...props }) => (
                  <p style={{ margin: '10px 0', fontSize: '14px' }} {...props} />
                ),
                ul: ({ node, ...props }) => (
                  <ul style={{ listStyleType: 'disc', marginLeft: '20px', textAlign: 'left' }} {...props} />
                ),
                li: ({ node, ...props }) => (
                  <li style={{ marginBottom: '5px', lineHeight: '1.5', textAlign: 'left' }} {...props} />
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
                      <strong style={{ 
                        fontSize: '18px', 
                        fontWeight: 'bold', 
                        display: 'block', 
                        marginTop: '24px', 
                        marginBottom: '16px' 
                      }} {...props}>
                        {children}
                      </strong>
                    );
                  } else if (
                    text.includes('Nutrition:') || 
                    text.includes('Ingredients:') || 
                    text.includes('Instructions:')
                  ) {
                    return (
                      <strong style={{ 
                        fontSize: '18px', 
                        fontWeight: 'bold', 
                        display: 'block', 
                        marginTop: '16px' 
                      }} {...props}>
                        {children}
                      </strong>
                    );
                  }
                  return <strong style={{ fontWeight: 'bold' }} {...props}>{children}</strong>;
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
            style={{
              padding: '10px 20px',
              backgroundColor: acceptingMealPlan ? "#6c757d" : "#28A745",
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              marginTop: '15px',
            }}
          >
            {acceptingMealPlan ? "Processing..." : "Accept Meal Plan"}
          </button>
        </div>
      )}
    </div>
  );
}