import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, Flame, Activity, RefreshCw, Loader } from "lucide-react";
import { toast } from "react-hot-toast";

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

// Define MealCard component and export it
export function MealCard({ id, title, nutrition, imageUrl, onSelect, isSelected, mealType, dayNumber }) {
  const router = useRouter();
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  
  // Function to handle image regeneration
  const handleRegenerateImage = async (e) => {
    if (e) {
      e.stopPropagation(); // Prevent triggering selection
    }
    
    if (regeneratingImage) return;
    
    try {
      setRegeneratingImage(true);
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mealplan/regenerate_image/${id}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to regenerate image');
      }
      
      const newImageData = await response.json();
      
      // You would typically update the parent state here
      // But for now, we'll just update the DOM directly
      const imageElement = document.querySelector(`#meal-card-${id} img`);
      if (imageElement) {
        imageElement.src = newImageData.imageUrl;
        imageElement.style.display = ''; // Make image visible again
      }
      
      toast.success('Image regenerated successfully!');
    } catch (error) {
      console.error('Error regenerating image:', error);
      toast.error('Failed to regenerate image');
    } finally {
      setRegeneratingImage(false);
    }
  };
  
  return (
    <div 
      id={`meal-card-${id}`}
      className={`relative bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 group flex flex-col cursor-pointer
        ${isSelected 
          ? "ring-2 ring-teal-500 translate-y-[-2px]" 
          : "hover:translate-y-[-4px] hover:shadow-xl"}`}
      onClick={() => onSelect && onSelect(id)}
    >
      {/* Meal Type and Day Badge */}
      <div className="absolute top-2 left-2 z-20 flex gap-2">
        {dayNumber && (
          <div className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            Day {dayNumber}
          </div>
        )}
        {mealType && (
          <div className="bg-teal-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            {mealType}
          </div>
        )}
      </div>

      {/* Grey Overlay When Selected */}
      {isSelected && <div className="absolute inset-0 bg-gray-200/50 backdrop-blur-sm transition-opacity duration-300" />}

      {/* Selection Indicator */}
      {isSelected && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-400 to-teal-600" />}
      
      {/* Meal Image */}
      <div className="w-full h-48 bg-gray-100 relative">
        {regeneratingImage ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <Loader className="w-6 h-6 text-teal-500 animate-spin mx-auto mb-1" />
              <p className="text-xs text-gray-600">Regenerating image...</p>
            </div>
          </div>
        ) : (
          <>
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-cover"
              onError={(e) => {
                console.error("Image failed to load:", imageUrl);
                
                // Hide the broken image
                e.target.style.display = 'none';
                
                // Automatically regenerate the image
                handleRegenerateImage();
              }}
            />
            {/* Regenerate Button */}
            <button 
              onClick={handleRegenerateImage}
              className="absolute bottom-2 right-2 p-1.5 rounded-full bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors z-30"
              title="Regenerate image"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      <div className="p-6 relative z-10 flex flex-col flex-grow">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-bold text-gray-800 tracking-tight group-hover:text-teal-700 transition-colors">
            {title}
          </h3>
          {isSelected && (
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

              {/* Macros */}
              <NutrientMetric value={nutrition.protein} unit="g" label="Protein" />
              <NutrientMetric value={nutrition.carbs} unit="g" label="Carbs" />
              <NutrientMetric value={nutrition.fat} unit="g" label="Fat" />
              <NutrientMetric value={nutrition.fiber} unit="g" label="Fiber" />
              <NutrientMetric value={nutrition.sugar} unit="g" label="Sugar" />
            </div>
          </div>
        )}

        {/* See Recipe Link - Pushed to Bottom */}
        <div className="mt-auto text-center">
          <button
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering selection
              router.push(`/recipes/${id}`);
            }}
            className="text-teal-600 hover:text-teal-800 font-semibold transition"
          >
            See Recipe →
          </button>
        </div>
      </div>

      {/* Bottom Selection Indicator */}
      {isSelected && <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-teal-600 to-teal-400" />}
    </div>
  );
}

