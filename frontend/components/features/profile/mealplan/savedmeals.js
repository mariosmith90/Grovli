"use client";

function SavedMeals({ mealType, onSelectMeal, savedMeals={}, isLoading, handleCreateNewMeals }) {
  // Add safety check for when mealType is undefined
  if (!mealType) {
    console.log("SavedMeals: Missing mealType", { mealType });
    return <div className="py-8 text-center text-gray-500">Unable to determine meal type. Please try again.</div>;
  }
  
  // Extra validation for savedMeals
  if (!savedMeals) {
    console.log("SavedMeals: savedMeals is undefined or null");
    savedMeals = {};
  }
  
  // Safely access savedMeals with defaults
  const meals = savedMeals[mealType] ? savedMeals[mealType] : [];
  console.log(`SavedMeals: Found ${meals.length} meals for ${mealType}`, { savedMeals });
  
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
            className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold transition-all"
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
        {Array.isArray(meals) && meals.map((meal) => {
          // Skip invalid meals
          if (!meal || !meal.id) return null;
          
          return (
            <div 
              key={meal.id}
              onClick={() => onSelectMeal(meal)}
              className="flex items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition"
            >
              <img 
                src={meal.image || ''} 
                alt={meal.name} 
                className="w-16 h-16 object-cover"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = '/images/meals/dinner.jpg';  // Default image
                }}
              />
              <div className="ml-3">
                <h4 className="font-medium">{meal.name}</h4>
                <p className="text-sm text-gray-600">
                  {(meal.nutrition && typeof meal.nutrition.calories === 'number') 
                    ? meal.nutrition.calories 
                    : (typeof meal.calories === 'number') 
                      ? meal.calories 
                      : 0} calories
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SavedMeals;