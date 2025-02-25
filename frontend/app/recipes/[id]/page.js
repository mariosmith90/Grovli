"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { CheckIcon, Utensils, Clock, Flame, Activity } from "lucide-react";

export default function RecipePage() {
  const params = useParams();
  const id = params?.id;

  const [recipe, setRecipe] = useState(null);
  const [selected, setSelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchRecipe = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mealplan/${id}`);
        if (!response.ok) throw new Error("Recipe not found");
        const data = await response.json();
        setRecipe(data);
      } catch (error) {
        console.error("Error fetching recipe:", error);
        setError("Failed to load recipe.");
      } finally {
        setLoading(false);
      }
    };

    fetchRecipe();
  }, [id]);

  if (loading) return <p className="text-center py-10">Loading...</p>;
  if (error) return <p className="text-center py-10 text-red-500">{error}</p>;

  return (
    <div 
      className={`relative bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 cursor-pointer group
        ${selected ? "ring-2 ring-teal-500 translate-y-[-2px]" : "hover:translate-y-[-4px] hover:shadow-xl"}`}
      onClick={() => setSelected(!selected)}
    >
      {/* Grey Overlay When Selected */}
      {selected && <div className="absolute inset-0 bg-gray-200/50 backdrop-blur-sm transition-opacity duration-300" />}

      {/* Selection Indicator */}
      {selected && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-400 to-teal-600" />}
      
      <div className="p-6 relative z-10">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-bold text-gray-800 tracking-tight group-hover:text-teal-700 transition-colors">
            {recipe.title}
          </h3>
          {selected && (
            <div className="bg-teal-100 text-teal-700 rounded-full py-1 px-3 flex items-center text-xs font-semibold">
              <CheckIcon className="w-3 h-3 mr-1" />
              Selected
            </div>
          )}
        </div>
        
        {/* Nutrition Information */}
        <div className="mb-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center">
            <Activity className="w-4 h-4 mr-1 text-teal-600" /> 
            Nutritional Information
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            {/* Calories Full Row */}
            <div className="md:col-span-6">
              <NutrientMetric 
                icon={<Flame className="w-4 h-4 text-orange-500" />} 
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
        <div className="mb-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center">
            <Utensils className="w-4 h-4 mr-1 text-teal-600" />
            Ingredients
          </h4>
          
          <ul className="space-y-4">
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
        <div className="mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center">
            <Clock className="w-4 h-4 mr-1 text-teal-600" />
            Preparation
          </h4>
          <p className="text-sm leading-relaxed text-gray-700">{recipe.instructions}</p>
        </div>
      </div>

      {selected && <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-teal-600 to-teal-400" />}
    </div>
  );
}

// **Nutrient Display Component**
function NutrientMetric({ icon, value, unit, label, highlight = false }) {
  return (
    <div className={`rounded-lg py-2 px-1 text-center transition-colors
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