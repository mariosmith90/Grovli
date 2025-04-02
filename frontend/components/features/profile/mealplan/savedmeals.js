"use client";

function SavedMeals({ mealType, onSelectMeal, savedMeals, isLoading, handleCreateNewMeals }) {
  // Add safety check for when mealType or savedMeals are undefined
  if (!mealType || !savedMeals) {
    console.log("SavedMeals: Missing mealType or savedMeals", { mealType, savedMeals });
    return <div className="py-8 text-center text-gray-500">Unable to load meals. Please try again.</div>;
  }
  
  const meals = savedMeals[mealType] || [];
  console.log(`SavedMeals: Found ${meals.length} meals for ${mealType}`);
  
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
        {meals.map((meal) => (
          <div 
            key={meal.id}
            onClick={() => onSelectMeal(meal)}
            className="flex items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition"
          >
            <img 
              src={meal.image || ''} 
              alt={meal.name} 
              className="w-16 h-16 object-cover"
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

export default SavedMeals;