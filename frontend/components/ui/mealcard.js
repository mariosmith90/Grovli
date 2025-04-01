import { useState, useEffect, useRef } from 'react';
import { useRouter } from "next/navigation";
import { 
  CheckIcon, 
  Flame, 
  Activity, 
  X, 
  ChevronLeft, 
  ChevronRight,
  Book,
  ShoppingCart,
  Save
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
  const [showOverview, setShowOverview] = useState(true);
  
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
  // Hard-code mealsPerDay for 'Full Day' to ensure 4 meals are expected
  const mealsPerDay = mealType === 'Full Day' ? 4 : 1;
  // Create meal structure organized by day and type
  const mealsByDay = {};
  
  // Define the standard meal types for a full day in correct order
  const standardMealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  
  // Special handling for full day meal plans - organize by day and meal type
  if (mealType === 'Full Day') {
    // Check if meal types are already set correctly
    const hasMealTypes = mealPlan.some(meal => 
      meal.meal_type && ['breakfast', 'lunch', 'dinner', 'snack'].includes(meal.meal_type.toLowerCase())
    );
    
    // Create day groupings
    for (let i = 0; i < totalDays; i++) {
      const dayNum = i + 1;
      mealsByDay[dayNum] = [];
      
      // Get all meals for this day (4 meals per day)
      const dayStartIdx = i * mealsPerDay;
      const dayEndIdx = Math.min(dayStartIdx + mealsPerDay, mealPlan.length);
      const dayMeals = mealPlan.slice(dayStartIdx, dayEndIdx);
      
      // If the meal plan already has meal types specified, use them
      if (hasMealTypes) {
        // Ensure meals are added in the correct order (breakfast, lunch, dinner, snack)
        standardMealTypes.forEach((mealType, typeIndex) => {
          // Find a meal of this type for this day
          const matchingMeal = dayMeals.find(meal => 
            meal.meal_type && meal.meal_type.toLowerCase() === mealType.toLowerCase()
          );
          
          if (matchingMeal) {
            // Found a meal with this type
            mealsByDay[dayNum].push({
              ...matchingMeal,
              mealType: mealType,
              meal_type: mealType,
              dayNumber: dayNum
            });
          } else if (dayMeals[typeIndex]) {
            // Fallback: Use position in array and assign the type
            mealsByDay[dayNum].push({
              ...dayMeals[typeIndex],
              mealType: mealType,
              meal_type: mealType,
              dayNumber: dayNum
            });
          }
        });
      } else {
        // No meal types specified, assign types in order
        dayMeals.forEach((meal, idx) => {
          if (idx < standardMealTypes.length) {
            const mealType = standardMealTypes[idx];
            
            mealsByDay[dayNum].push({
              ...meal,
              mealType: mealType,
              meal_type: mealType,
              dayNumber: dayNum
            });
          }
        });
      }
    }
  } else {
    // For non-Full Day meal types, use the original logic
    for (let i = 0; i < totalDays; i++) {
      const dayNum = i + 1;
      mealsByDay[dayNum] = [];
      
      // Calculate which meals belong to this day
      const startIdx = i * mealsPerDay;
      const endIdx = startIdx + mealsPerDay;
      
      // Ensure we don't try to access beyond the array bounds
      const dayMeals = mealPlan.slice(startIdx, Math.min(endIdx, mealPlan.length));
      
      // Assign the mealType to each meal
      dayMeals.forEach(meal => {
        if (meal) {
          mealsByDay[dayNum].push({
            ...meal,
            mealType: mealType,
            dayNumber: dayNum
          });
        }
      });
    }
  }

  // Create a flattened array of meals for easier navigation
  const allMeals = [];
  
  // Process meals by day (and by type for Full Day plans)
  Object.keys(mealsByDay).forEach(dayNum => {
    // For Full Day plans, ensure meals are in the correct order (breakfast, lunch, dinner, snack)
    const dayMeals = mealType === 'Full Day' 
      ? mealsByDay[dayNum].sort((a, b) => {
          // Define the meal type order
          const mealTypeOrder = { 'breakfast': 0, 'lunch': 1, 'dinner': 2, 'snack': 3 };
          
          // Get the meal types for comparison (case-insensitive)
          const typeA = (a.meal_type || a.mealType || '').toLowerCase();
          const typeB = (b.meal_type || b.mealType || '').toLowerCase();
          
          // Sort by meal type order
          return (mealTypeOrder[typeA] || 0) - (mealTypeOrder[typeB] || 0);
        })
      : mealsByDay[dayNum];
    
    // Add meals from this day to the flattened array
    allMeals.push(...dayMeals);
  });
  
  // Log minimal information about the processed meals
  console.log(`Processed ${mealPlan.length} meals into ${allMeals.length} organized meals`);
  
  // NOW add the useEffect that needs access to allMeals - AFTER it's defined
  useEffect(() => {
    // Make the current meal ID and functions available globally
    if (typeof window !== 'undefined' && Array.isArray(allMeals) && allMeals.length > 0) {
      // Set meal plan data
      window.mealPlanActive = true;
      window.mealPlan = mealPlan;
      window.currentMealId = allMeals[currentMealIndex]?.id;
      
      // Set global access to meal data
      // (No debugging logs needed)
      
      // Set action functions
      window.handleSaveMealGlobal = function(e) {
        if (e) e.stopPropagation();
        saveSelectedRecipes();
      };
      
      window.handleViewRecipeGlobal = function(e) {
        if (e) e.stopPropagation();
        const id = allMeals[currentMealIndex]?.id;
        if (id) {
          router.push(`/recipes/${id}`);
        }
      };
      
      window.handleOrderIngredientsGlobal = function(e) {
        if (e) e.stopPropagation();
        handleOrderPlanIngredients();
      };
    }
    
    return () => {
      // Clean up when component unmounts
      if (typeof window !== 'undefined') {
        window.mealPlanActive = false;
        delete window.mealPlan;
        delete window.currentMealId;
        delete window.handleSaveMealGlobal;
        delete window.handleViewRecipeGlobal;
        delete window.handleOrderIngredientsGlobal;
      }
    };
  }, [currentMealIndex, allMeals, mealPlan, router, saveSelectedRecipes, handleOrderPlanIngredients]);

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

  // Navigate to a specific meal
  const goToMeal = (index) => {
    if (index >= 0 && index < allMeals.length) {
      setCurrentMealIndex(index);
      setShowOverview(false);
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

  // Get current meal
  const currentMeal = allMeals[currentMealIndex] || {};
  
  // Get the day number directly from the current meal
  const mealDayNumber = currentMeal.dayNumber || 1;

  // Render meal overview screen
  if (showOverview) {
    return (
      <div className="fixed inset-0 pt-20 bg-white z-50 flex flex-col">
        {/* Back button fixed at top-left */}
        <button 
          onClick={onReturnToInput}
          className="absolute top-4 left-4 z-10 bg-white/80 backdrop-blur-sm rounded-full p-2 hover:bg-gray-200 transition-colors shadow-md"
          aria-label="Back to meal plan"
        >
          <ChevronLeft className="w-6 h-6 text-gray-700" />
        </button>
        
        <div className="p-4">
          <h2 className="text-2xl font-bold text-center mb-4">
            Your {mealType} Plan
          </h2>
          <p className="text-center text-gray-600 mb-6">
            {allMeals.length} meals generated {mealType === 'Full Day' ? `(${Object.keys(mealsByDay).length} days)` : ''}
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {Object.keys(mealsByDay).map(dayNum => (
              <div key={`day-${dayNum}`} className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-3">Day {dayNum}</h3>
                {/* Sort meals by meal type for consistent display */}
                {mealsByDay[dayNum]
                  .sort((a, b) => {
                    // Define the order: Breakfast, Lunch, Dinner, Snack
                    const mealTypeOrder = { 'breakfast': 0, 'lunch': 1, 'dinner': 2, 'snack': 3 };
                    
                    // Get the meal types in lowercase for consistent comparison
                    const typeA = (a.meal_type || a.mealType || '').toLowerCase();
                    const typeB = (b.meal_type || b.mealType || '').toLowerCase();
                    
                    // Compare based on the predefined order
                    return (mealTypeOrder[typeA] || 0) - (mealTypeOrder[typeB] || 0);
                  })
                  .map((meal, idx) => {
                  // Find the actual index in the allMeals array
                  const globalIndex = allMeals.findIndex(m => m.id === meal.id);
                  return (
                    <div 
                      key={meal.id} 
                      className="flex items-center bg-white p-3 rounded-lg mb-2 shadow-sm cursor-pointer hover:bg-teal-50 transition-colors"
                      onClick={() => goToMeal(globalIndex)}
                    >
                      <div className="w-12 h-12 bg-gray-200 rounded-md overflow-hidden mr-3 flex-shrink-0">
                        {meal.imageUrl && (
                          <img 
                            src={meal.imageUrl} 
                            alt={meal.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <p className="font-medium text-sm text-gray-900 line-clamp-1">{meal.title}</p>
                        </div>
                        <div className="flex items-center mt-1">
                          <span className="text-xs text-teal-600 font-medium">{meal.meal_type || meal.mealType || ''}</span>
                          <span className="mx-2 text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">{meal.nutrition?.calories} kcal</span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMealSelection(meal.id);
                        }}
                        className={`ml-2 p-2 rounded-full ${
                          selectedRecipes.includes(meal.id) 
                            ? 'bg-teal-100 text-teal-600' 
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setShowOverview(false)}
              className="bg-teal-600 text-white px-6 py-3 rounded-full shadow hover:bg-teal-700 transition-colors"
            >
              View Details
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render detailed meal view (original view)
  return (
    <div className="fixed inset-0 pt-20 bg-white z-50 flex flex-col">
      {/* Back buttons and navigation at top */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-white shadow-sm flex justify-between items-center p-4">
        <button 
          onClick={() => setShowOverview(true)}
          className="flex items-center text-gray-700 font-medium hover:text-teal-600 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Overview
        </button>
        
        <button 
          onClick={() => handleMealSelection(currentMeal.id)}
          className={`rounded-full p-2 transition-colors ${
            selectedRecipes.includes(currentMeal.id) 
              ? 'bg-teal-100 text-teal-700' 
              : 'bg-gray-100 text-gray-700'
          }`}
          aria-label={selectedRecipes.includes(currentMeal.id) ? "Deselect meal" : "Select meal"}
        >
          <CheckIcon className="w-5 h-5" />
        </button>
      </div>
      
      {/* Progress indicator at top-center with meal type label below it */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
        <div className="bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 shadow-md mb-2">
          <span className="text-sm font-medium text-gray-700">
            {currentMealIndex + 1} / {allMeals.length}
          </span>
        </div>
        {/* Meal type & day label centered below the progress counter */}
        <div className="bg-white/90 rounded-full px-3 py-1 shadow-sm">
          <p className="text-xs font-medium text-gray-800 capitalize">
            {/* Ensure we get the meal type from either property, using a consistent display */}
            {(currentMeal.meal_type || currentMeal.mealType || '')?.toLowerCase()} · Day {mealDayNumber}
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
              {currentMeal.nutrition && (
                <div>
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
                      value={currentMeal.nutrition.fiber || 0} 
                      unit="g" 
                      label="Fiber" 
                    />
                    <NutrientMetric 
                      value={currentMeal.nutrition.sugar || 0} 
                      unit="g" 
                      label="Sugar" 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Swipe indicators - arrows on both sides */}
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex justify-between items-center px-4 text-white/50">
          <ChevronLeft className={`w-12 h-12 ${currentMealIndex > 0 ? 'opacity-30' : 'opacity-0'} drop-shadow-md`} />
          <ChevronRight className={`w-12 h-12 ${currentMealIndex < allMeals.length - 1 ? 'opacity-30' : 'opacity-0'} drop-shadow-md`} />
        </div>
        
        {/* Meal index indicators */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <div className="flex space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-3 py-2 shadow-sm">
            {allMeals.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentMealIndex(idx);
                }}
                className={`w-2.5 h-2.5 rounded-full ${
                  idx === currentMealIndex ? 'bg-teal-600' : 'bg-gray-300'
                }`}
                aria-label={`Go to meal ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}