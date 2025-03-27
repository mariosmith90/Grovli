import { useState, useEffect, useRef } from 'react';
import { useRouter } from "next/navigation";
import { 
  CheckIcon, 
  Flame, 
  Activity, 
  X, 
  ChevronLeft, 
  ChevronRight 
} from "lucide-react";

// Nutrient Display Component
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
  showChatbot,
  onReturnToInput 
}) {
  const router = useRouter();
  const [currentMealIndex, setCurrentMealIndex] = useState(0);
  const [animationDirection, setAnimationDirection] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(null);
  const isMounted = useRef(true);
  
  // Setup mount/unmount tracking
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Early return if mealPlan is not an array or empty or chatbot is shown
  if (!Array.isArray(mealPlan) || mealPlan.length === 0 || showChatbot) {
    return null;
  }

  // Process meal data
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
      const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
      dayMeals.forEach((meal, idx) => {
        if (meal) {  // Check if meal exists
          mealsByDay[dayNum].push({
            ...meal,
            mealType: mealTypes[idx % mealTypes.length]
          });
        }
      });
    } else {
      dayMeals.forEach(meal => {
        if (meal) {  // Check if meal exists
          mealsByDay[dayNum].push({
            ...meal,
            mealType: mealType
          });
        }
      });
    }
  }

  // Flatten meals for swiping
  const allMeals = Object.values(mealsByDay).flat();
  
  // Validate before proceeding
  if (!allMeals.length || currentMealIndex >= allMeals.length) {
    return null;
  }

  // Get current meal
  const currentMeal = allMeals[currentMealIndex];
  
  // Additional validation for the current meal
  if (!currentMeal || !currentMeal.nutrition) {
    return null;
  }

  // Navigation functions
  const goToNextMeal = () => {
    if (currentMealIndex < allMeals.length - 1) {
      setAnimationDirection('right');
      setTimeout(() => {
        if (isMounted.current) {
          setCurrentMealIndex(prev => prev + 1);
          setAnimationDirection(null);
          setSwipeOffset(0);
        }
      }, 300);
    }
  };

  const goToPreviousMeal = () => {
    if (currentMealIndex > 0) {
      setAnimationDirection('left');
      setTimeout(() => {
        if (isMounted.current) {
          setCurrentMealIndex(prev => prev - 1);
          setAnimationDirection(null);
          setSwipeOffset(0);
        }
      }, 300);
    }
  };

  // Touch event handlers
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    if (!touchStartX.current) return;
    
    const touchEndX = e.touches[0].clientX;
    const diffX = touchStartX.current - touchEndX;
    
    // Only update state if component is still mounted
    if (isMounted.current) {
      setSwipeOffset(-diffX); // Negative for correct direction
    }
  };

  const handleTouchEnd = (e) => {
    if (!touchStartX.current) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX.current - touchEndX;
    
    // Threshold for swipe
    if (Math.abs(diffX) > 50) {
      if (diffX > 0 && currentMealIndex < allMeals.length - 1) {
        goToNextMeal();
      } else if (diffX < 0 && currentMealIndex > 0) {
        goToPreviousMeal();
      } else {
        // Reset offset if swipe wasn't strong enough or we're at the end
        if (isMounted.current) {
          setSwipeOffset(0);
        }
      }
    } else {
      // Reset offset if swipe wasn't strong enough
      if (isMounted.current) {
        setSwipeOffset(0);
      }
    }
    
    touchStartX.current = null;
  };

  // Tap navigation
  const handleTap = (e) => {
    const screenWidth = window.innerWidth;
    const tapX = e.clientX;
    
    // Tap on right side of screen -> go next
    if (tapX > screenWidth * 0.5 && currentMealIndex < allMeals.length - 1) {
      goToNextMeal();
    } 
    // Tap on left side of screen -> go previous
    else if (tapX <= screenWidth * 0.5 && currentMealIndex > 0) {
      goToPreviousMeal();
    }
  };

  // Calculate day number for display
  const mealDayNumber = Math.floor(currentMealIndex / (mealType === 'Full Day' ? 4 : 1)) + 1;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Back button fixed at top-left */}
      <button 
        onClick={onReturnToInput}
        className="absolute top-4 left-4 z-10 bg-white/80 backdrop-blur-sm rounded-full p-2 hover:bg-gray-200 transition-colors shadow-md"
        aria-label="Back to meal plan"
      >
        <ChevronLeft className="w-6 h-6 text-gray-700" />
      </button>
      
      {/* Meal selection button fixed at top-right */}
      <button 
        onClick={() => handleMealSelection(currentMeal.id)}
        className={`absolute top-4 right-4 z-10 rounded-full p-2 transition-colors shadow-md ${
          selectedRecipes.includes(currentMeal.id) 
            ? 'bg-teal-100 text-teal-700 hover:bg-teal-200' 
            : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-gray-200'
        }`}
        aria-label={selectedRecipes.includes(currentMeal.id) ? "Deselect meal" : "Select meal"}
      >
        <CheckIcon className="w-5 h-5" />
      </button>
      
      {/* Progress indicator at top-center with meal type label below it */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
        <div className="bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 shadow-md mb-2">
          <span className="text-sm font-medium text-gray-700">
            {currentMealIndex + 1} / {allMeals.length}
          </span>
        </div>
        {/* Meal type & day label centered below the progress counter */}
        <div className="bg-white/90 rounded-full px-3 py-1 shadow-sm">
          <p className="text-xs font-medium text-gray-800 capitalize">
            {currentMeal.mealType.toLowerCase()} · Day {mealDayNumber}
          </p>
        </div>
      </div>
      
      {/* Meal content area - this is the swipeable/tappable area */}
      <div 
        className="flex-grow relative overflow-hidden"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Animation container */}
        <div 
          className={`absolute inset-0 transition-transform duration-300 ${
            animationDirection === 'right' ? 'translate-x-full' : 
            animationDirection === 'left' ? '-translate-x-full' : ''
          }`}
          style={{ transform: swipeOffset ? `translateX(${swipeOffset}px)` : '' }}
        >
          {/* Meal content */}
          <div className="h-full flex flex-col">
            {/* Meal Image - Now takes full width with no padding */}
            <div className="relative w-full h-64 bg-gray-100">
              {currentMeal.imageUrl && (
                <img
                  src={currentMeal.imageUrl}
                  alt={currentMeal.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.classList.add('bg-gradient-to-br', 'from-gray-100', 'to-gray-200');
                  }}
                />
              )}
            </div>
            
            {/* Meal details in padding container */}
            <div className="flex-1 p-4 flex flex-col">
              {/* Meal Title */}
              <h3 className="text-2xl font-bold text-gray-800 mb-4">
                {currentMeal.title}
              </h3>
              
              {/* Nutrition Information */}
              <div className="mb-6">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center">
                  <Activity className="w-4 h-4 mr-1 text-teal-600" /> 
                  Nutritional Information
                </h4>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {/* Calories spans full row */}
                  <div className="col-span-3 sm:col-span-6">
                    <NutrientMetric 
                      icon={<Flame className="w-4 h-4 text-orange-500" />} 
                      value={currentMeal.nutrition.calories} 
                      unit="kcal"
                      label="Calories"
                      highlight={true} 
                    />
                  </div>

                  {/* Macros */}
                  <NutrientMetric 
                    value={currentMeal.nutrition.protein} 
                    unit="g" 
                    label="Protein" 
                  />
                  <NutrientMetric 
                    value={currentMeal.nutrition.carbs} 
                    unit="g" 
                    label="Carbs" 
                  />
                  <NutrientMetric 
                    value={currentMeal.nutrition.fat} 
                    unit="g" 
                    label="Fat" 
                  />
                  <NutrientMetric 
                    value={currentMeal.nutrition.fiber} 
                    unit="g" 
                    label="Fiber" 
                  />
                  <NutrientMetric 
                    value={currentMeal.nutrition.sugar} 
                    unit="g" 
                    label="Sugar" 
                  />
                </div>
              </div>
              
              {/* View Recipe button */}
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent triggering swipe
                  router.push(`/recipes/${currentMeal.id}`);
                }}
                className="w-full py-3 mt-auto bg-teal-50 text-teal-700 font-semibold rounded-lg hover:bg-teal-100 transition-colors"
              >
                View Full Recipe
              </button>
            </div>
          </div>
        </div>
        
        {/* Swipe indicators - arrows on both sides */}
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex justify-between items-center px-4 text-white/50">
          <ChevronLeft className={`w-12 h-12 ${currentMealIndex > 0 ? 'opacity-30' : 'opacity-0'} drop-shadow-md`} />
          <ChevronRight className={`w-12 h-12 ${currentMealIndex < allMeals.length - 1 ? 'opacity-30' : 'opacity-0'} drop-shadow-md`} />
        </div>
      </div>
      
      {/* Bottom action buttons */}
      <div className="p-4 border-t bg-white">
        <div className="flex gap-3">
          {/* Save Selected Recipes Button */}
          {selectedRecipes.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                saveSelectedRecipes();
              }}
              className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-all"
              disabled={loading}
            >
              Save Meals ({selectedRecipes.length})
            </button>
          )}

          {/* Order Ingredients Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOrderPlanIngredients();
            }}
            disabled={loading || orderingPlanIngredients}
            className="flex-1 py-3 bg-teal-600 hover:bg-teal-800 text-white font-bold rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {orderingPlanIngredients ? "Processing..." : "Order Ingredients"}
          </button>
        </div>
      </div>
    </div>
  );
}