// The rest of your MealPlanDisplay component remains the same
export function MealPlanDisplay({ 
  mealPlan, 
  mealType, 
  numDays, 
  handleMealSelection, 
  selectedRecipes, 
  saveSelectedRecipes, 
  handleOrderPlanIngredients, 
  loading, 
  orderingPlanIngredients,
  showChatbot 
}) {
  // Early return if mealPlan is not an array or empty or chatbot is shown
  if (!Array.isArray(mealPlan) || mealPlan.length === 0 || showChatbot) {
    return null;
  }

  // Determine how many days we have
  const totalDays = numDays;
  const mealsPerDay = mealType === 'Full Day' ? 4 : 1;
  const mealsByDay = {};
  
  // Create day groupings
  for (let i = 0; i < totalDays; i++) {
    const dayNum = i + 1;
    mealsByDay[dayNum] = [];
    
    // Calculate which meals belong to this day
    const startIdx = i * mealsPerDay;
    const endIdx = startIdx + mealsPerDay;
    const dayMeals = mealPlan.slice(startIdx, Math.min(endIdx, mealPlan.length));
    
    // Get meal types for this day
    if (mealType === 'Full Day') {
      // For Full Day, assign meal types in order
      const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
      dayMeals.forEach((meal, idx) => {
        mealsByDay[dayNum].push({
          ...meal,
          mealType: mealTypes[idx % mealTypes.length]
        });
      });
    } else {
      // For single meal type, use that type
      dayMeals.forEach(meal => {
        mealsByDay[dayNum].push({
          ...meal,
          mealType: mealType
        });
      });
    }
  }

  // Extract all meal IDs for Select All functionality
  const allMealIds = Object.values(mealsByDay).flat().map(meal => meal.id);
  
  // Check if all meals are currently selected
  const allMealsSelected = allMealIds.length > 0 && allMealIds.every(id => selectedRecipes.includes(id));
  
  // Handle Global Select All toggle
  const handleSelectAllDays = () => {
    if (allMealsSelected) {
      // Deselect all meals
      allMealIds.forEach(id => {
        if (selectedRecipes.includes(id)) {
          handleMealSelection(id);
        }
      });
    } else {
      // Select all meals
      allMealIds.forEach(id => {
        if (!selectedRecipes.includes(id)) {
          handleMealSelection(id);
        }
      });
    }
  };

  return (
    <div className="mt-6">
      {/* Group meals by day */}
      {Object.entries(mealsByDay).map(([day, meals]) => (
        <div key={`day-${day}`} className="mb-8">
          {/* Day Header with Select All button inline */}
          <div className="flex justify-between items-center mb-4 pb-2 border-b">
            <h3 className="text-xl font-bold text-gray-800">
              Day {day}
            </h3>
            
            {/* Only show the Select All button on the first day */}
            {day === '1' && (
              <button
                onClick={handleSelectAllDays}
                className="flex items-center py-2 px-4 rounded-lg font-medium transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                <CheckIcon className={`w-5 h-5 mr-2 ${allMealsSelected ? "text-teal-500" : "text-gray-500"}`} />
                Select All
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {meals.map((meal, index) => (
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
                imageUrl={meal.imageUrl}
                ingredients={meal?.ingredients || []}
                instructions={meal?.instructions || "No instructions provided."}
                onSelect={handleMealSelection}
                isSelected={selectedRecipes.includes(meal.id)}
                mealType={meal.mealType}
                dayNumber={day}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Action Buttons */}
      <div className="mt-6"> 
        {/* Save Selected Recipes Button - appears only when recipes are selected */}
        {selectedRecipes.length > 0 && (
          <button
            onClick={saveSelectedRecipes}
            className="w-full py-2 px-4 mb-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-all"
          >
            Save Meals ({selectedRecipes.length})
          </button>
        )}

        {/* Button Row with Plan Creator and Order Ingredients */}
        <div className="flex gap-3">
          {/* Plan Creator Button */}
          <button
            onClick={() => window.location.href = '/planner'}
            className="flex-1 py-2 px-4 bg-teal-700 hover:bg-teal-900 text-white font-bold rounded-lg transition-all"
          >
            Plan Creator
          </button>
          
          {/* Order Plan Ingredients Button */}
          <button
            onClick={handleOrderPlanIngredients}
            disabled={loading || orderingPlanIngredients}
            className="flex-1 py-2 px-4 bg-teal-600 hover:bg-teal-800 text-white font-bold rounded-lg"
          >
            {orderingPlanIngredients ? "Processing..." : "Order Ingredients"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Set the default export to MealCard
export default MealCard;