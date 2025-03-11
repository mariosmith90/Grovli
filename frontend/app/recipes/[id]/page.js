"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export default function RecipePage() {
  const params = useParams();
  const router = useRouter();
  const mealId = params?.id || ""; 

  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mealId) return; 
    
    const fetchRecipe = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mealplan/${mealId}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Recipe not found: ${errorText}`);
        }
        
        const data = await response.json();
        setRecipe(data);
      } catch (error) {
        console.error("Error fetching recipe:", error);
        setError(`Failed to load recipe: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchRecipe();
  }, [mealId]);

  if (loading) return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <p className="text-xl">Loading recipe...</p>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <button 
          onClick={() => router.back()}
          className="mb-6 flex items-center text-teal-600 hover:text-teal-800"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to meal plan
        </button>
        <p className="text-red-500 text-lg font-medium">{error}</p>
        <p className="mt-4">
          This could be due to:
          <ul className="list-disc pl-6 mt-2">
            <li>The meal ID format may have changed</li>
            <li>The meal may have been deleted from the database</li>
            <li>There might be a connection issue with the server</li>
          </ul>
        </p>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto max-w-4xl">
      <div className="bg-white min-h-screen">
        {/* Header with back button */}
        <div className="p-4">
          <button 
            onClick={() => router.back()}
            className="rounded-full bg-gray-100 p-2 flex items-center justify-center shadow-md"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        </div>
        
        {/* Recipe Title */}
        <div className="px-6 pb-4">
          <h1 className="text-3xl font-bold text-gray-800">
            {recipe.title}
          </h1>
        </div>
        
        {/* Main Content - Image first, then macros below */}
        <div className="px-6 pb-6">
          {/* Recipe Image - Full width above macros */}
          <div className="mb-8">
            <div className="relative rounded-3xl overflow-hidden h-72">
              <img 
                src={recipe.imageUrl || "/fallback-meal-image.jpg"} 
                alt={recipe.title}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "/fallback-meal-image.jpg";
                }}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
            
          {/* Nutrition information with colored pills */}
          <div>
            {/* Calories with green pill */}
            <div className="flex items-center mb-6">
              <div className="w-1 h-14 rounded-full bg-green-400 mr-4"></div>
              <div>
                <div className="text-4xl font-bold">
                  {recipe.nutrition.calories}
                </div>
                <div className="text-gray-500">Calories</div>
              </div>
            </div>
            
            {/* Protein with blue pill */}
            <div className="flex items-center mb-6">
              <div className="w-1 h-14 rounded-full bg-blue-400 mr-4"></div>
              <div>
                <div className="text-4xl font-bold">
                  {recipe.nutrition.protein}<span className="text-base font-normal ml-1">gr</span>
                </div>
                <div className="text-gray-500">Protein</div>
              </div>
            </div>
            
            {/* Carbs with gray pill */}
            <div className="flex items-center mb-6">
              <div className="w-1 h-14 rounded-full bg-gray-300 mr-4"></div>
              <div>
                <div className="text-4xl font-bold">
                  {recipe.nutrition.carbs}<span className="text-base font-normal ml-1">gr</span>
                </div>
                <div className="text-gray-500">Carbs</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Ingredients Section - White background with gray cards */}
        <div className="px-6 pb-10">
          {/* Header with icons */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Ingredients</h2>
              <p className="text-gray-600">{recipe.ingredients.length} healthy ingredients</p>
            </div>
            <div className="flex gap-3">
              <button className="bg-gray-100 rounded-full p-3 w-12 h-12 flex items-center justify-center shadow-sm">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </button>
              <button className="bg-gray-100 rounded-full p-3 w-12 h-12 flex items-center justify-center shadow-sm">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Individual ingredient items on white background */}
          <div className="space-y-4">
            {recipe.ingredients.map((ingredient, idx) => (
              <div key={idx} className="bg-gray-100 rounded-full py-4 px-5 flex items-center shadow-sm">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mr-5 shrink-0">
                  {getIngredientIcon(ingredient.name)}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">
                    {ingredient.name} <span className="text-teal-600 font-normal">({ingredient.quantity})</span>
                  </h3>
                  <p className="text-gray-500">
                    {getIngredientDescription(ingredient.name)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Instructions Section - Modern Step Format */}
        <div className="px-6 pb-20">
          <h2 className="text-3xl font-bold mb-6">Instructions</h2>
          
          <div className="space-y-6">
            {parseInstructions(recipe.instructions).map((step, idx) => (
              <div key={idx} className="flex">
                <div className="mr-6">
                  <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center text-teal-800 font-bold text-2xl shrink-0">
                    {idx + 1}
                  </div>
                </div>
                <div className="pt-3">
                  <p className="text-gray-800 text-lg">{step}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function for ingredient icons - Based on ingredient type
function getIngredientIcon(name) {
  const nameLower = name.toLowerCase();
  
  // Default icon for generic ingredients
  const defaultIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
      <circle cx="12" cy="5" r="1" />
      <path d="M16 16.5a4 4 0 0 1-8 0" />
      <path d="M12 12a4 4 0 0 1 0-8" />
      <path d="M12 4v8" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
  
  // Match common ingredient types to appropriate emojis
  if (nameLower.includes('spinach') || nameLower.includes('kale') || nameLower.includes('lettuce') || 
      nameLower.includes('greens') || nameLower.includes('arugula')) {
    return <span className="text-2xl">🥬</span>;
  }
  if (nameLower.includes('shrimp') || nameLower.includes('prawn') || nameLower.includes('fish') || 
      nameLower.includes('salmon') || nameLower.includes('tuna')) {
    return <span className="text-2xl">🍤</span>;
  }
  if (nameLower.includes('strawberry') || nameLower.includes('berry') || nameLower.includes('fruit')) {
    return <span className="text-2xl">🍓</span>;
  }
  if (nameLower.includes('corn')) {
    return <span className="text-2xl">🌽</span>;
  }
  if (nameLower.includes('onion')) {
    return <span className="text-2xl">🧅</span>;
  }
  if (nameLower.includes('ginger')) {
    return <span className="text-2xl">🫚</span>;
  }
  if (nameLower.includes('chili') || nameLower.includes('pepper') || nameLower.includes('spicy')) {
    return <span className="text-2xl">🌶️</span>;
  }
  if (nameLower.includes('coconut')) {
    return <span className="text-2xl">🥥</span>;
  }
  if (nameLower.includes('water')) {
    return <span className="text-2xl">💧</span>;
  }
  if (nameLower.includes('chicken') || nameLower.includes('meat') || nameLower.includes('beef') || 
      nameLower.includes('pork') || nameLower.includes('turkey')) {
    return <span className="text-2xl">🍗</span>;
  }
  if (nameLower.includes('carrot')) {
    return <span className="text-2xl">🥕</span>;
  }
  if (nameLower.includes('tomato')) {
    return <span className="text-2xl">🍅</span>;
  }
  if (nameLower.includes('egg')) {
    return <span className="text-2xl">🥚</span>;
  }
  if (nameLower.includes('oil') || nameLower.includes('olive')) {
    return <span className="text-2xl">🫒</span>;
  }
  
  return defaultIcon;
}

// Helper function for ingredient descriptions - Generic but useful descriptions
function getIngredientDescription(name) {
  const nameLower = name.toLowerCase();
  
  // Match common ingredient types to appropriate descriptions
  if (nameLower.includes('spinach') || nameLower.includes('kale') || nameLower.includes('lettuce') || 
      nameLower.includes('greens') || nameLower.includes('arugula')) {
    return "Vegetables rich in nutrients that contain minerals and antioxidants.";
  }
  if (nameLower.includes('shrimp') || nameLower.includes('prawn') || nameLower.includes('fish') || 
      nameLower.includes('salmon') || nameLower.includes('tuna')) {
    return "Rich in omega-3 fatty acids and lean protein.";
  }
  if (nameLower.includes('strawberry') || nameLower.includes('berry') || nameLower.includes('fruit')) {
    return "To make your dish balanced, include natural sugar from this fruit.";
  }
  if (nameLower.includes('corn')) {
    return "Adds natural sweetness and texture to the dish.";
  }
  if (nameLower.includes('onion') || nameLower.includes('garlic')) {
    return "Adds depth of flavor and has antimicrobial properties.";
  }
  if (nameLower.includes('ginger')) {
    return "Adds warmth and digestive benefits to your dish.";
  }
  if (nameLower.includes('chili') || nameLower.includes('pepper') || nameLower.includes('spicy')) {
    return "Adds heat and contains capsaicin with anti-inflammatory properties.";
  }
  if (nameLower.includes('chicken') || nameLower.includes('meat') || nameLower.includes('beef') || 
      nameLower.includes('pork') || nameLower.includes('turkey')) {
    return "High-quality protein essential for muscle development.";
  }
  if (nameLower.includes('oil') || nameLower.includes('olive') || nameLower.includes('fat') || 
      nameLower.includes('butter')) {
    return "Healthy fats important for nutrient absorption.";
  }
  if (nameLower.includes('rice') || nameLower.includes('pasta') || nameLower.includes('bread') || 
      nameLower.includes('grain') || nameLower.includes('flour')) {
    return "Complex carbohydrates provide sustained energy.";
  }
  
  // Default description for other ingredients
  return "A nutritious addition to complete your meal.";
}

// Function to parse and break down instructions into clear steps
function parseInstructions(instructions) {
  if (!instructions) return [];
  
  // Split by any common step separators
  let steps = [];
  
  // Check if the instruction text contains step markers like "Step 1:", "###", etc.
  if (instructions.includes('Step') || instructions.includes('###')) {
    // Split by common step markers
    const splitText = instructions.replace(/#{3}|\*\*Step \d+:|\*\*/g, '###')
      .split('###')
      .filter(text => text.trim().length > 0);
    
    steps = splitText.map(step => step.trim());
  } else {
    // If no explicit step markers, just split by newlines
    steps = instructions.split('\\n')
      .filter(text => text.trim().length > 0)
      .map(step => step.trim());
  }
  
  return steps;
}