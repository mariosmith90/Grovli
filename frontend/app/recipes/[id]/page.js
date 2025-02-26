"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckIcon, Utensils, Clock, Flame, Activity, ArrowLeft } from "lucide-react";

export default function RecipePage() {
  const params = useParams();
  const router = useRouter();
  const mealId = params?.id || ""; 

  const [recipe, setRecipe] = useState(null);
  const [selected, setSelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mealId) return; 
    
    console.log("Recipe page loaded with meal ID:", mealId);
    
    const fetchRecipe = async () => {
      try {
        console.log(`Fetching recipe from: ${process.env.NEXT_PUBLIC_API_URL}/mealplan/${mealId}`);
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mealplan/${mealId}`);
        
        console.log("Response status:", response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Error response:", errorText);
          throw new Error(`Recipe not found: ${errorText}`);
        }
        
        const data = await response.json();
        console.log("Recipe data received:", data);
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
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to meal plan
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
    <div className="container mx-auto p-6 max-w-4xl">
      <button 
        onClick={() => router.back()}
        className="mb-6 flex items-center text-teal-600 hover:text-teal-800"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to meal plan
      </button>
      
      <div 
        className="relative bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 group"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <h1 className="text-2xl font-bold text-gray-800 tracking-tight">
              {recipe.title}
            </h1>
          </div>
          
          {/* Nutrition Information */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center">
              <Activity className="w-5 h-5 mr-2 text-teal-600" /> 
              Nutritional Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              {/* Calories Full Row */}
              <div className="md:col-span-6">
                <NutrientMetric 
                  icon={<Flame className="w-5 h-5 text-orange-500" />} 
                  value={recipe.nutrition.calories} 
                  unit="kcal"
                  label="Calories"
                  highlight={true} 
                />
              </div>

              {/* Macros */}
              <NutrientMetric value={recipe.nutrition.protein} unit="g" label="Protein" />
              <NutrientMetric value={recipe.nutrition.carbs} unit="g" label="Carbs" />
              <NutrientMetric value={recipe.nutrition.fat} unit="g" label="Fat" />
              <NutrientMetric value={recipe.nutrition.fiber} unit="g" label="Fiber" />
              <NutrientMetric value={recipe.nutrition.sugar} unit="g" label="Sugar" />
            </div>
          </div>
          
          {/* Ingredients */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center">
              <Utensils className="w-5 h-5 mr-2 text-teal-600" />
              Ingredients
            </h2>
            
            <ul className="space-y-4 pl-2">
              {recipe.ingredients.map((ingredient, i) => (
                <li key={i} className="pb-3 border-b border-gray-200 last:border-0">
                  <span className="font-medium text-gray-800">
                    {ingredient.name} <span className="text-teal-600">({ingredient.quantity})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Instructions */}
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center">
              <Clock className="w-5 h-5 mr-2 text-teal-600" />
              Preparation
            </h2>
            
            <div className="prose max-w-none text-gray-700">
              {recipe.instructions.split('\\n').map((line, i) => (
                <p key={i} className="mb-3">{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// **Nutrient Display Component**
function NutrientMetric({ icon, value, unit, label, highlight = false }) {
  return (
    <div className={`rounded-lg py-3 px-2 text-center transition-colors
      ${highlight ? 'bg-gray-100 text-gray-800' : 'bg-white text-gray-800'}`}
    >
      <div className="flex justify-center items-center mb-1">
        {icon}
      </div>
      <div className="font-bold text-lg leading-none">
        {value}<span className="text-xs ml-0.5">{unit}</span>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">
        {label}
      </div>
    </div>
  );
}