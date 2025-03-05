"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { PlusCircle, Coffee, Utensils, Apple, Moon, ArrowLeft, Activity, Flame, CheckIcon } from 'lucide-react';
import Header from '../../components/header.js'
import Footer from '../../components/footer.js'

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const isAuthenticated = !!user;
  
  // States for meal planning
  const [activeSection, setActiveSection] = useState('timeline');
  const [selectedMealType, setSelectedMealType] = useState(null);
  const [calorieData, setCalorieData] = useState({
    consumed: 1200,
    target: 2000
  });

  // Function for meal plan creation
  const handleCreateNewMeals = () => {
    router.push('/meals');
  };
  
  // Track which meal is current
  const [currentMealIndex, setCurrentMealIndex] = useState(1); // Starting with lunch as current
  
  // Placeholder data (will be replaced with API data)
  const [nextMeal, setNextMeal] = useState({
    name: "Grilled Chicken Salad",
    time: "12:30 PM",
    calories: 350,
    protein: 35,
    carbs: 15,
    fat: 12,
    image: "/images/chicken-salad.jpg",
    type: "lunch" // Added type to track which meal it is
  });
  
  const [mealPlan, setMealPlan] = useState([
    { type: 'breakfast', name: 'Oatmeal with Berries', calories: 350, time: '8:00 AM', completed: true },
    { type: 'lunch', name: 'Grilled Chicken Salad', calories: 450, time: '12:30 PM', completed: false },
    { type: 'snack', name: '', calories: 0, time: '3:30 PM', completed: false },
    { type: 'dinner', name: 'Salmon with Vegetables', calories: 550, time: '7:00 PM', completed: false }
  ]);

  // Placeholder saved meals data (will be replaced with API data)
  const savedMeals = {
    breakfast: [
      { id: 1, name: 'Oatmeal with Berries', calories: 350, image: '/images/oatmeal.jpg' },
      { id: 2, name: 'Avocado Toast', calories: 420, image: '/images/avocado-toast.jpg' },
      { id: 3, name: 'Greek Yogurt with Granola', calories: 300, image: '/images/yogurt.jpg' }
    ],
    lunch: [
      { id: 4, name: 'Grilled Chicken Salad', calories: 450, image: '/images/chicken-salad.jpg' },
      { id: 5, name: 'Quinoa Bowl', calories: 520, image: '/images/quinoa-bowl.jpg' },
      { id: 6, name: 'Turkey Sandwich', calories: 480, image: '/images/turkey-sandwich.jpg' }
    ],
    snack: [
      { id: 7, name: 'Apple with Almond Butter', calories: 200, image: '/images/apple.jpg' },
      { id: 8, name: 'Protein Shake', calories: 180, image: '/images/protein-shake.jpg' },
      { id: 9, name: 'Mixed Nuts', calories: 170, image: '/images/nuts.jpg' }
    ],
    dinner: [
      { id: 10, name: 'Salmon with Vegetables', calories: 550, image: '/images/salmon.jpg' },
      { id: 11, name: 'Chicken Stir Fry', calories: 520, image: '/images/stir-fry.jpg' },
      { id: 12, name: 'Vegetable Pasta', calories: 480, image: '/images/pasta.jpg' }
    ]
  };

  // Initialize the app with some values based on meal plan
  useEffect(() => {
    // Find the current meal index (first non-completed meal)
    const currentIndex = mealPlan.findIndex(meal => !meal.completed);
    if (currentIndex !== -1) {
      setCurrentMealIndex(currentIndex);
      
      // Update next meal data
      const currentMeal = mealPlan[currentIndex];
      setNextMeal({
        name: currentMeal.name,
        time: currentMeal.time,
        calories: currentMeal.calories,
        protein: currentMeal.type === 'snack' ? 10 : 30,
        carbs: currentMeal.type === 'snack' ? 15 : 25,
        fat: currentMeal.type === 'snack' ? 5 : 15,
        image: currentMeal.type === 'snack' ? "/images/apple.jpg" : 
              currentMeal.type === 'dinner' ? "/images/salmon.jpg" : 
              currentMeal.type === 'breakfast' ? "/images/oatmeal.jpg" : "/images/chicken-salad.jpg",
        type: currentMeal.type
      });
    }
    
    // Calculate consumed calories from completed meals
    const completedCalories = mealPlan
      .filter(meal => meal.completed)
      .reduce((sum, meal) => sum + meal.calories, 0);
    
    setCalorieData(prev => ({ ...prev, consumed: completedCalories }));
  }, []);

  // Handle meal selection
  const handleAddMeal = (mealType) => {
    setSelectedMealType(mealType);
    setActiveSection('savedMeals');
  };

  // Handle selecting a saved meal
  const handleSelectSavedMeal = (meal) => {
    const updatedMealPlan = mealPlan.map(item => 
      item.type === selectedMealType ? { ...item, name: meal.name, calories: meal.calories } : item
    );
    
    setMealPlan(updatedMealPlan);
    setActiveSection('timeline');
    
    // Recalculate consumed calories
    const totalCalories = updatedMealPlan.reduce((sum, meal) => sum + meal.calories, 0);
    setCalorieData({...calorieData, consumed: totalCalories});
  };
  
  // Handle "Just Ate" button click
  const handleJustAte = () => {
    // Mark current meal as completed
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
    
    // Update state
    setMealPlan(updatedMealPlan);
    setCurrentMealIndex(nextIndex);
    
    // Update next meal card
    if (nextIndex < mealPlan.length) {
      const nextMealData = updatedMealPlan[nextIndex];
      setNextMeal({
        name: nextMealData.name || "No meal planned",
        time: nextMealData.time,
        calories: nextMealData.calories,
        protein: nextMealData.type === 'snack' ? 10 : 30, // Placeholder values
        carbs: nextMealData.type === 'snack' ? 15 : 25,
        fat: nextMealData.type === 'snack' ? 5 : 15,
        image: nextMealData.type === 'snack' ? "/images/apple.jpg" : 
               nextMealData.type === 'dinner' ? "/images/salmon.jpg" : "/images/chicken-salad.jpg",
        type: nextMealData.type // Add the meal type to the next meal
      });
    }
    
    // Update calorie count
    const completedCalories = updatedMealPlan
      .filter(meal => meal.completed)
      .reduce((sum, meal) => sum + meal.calories, 0);
    
    setCalorieData({
      ...calorieData,
      consumed: completedCalories
    });
  };

  return (
    <>
      <Header />

      {/* Full-screen white background */}
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>

      {/* Main Content Container - Ensures content starts below navbar */}
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg w-full max-w-4xl flex-grow flex flex-col">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">
            Your Meal Plan
          </h2>
          
          {/* Next Meal Section */}
          <section className="mb-6 bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-3">
              Your {nextMeal.type === 'breakfast' ? 'Breakfast' :
                    nextMeal.type === 'lunch' ? 'Lunch' :
                    nextMeal.type === 'dinner' ? 'Dinner' : 'Snack'} 
              {' '}({nextMeal.time})
            </h2>
            <NextMealCard meal={nextMeal} onJustAte={handleJustAte} handleCreateNewMeals={handleCreateNewMeals} />
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
              />
            </section>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}

