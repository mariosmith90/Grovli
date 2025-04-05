"use client";

import { useRouter } from 'next/navigation';
import { useUser } from '@auth0/nextjs-auth0';
import { Coffee, Utensils, Apple, Moon, CheckIcon, PlusCircle, TrashIcon } from 'lucide-react';
import { useMealCompletionService } from '../../../../lib/services/mealCompletionService';
import { useCalorieService } from '../../../../lib/services/calorieDataService';
import { useEffect } from 'react';
import { useMealPlanStore } from '../../../../lib/stores/mealPlanStore';

function MealTimeline({ meals, onAddMeal, onRemoveMeal }) {
  const router = useRouter();
  const { user } = useUser();
  const today = new Date().toISOString().split('T')[0];
  
  // Use the Zustand store directly for consistent state and UI updates
  const completedMeals = useMealPlanStore(state => state.completedMeals);
  const toggleMealCompletion = useMealPlanStore(state => state.toggleMealCompletion);
  
  // Use our services for API sync and calorie calculation
  const { 
    pendingUpdates,
    syncWithBackend,
    getCompletionsForDate 
  } = useMealCompletionService();
  
  const { calculateFromMeals } = useCalorieService();
  
  // Get today's completions directly from the Zustand store
  const todayCompletions = completedMeals;
  
  // Update calorie calculations when either completedMeals or meals change
  useEffect(() => {
    try {
      // Calculate calories based on completion status
      // Use completedMeals directly from the Zustand store
      calculateFromMeals(meals, completedMeals);
    } catch (error) {
      console.error("Error calculating calories from completions:", error);
    }
  }, [completedMeals, meals, calculateFromMeals]);
  
  // Handle meal completion toggle using Zustand's store directly
  const handleToggleCompletion = async (mealType) => {
    if (!user?.sub) {
      return; // Skip if user is not authenticated
    }
    
    // Validate meal type
    if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType.toLowerCase())) {
      console.error('Invalid meal type:', mealType);
      return;
    }
    
    // Get current date for SWR key
    const today = new Date();
    const userId = user.sub;
    
    // Toggle directly through Zustand store for immediate UI update
    // This ensures the UI updates immediately with the toggled state
    const newStatus = toggleMealCompletion(mealType, today);
    
    // Use SWR pattern for backend sync
    try {
      // Perform the actual backend sync
      await syncWithBackend(userId, mealType, newStatus, today);
    } catch (error) {
      console.error('Error updating meal completion:', error);
      // If there's an error, we could revert the toggle here
      // But SWR and the Zustand store already handle error cases
    }
  };
  
  // Meal type icons mapping
  const mealIcons = {
    breakfast: Coffee,
    lunch: Utensils,
    snack: Apple,
    dinner: Moon
  };
  
  // Helper to convert time to minutes for comparison
  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours);
    minutes = parseInt(minutes || 0);
    if (modifier?.toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (modifier?.toLowerCase() === 'am' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };
  
  // Get current time in minutes
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  return (
    <div className="relative">
      <div className="absolute left-6 top-0 bottom-0 w-1 bg-gray-200"></div>
      
      <div className="space-y-8">
        {meals.map((meal, index) => {
          const Icon = mealIcons[meal.type];
          const mealMinutes = timeToMinutes(meal.time);
          const isPast = currentMinutes > mealMinutes;
          
          // Check completion status from all possible sources to ensure UI consistency
          // We prioritize the Zustand store state (todayCompletions) since it's the most up-to-date
          const isCompleted = todayCompletions[meal.type] === true || meal.completed === true;
          
          // Determine if this is the current meal (first uncompleted meal in the past)
          const isCurrent = !isCompleted && isPast && 
            (index === meals.length - 1 || currentMinutes < timeToMinutes(meals[index + 1].time));
          
          // Check if we're syncing with the backend directly from Zustand store
          const pendingKey = `${today}-${meal.type}`;
          const isPending = pendingUpdates[pendingKey]?.status === 'syncing';
          
          return (
            <div key={index} className="relative flex items-start">
              {(isCompleted) && (
                <div className="absolute left-6 top-0 bottom-0 w-1 bg-teal-500" 
                     style={{ 
                       top: index === 0 ? '0' : '-2rem', 
                       bottom: index === meals.length - 1 ? '0' : '-2rem'
                     }}
                ></div>
              )}
              
              <div 
                className={`flex items-center justify-center rounded-full h-12 w-12 z-10 cursor-pointer
                  ${isCompleted 
                    ? "bg-teal-500 text-white" 
                    : "bg-gray-200 text-gray-500"}`}
                onClick={() => handleToggleCompletion(meal.type)}
              >
                {isCompleted ? (
                  <CheckIcon className="h-6 w-6 text-white" />
                ) : (
                  <Icon className="h-6 w-6 text-gray-500" />
                )}
              </div>
              
              <div className="ml-4 flex-1">
                <div className={`p-4 ${
                  isCompleted 
                    ? "bg-teal-50 border border-teal-100" 
                    : "bg-gray-50 border border-gray-200"
                }`}>
                  <div className="flex justify-between items-center">
                    <h3 className={`font-medium capitalize ${
                      isCompleted 
                        ? "text-teal-800" 
                        : "text-gray-600"
                    }`}>
                      {meal.type}
                      {isCompleted && <span className="ml-2 text-xs text-teal-600">✓ Completed</span>}
                      {isCurrent && !isCompleted && <span className="ml-2 text-xs text-gray-500">Current</span>}
                      {isPast && !isCompleted && !isCurrent && <span className="ml-2 text-xs text-gray-400">Missed</span>}
                    </h3>
                    <span className={`text-sm ${
                      isCompleted 
                        ? "text-teal-600" 
                        : "text-gray-500"
                    }`}>{meal.time}</span>
                  </div>
                  
                  {meal.name ? (
                    <div className="mt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {meal && meal.image && (
                            <img 
                              src={meal.image} 
                              alt={meal.name || 'Meal'} 
                              className={`w-12 h-12 object-cover mr-3 cursor-pointer hover:ring-2 hover:ring-teal-500 hover:ring-offset-2 transition-all ${
                                isCompleted ? "opacity-70" : ""
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (meal.id) {
                                  router.push(`/recipes/${meal.id}`);
                                }
                              }}
                              onError={(e) => {
                                // Fallback for image loading errors
                                e.target.src = '/images/meals/dinner.jpg';
                              }}
                            />
                          )}
                          <div className={isCompleted ? "opacity-70" : ""}>
                            <p className={isCompleted ? "line-through text-gray-500" : ""}>{meal.name || 'Unnamed meal'}</p>
                            <p className="text-sm text-gray-600">
                              {meal.nutrition && typeof meal.nutrition.calories !== 'undefined' 
                                ? `${meal.nutrition.calories} calories` 
                                : '0 calories'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center">
                          {isPending && (
                            <div className="mr-2">
                              <div className="h-4 w-4 rounded-full border-2 border-teal-500 border-t-transparent animate-spin"></div>
                            </div>
                          )}
                          
                          <button 
                            onClick={() => onRemoveMeal(meal.type)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Remove meal"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => onAddMeal(meal.type)}
                      className="mt-2 flex items-center text-teal-600 hover:text-teal-800"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      <span>Add {meal.type}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MealTimeline;