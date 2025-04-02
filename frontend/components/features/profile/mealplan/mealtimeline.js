"use client";

import { useRouter } from 'next/navigation';
import { Coffee, Utensils, Apple, Moon, CheckIcon, PlusCircle, TrashIcon } from 'lucide-react';

function MealTimeline({ meals, onAddMeal, onRemoveMeal, toggleMealCompletion, completedMeals, savingMeals }) {
  const mealIcons = {
    breakfast: Coffee,
    lunch: Utensils,
    snack: Apple,
    dinner: Moon
  };
  const router = useRouter();

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
          const isCompleted = completedMeals[meal.type] || meal.completed;
          const isCurrent = !isCompleted && isPast && 
            (index === meals.length - 1 || currentMinutes < timeToMinutes(meals[index + 1].time));
          const isSaving = savingMeals && savingMeals[`${new Date().toISOString().split('T')[0]}-${meal.type}`];

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
                onClick={() => toggleMealCompletion(meal.type)}
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
                          {meal.image && (
                            <img 
                              src={meal.image} 
                              alt={meal.name} 
                              className={`w-12 h-12 object-cover mr-3 cursor-pointer hover:ring-2 hover:ring-teal-500 hover:ring-offset-2 transition-all ${
                                isCompleted ? "opacity-70" : ""
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/recipes/${meal.id}`);
                              }}
                            />
                          )}
                          <div className={isCompleted ? "opacity-70" : ""}>
                            <p className={isCompleted ? "line-through text-gray-500" : ""}>{meal.name}</p>
                            <p className="text-sm text-gray-600">{meal.calories} calories</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center">
                          {isSaving && (
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