function NextMealCard({ meal, onJustAte, handleCreateNewMeals }) {
  const [isSelected, setIsSelected] = useState(false);

  const handleSelection = () => {
    setIsSelected((prev) => !prev); // Toggle selection state
  };

  // Add a "Just Ate" button when the meal is selected
  return (
    <div className="flex flex-col gap-2 max-w-3xl mx-auto">
      <div
        className={`flex flex-col md:flex-row gap-4 bg-gray-50 rounded-lg overflow-hidden relative
          ${isSelected ? "ring-2 ring-teal-500" : ""}`}
      >
        {/* Clickable Image Section */}
        <div
          className="w-full md:w-1/4 h-40 md:h-auto relative cursor-pointer group"
          onClick={handleSelection} // Toggle selection on click
        >
          <img
            src={meal.image}
            alt={meal.name}
            className="w-full h-full object-cover"
          />

          {/* Shade effect */}
          <div
            className={`absolute inset-0 transition-opacity ${
              isSelected ? "bg-gray-200/50 backdrop-blur-sm" : "bg-black/20 opacity-0 group-hover:opacity-100"
            }`}
          />

          {/* Text overlay: Click to Select / Selected */}
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
            <h3 className="text-lg font-bold">{meal.name}</h3>
            <span className="text-sm text-gray-500">{meal.time}</span>
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
          {isSelected && (
            <button
              onClick={() => {
                onJustAte(); // This will mark the meal as completed and update to next meal
                setIsSelected(false); // Reset selection state
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

// Component: CalorieProgressBar
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

// Component: MealTimeline
function MealTimeline({ meals, onAddMeal }) {
  // Icons for each meal type
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
                      <p className={isCompleted ? "line-through text-gray-500" : ""}>{meal.name}</p>
                      <p className="text-sm text-gray-600">{meal.calories} calories</p>
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

// Component: SavedMeals
function SavedMeals({ mealType, onSelectMeal, savedMeals }) {
  const meals = savedMeals[mealType] || [];
  
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