import { useState } from "react";
import { CheckIcon, Utensils, Clock, Flame, Activity } from "lucide-react";

function MealCard({ title, nutrition, ingredients, instructions }) {
  const [selected, setSelected] = useState(false);
  
  return (
    <div 
      className={`relative bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 cursor-pointer group
        ${selected 
          ? "ring-2 ring-teal-500 translate-y-[-2px]" 
          : "hover:translate-y-[-4px] hover:shadow-xl"}`}
      onClick={() => setSelected(!selected)}
    >
      {/* Grey Overlay When Selected */}
      {selected && (
        <div className="absolute inset-0 bg-gray-200/50 backdrop-blur-sm transition-opacity duration-300" />
      )}

      {/* Selection Indicator */}
      {selected && (
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-400 to-teal-600" />
      )}
      
      <div className="p-6 relative z-10">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-bold text-gray-800 tracking-tight group-hover:text-teal-700 transition-colors">
            {title}
          </h3>
          {selected && (
            <div className="bg-teal-100 text-teal-700 rounded-full py-1 px-3 flex items-center text-xs font-semibold">
              <CheckIcon className="w-3 h-3 mr-1" />
              Selected
            </div>
          )}
        </div>
        
        {/* Nutrition Information */}
        {nutrition && (
          <div className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center">
              <Activity className="w-4 h-4 mr-1 text-teal-600" /> 
              Nutritional Information
            </h4>

            {/* ✅ Place Calories in a full-width row, macros below */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              {/* 🔥 Calories spans full row */}
              <div className="md:col-span-6">
                <NutrientMetric 
                  icon={<Flame className="w-4 h-4 text-orange-500" />} 
                  value={nutrition.calories} 
                  unit="kcal"
                  label="Calories"
                  highlight={true} 
                />
              </div>

              {/* 🥩 Protein, 🍞 Carbs, 🧈 Fat, 🌿 Fiber, 🍬 Sugar in a 5-column row */}
              <NutrientMetric value={nutrition.protein} unit="g" label="Protein" />
              <NutrientMetric value={nutrition.carbs} unit="g" label="Carbs" />
              <NutrientMetric value={nutrition.fat} unit="g" label="Fat" />
              <NutrientMetric value={nutrition.fiber} unit="g" label="Fiber" />
              <NutrientMetric value={nutrition.sugar} unit="g" label="Sugar" />
            </div>
          </div>
        )}
        
        {/* Ingredients */}
        {ingredients.length > 0 && (
          <div className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center">
              <Utensils className="w-4 h-4 mr-1 text-teal-600" />
              Ingredients
            </h4>
            
            <ul className="space-y-4">
              {ingredients.map((ingredient, i) => (
                <li key={i} className="pb-3 border-b border-gray-200 last:border-0">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-800">
                      {ingredient.name} <span className="text-teal-600">({ingredient.quantity})</span>
                    </span>
                  </div>

                  {ingredient.macros && (
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2">
                      <MacroTag value={`${ingredient.macros.calories} kcal`} color="bg-orange-50 text-orange-700" />
                      <MacroTag value={`${ingredient.macros.protein}g protein`} color="bg-blue-50 text-blue-700" />
                      <MacroTag value={`${ingredient.macros.carbs}g carbs`} color="bg-green-50 text-green-700" />
                      <MacroTag value={`${ingredient.macros.fat}g fat`} color="bg-yellow-50 text-yellow-700" />
                      <MacroTag value={`${ingredient.macros.fiber}g fiber`} color="bg-purple-50 text-purple-700" />
                      <MacroTag value={`${ingredient.macros.sugar}g sugar`} color="bg-red-50 text-red-700" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Instructions */}
        {instructions && (
          <div className="mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center">
              <Clock className="w-4 h-4 mr-1 text-teal-600" />
              Preparation
            </h4>
            <p className="text-sm leading-relaxed text-gray-700">{instructions}</p>
          </div>
        )}
      </div>

      {/* Bottom Selection Indicator */}
      {selected && (
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-teal-600 to-teal-400" />
      )}
    </div>
  );
}

// **Nutrient Display Component**
function NutrientMetric({ icon, value, unit, label, highlight = false }) {
  return (
    <div className={`rounded-lg py-2 px-1 text-center transition-colors
      ${highlight 
        ? 'bg-gray-100 text-gray-800' // 🔥 Calories get a **gray background**
        : 'bg-white text-gray-800'}`}
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

// **Macro Display Component**
function MacroTag({ value, color }) {
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {value}
    </span>
  );
}

export default MealCard;