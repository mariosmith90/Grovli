"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { PlusCircle, Coffee, Utensils, Apple, Moon, ArrowLeft, CheckIcon, TrashIcon } from 'lucide-react';
import Header from '../../components/header';
import Footer from '../../components/footer';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const isAuthenticated = !!user;
  
  // States with simplified initialization
  const [activeSection, setActiveSection] = useState('timeline');
  const [selectedMealType, setSelectedMealType] = useState(null);
  const [calorieData, setCalorieData] = useState({ consumed: 350, target: 2000 });
  const [savedMealPlans, setSavedMealPlans] = useState([]);
  const [isLoadingSavedMeals, setIsLoadingSavedMeals] = useState(true);
  const [currentMealIndex, setCurrentMealIndex] = useState(1); // Starting with lunch as current

  // Default meal structure
  const defaultMeal = {
    name: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    image: '',
    completed: false
  };
  
  // Initialize with default times and meal types
  const [mealPlan, setMealPlan] = useState([
    { ...defaultMeal, type: 'breakfast', time: '8:00 AM' },
    { ...defaultMeal, type: 'lunch', time: '12:30 PM' },
    { ...defaultMeal, type: 'snack', time: '3:30 PM' },
    { ...defaultMeal, type: 'dinner', time: '7:00 PM' }
  ]);

  // Next meal state derived from current meal
  const [nextMeal, setNextMeal] = useState({
    ...defaultMeal,
    time: '12:30 PM',
    type: 'lunch'
  });

  // Saved meals by category
  const [savedMeals, setSavedMeals] = useState({
    breakfast: [],
    lunch: [],
    snack: [],
    dinner: []
  });

  // Fetch saved meal plans with proper authentication
  const fetchSavedMealPlans = async () => {
    if (!user) {
      setIsLoadingSavedMeals(false);
      return;
    }

    try {
      setIsLoadingSavedMeals(true);
      
      // Reset states
      setSavedMealPlans([]);
      setSavedMeals({ breakfast: [], lunch: [], snack: [], dinner: [] });
      
      // Get access token
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
      // API request
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/api/user-recipes/saved-recipes/`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }
      
      const data = await response.json();
      setSavedMealPlans(data);
      
      // Process meals by category
      const categorizedMeals = { breakfast: [], lunch: [], snack: [], dinner: [] };
      
      // Group recipes by meal type
      data.forEach(plan => {
        if (plan.recipes && Array.isArray(plan.recipes)) {
          plan.recipes.forEach(recipe => {
            const mealType = (recipe.meal_type || '').toLowerCase();
            const category = ['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType) 
              ? mealType : 'snack';
            
            const formattedMeal = {
              id: recipe.id,
              name: recipe.title,
              calories: recipe.nutrition?.calories || 0,
              protein: recipe.nutrition?.protein || 0,
              carbs: recipe.nutrition?.carbs || 0,
              fat: recipe.nutrition?.fat || 0,
              image: recipe.imageUrl || recipe.image_url || "",
              ingredients: recipe.ingredients || [],
              instructions: recipe.instructions || ''
            };
            
            // Add if not duplicate
            if (!categorizedMeals[category].some(meal => meal.name === formattedMeal.name)) {
              categorizedMeals[category].push(formattedMeal);
            }
          });
        }
      });
      
      setSavedMeals(categorizedMeals);
      populateMealPlanFromSavedMeals(categorizedMeals);
      
    } catch (error) {
      console.error('Error fetching saved meal plans:', error);
    } finally {
      setIsLoadingSavedMeals(false);
    }
  };
  
  // Populate meal plan with saved meals
  const populateMealPlanFromSavedMeals = (categorizedMeals) => {
    const updatedMealPlan = mealPlan.map(meal => {
      // If meal slot is empty and we have saved meals of this type
      if (!meal.name && categorizedMeals[meal.type]?.length > 0) {
        const randomIndex = Math.floor(Math.random() * categorizedMeals[meal.type].length);
        const savedMeal = categorizedMeals[meal.type][randomIndex];
        
        return {
          ...meal,
          name: savedMeal.name,
          calories: savedMeal.calories,
          protein: savedMeal.protein,
          carbs: savedMeal.carbs,
          fat: savedMeal.fat,
          image: savedMeal.image
        };
      }
      return meal;
    });
    
    setMealPlan(updatedMealPlan);
    
    // Update next meal card
    const currentIndex = updatedMealPlan.findIndex(meal => !meal.completed);
    if (currentIndex !== -1) {
      setCurrentMealIndex(currentIndex);
      updateNextMealCard(updatedMealPlan[currentIndex]);
    }
  };
  
  // Update next meal card
  const updateNextMealCard = (meal) => {
    if (!meal) return;
    
    setNextMeal({
      name: meal.name || "No meal planned",
      time: meal.time,
      calories: meal.calories || 0,
      protein: meal.protein || 0,
      carbs: meal.carbs || 0,
      fat: meal.fat || 0,
      image: meal.image || "",
      type: meal.type
    });
  };

  // Initialize the app
  useEffect(() => {
    if (isAuthenticated) {
      fetchSavedMealPlans();
    }
    
    // Update calorie count
    updateCalorieCount();
  }, [isAuthenticated]);

  // Update calorie count based on completed meals
  const updateCalorieCount = () => {
    const completedCalories = mealPlan
      .filter(meal => meal.completed)
      .reduce((sum, meal) => sum + (meal.calories || 0), 0);
    
    setCalorieData(prev => ({ ...prev, consumed: completedCalories }));
  };

  // Navigation functions
  const handleCreateNewMeals = () => router.push('/meals');
  const handleAddMeal = (mealType) => {
    setSelectedMealType(mealType);
    setActiveSection('savedMeals');
  };

  // Select a saved meal
  const handleSelectSavedMeal = (meal) => {
    const mealTypeIndex = mealPlan.findIndex(item => item.type === selectedMealType);
    
    if (mealTypeIndex !== -1) {
      const updatedMealPlan = [...mealPlan];
      updatedMealPlan[mealTypeIndex] = {
        ...updatedMealPlan[mealTypeIndex],
        name: meal.name,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        image: meal.image
      };
      
      setMealPlan(updatedMealPlan);
      
      // Update next meal if needed
      if (mealTypeIndex === currentMealIndex) {
        updateNextMealCard(updatedMealPlan[mealTypeIndex]);
      }
      
      updateCalorieCount();
    }
    
    setActiveSection('timeline');
  };
  
  // Mark current meal as eaten
  const handleJustAte = () => {
    const updatedMealPlan = [...mealPlan];
    updatedMealPlan[currentMealIndex].completed = true;
    
    // Find next incomplete meal
    let nextIndex = currentMealIndex;
    for (let i = currentMealIndex + 1; i < mealPlan.length; i++) {
      if (!updatedMealPlan[i].completed && updatedMealPlan[i].name) {
        nextIndex = i;
        break;
      }
    }
    
    setMealPlan(updatedMealPlan);
    setCurrentMealIndex(nextIndex);
    updateNextMealCard(updatedMealPlan[nextIndex]);
    updateCalorieCount();
  };

  // Remove a meal
  const handleRemoveMeal = (mealType) => {
    const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
    
    if (mealIndex !== -1) {
      const updatedMealPlan = [...mealPlan];
      updatedMealPlan[mealIndex] = {
        ...updatedMealPlan[mealIndex],
        ...defaultMeal, // Reset to default values
        type: mealType, // Keep the meal type
        time: updatedMealPlan[mealIndex].time // Keep the time
      };
      
      setMealPlan(updatedMealPlan);
      
      // Update current meal if needed
      if (mealIndex === currentMealIndex) {
        // Find next non-empty meal
        let nextIndex = mealIndex;
        for (let i = 0; i < updatedMealPlan.length; i++) {
          if (updatedMealPlan[i].name) {
            nextIndex = i;
            break;
          }
        }
        
        setCurrentMealIndex(nextIndex);
        updateNextMealCard(updatedMealPlan[nextIndex]);
      }
      
      updateCalorieCount();
    }
  };

  return (
    <>
      <Header />
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg w-full max-w-4xl flex-grow flex flex-col">
          
          {/* Next Meal Section */}
          <section className="mb-6 bg-white rounded-lg shadow-md p-4">
            <h2 className="text-2xl font-semibold mb-3 flex items-center">
              {(() => {
                const Icon = { breakfast: Coffee, lunch: Utensils, snack: Apple, dinner: Moon }[nextMeal.type];
                return (
                  <>
                    <Icon className="w-6 h-6 mr-2 text-teal-600" />
                    {nextMeal.type.charAt(0).toUpperCase() + nextMeal.type.slice(1)}
                  </>
                );
              })()}
            </h2>
            <NextMealCard 
              meal={nextMeal} 
              onJustAte={handleJustAte} 
              handleCreateNewMeals={handleCreateNewMeals} 
            />
            <div className="mt-4">
              <CalorieProgressBar 
                consumed={calorieData.consumed} 
                target={calorieData.target} 
              />
            </div>
          </section>
          
          {/* Conditional Rendering for Timeline or Saved Meals */}
          {activeSection === 'timeline' ? (
            <section className="mb-6 bg-white rounded-lg shadow-md p-4">
              <h2 className="text-lg font-semibold mb-3">Your Meal Timeline</h2>
              <MealTimeline 
                meals={mealPlan} 
                onAddMeal={handleAddMeal}
                onRemoveMeal={handleRemoveMeal}
              />
            </section>
          ) : (
            <section className="mb-6 bg-white rounded-lg shadow-md p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold">Saved Meals</h2>
                <button 
                  onClick={() => setActiveSection('timeline')}
                  className="text-teal-600 hover:underline flex items-center"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back to Timeline
                </button>
              </div>
              <SavedMeals 
                mealType={selectedMealType} 
                onSelectMeal={handleSelectSavedMeal}
                savedMeals={savedMeals}
                isLoading={isLoadingSavedMeals}
                handleCreateNewMeals={handleCreateNewMeals}
              />
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

// Component: NextMealCard - Simplified
function NextMealCard({ meal, onJustAte, handleCreateNewMeals }) {
  const [isSelected, setIsSelected] = useState(false);

  return (
    <div className="flex flex-col gap-2 max-w-3xl mx-auto">
      <div
        className={`flex flex-col md:flex-row gap-4 bg-gray-50 rounded-lg overflow-hidden relative
          ${isSelected ? "ring-2 ring-teal-500" : ""}`}
      >
        {/* Clickable Image Section */}
        <div
          className="w-full md:w-1/4 h-40 md:h-auto relative cursor-pointer group"
          onClick={() => setIsSelected(!isSelected)}
        >
          <img
            src={meal.image}
            alt={meal.name || "No meal selected"}
            className="w-full h-full object-cover"
          />
          <div
            className={`absolute inset-0 transition-opacity ${
              isSelected ? "bg-gray-200/50 backdrop-blur-sm" : "bg-black/20 opacity-0 group-hover:opacity-100"
            }`}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`bg-white/90 rounded-full py-1 px-2 text-xs font-semibold transition-all
                ${isSelected ? "text-teal-700 bg-teal-100 flex items-center" : "text-gray-700"}`}
            >
              {isSelected ? (
                <>
                  <CheckIcon className="w-3 h-3 mr-1" />
                  Selected
                </>
              ) : (
                "Click to Select"
              )}
            </div>
          </div>
        </div>

        {/* Meal Information */}
        <div className="p-3 flex-1">
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-bold">{meal.name || "No meal selected"}</h3>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="text-center p-1.5 bg-blue-50 rounded-lg">
              <p className="text-xs text-gray-600">Calories</p>
              <p className="font-bold text-sm">{meal.calories}</p>
            </div>
            <div className="text-center p-1.5 bg-green-50 rounded-lg">
              <p className="text-xs text-gray-600">Protein</p>
              <p className="font-bold text-sm">{meal.protein}g</p>
            </div>
            <div className="text-center p-1.5 bg-yellow-50 rounded-lg">
              <p className="text-xs text-gray-600">Carbs</p>
              <p className="font-bold text-sm">{meal.carbs}g</p>
            </div>
          </div>
          
          {/* Conditionally show "Mark as Completed" button when selected */}
          {isSelected && meal.name && (
            <button
              onClick={() => {
                onJustAte();
                setIsSelected(false);
              }}
              className="w-full mt-3 py-2 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-lg transition-all flex items-center justify-center"
            >
              <CheckIcon className="w-4 h-4 mr-2" />
              Mark as Completed
            </button>
          )}
        </div>
      </div>

      {/* Create New Meals Button */}
      <button
        onClick={handleCreateNewMeals}
        className="w-full py-2 px-4 mt-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-all"
      >
        Create New Meals
      </button>
    </div>
  );
}

// Component: CalorieProgressBar - Simplified
function CalorieProgressBar({ consumed, target }) {
  const percentage = Math.min(Math.round((consumed / target) * 100), 100);
  const remaining = target - consumed;
  
  return (
    <div className="mt-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium">Daily Calories</span>
        <span className="text-sm font-medium">{consumed} / {target} kcal</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4">
        <div 
          className="bg-teal-600 h-4 rounded-full" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <p className="text-sm text-gray-600 mt-2">
        {remaining > 0 
          ? `You have ${remaining} calories remaining today` 
          : "You've reached your calorie goal for today"}
      </p>
    </div>
  );
}

// Component: MealTimeline - Simplified
function MealTimeline({ meals, onAddMeal, onRemoveMeal }) {
  const mealIcons = {
    breakfast: Coffee,
    lunch: Utensils,
    snack: Apple,
    dinner: Moon
  };
  
  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-6 top-0 bottom-0 w-1 bg-gray-200"></div>
      
      {/* Timeline items */}
      <div className="space-y-8">
        {meals.map((meal, index) => {
          const Icon = mealIcons[meal.type];
          const isCompleted = meal.completed;
          const isCurrentMeal = meals.filter(m => m.completed).length === index;
          
          return (
            <div key={index} className="relative flex items-start">
              {/* Highlight line for current progress */}
              {(isCompleted || isCurrentMeal) && (
                <div className="absolute left-6 top-0 bottom-0 w-1 bg-teal-500" 
                     style={{ 
                       top: index === 0 ? '0' : '-2rem', 
                       bottom: isCurrentMeal ? '50%' : (index === meals.length - 1 ? '0' : '-2rem') 
                     }}
                ></div>
              )}
              
              <div className={`flex items-center justify-center rounded-full h-12 w-12 z-10 
                ${isCompleted 
                  ? "bg-teal-500 text-white" 
                  : isCurrentMeal 
                    ? "bg-teal-100 ring-2 ring-teal-500" 
                    : "bg-gray-100"}`}
              >
                {isCompleted ? (
                  <CheckIcon className="h-6 w-6 text-white" />
                ) : (
                  <Icon className={`h-6 w-6 ${isCurrentMeal ? "text-teal-600" : "text-gray-500"}`} />
                )}
              </div>
              
              <div className="ml-4 flex-1">
                <div className={`p-4 rounded-lg ${
                  isCompleted 
                    ? "bg-teal-50 border border-teal-200" 
                    : isCurrentMeal 
                      ? "bg-white border-2 border-teal-200 shadow-sm" 
                      : "bg-gray-50"
                }`}>
                  <div className="flex justify-between items-center">
                    <h3 className={`font-medium capitalize ${isCompleted || isCurrentMeal ? "text-teal-800" : ""}`}>
                      {meal.type}
                      {isCompleted && <span className="ml-2 text-xs text-teal-600">✓ Completed</span>}
                      {isCurrentMeal && <span className="ml-2 text-xs text-teal-600">Current</span>}
                    </h3>
                    <span className="text-sm text-gray-500">{meal.time}</span>
                  </div>
                  
                  {meal.name ? (
                    <div className="mt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {meal.image && (
                            <img 
                              src={meal.image} 
                              alt={meal.name} 
                              className="w-12 h-12 rounded-md object-cover mr-3"
                            />
                          )}
                          <div>
                            <p className={isCompleted ? "line-through text-gray-500" : ""}>{meal.name}</p>
                            <p className="text-sm text-gray-600">{meal.calories} calories</p>
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => onRemoveMeal(meal.type)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove meal"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
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

// Component: SavedMeals - Simplified
function SavedMeals({ mealType, onSelectMeal, savedMeals, isLoading, handleCreateNewMeals }) {
  const meals = savedMeals[mealType] || [];
  
  if (isLoading) {
    return <div className="py-8 text-center text-gray-500">Loading saved meals...</div>;
  }
  
  if (meals.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        <p>You don't have any saved {mealType} meals yet.</p>
        <div className="mt-4">
          <button 
            onClick={handleCreateNewMeals}
            className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg transition-all"
          >
            Create new meals
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div>
      <h3 className="text-lg font-medium mb-4 capitalize">Saved {mealType} Options</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {meals.map((meal) => (
          <div 
            key={meal.id}
            onClick={() => onSelectMeal(meal)}
            className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition"
          >
            <img 
              src={meal.image} 
              alt={meal.name} 
              className="w-16 h-16 rounded-md object-cover"
            />
            <div className="ml-3">
              <h4 className="font-medium">{meal.name}</h4>
              <p className="text-sm text-gray-600">{meal.calories} calories</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}