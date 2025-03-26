"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function RecipeModal({ mealId, relatedRecipes }) {
  const router = useRouter();
  const [currentRecipeIndex, setCurrentRecipeIndex] = useState(-1);
  const scrollerRef = useRef(null);

  useEffect(() => {
    if (relatedRecipes && mealId) {
      const index = relatedRecipes.findIndex(meal => meal.id === mealId);
      setCurrentRecipeIndex(index);
      scrollToRecipe(index);
    }
  }, [relatedRecipes, mealId]);

  const scrollToRecipe = (index) => {
    if (scrollerRef.current && relatedRecipes[index]) {
      const container = scrollerRef.current;
      const recipeElement = container.children[index];
      const containerWidth = container.clientWidth;
      const recipeWidth = recipeElement.clientWidth;
      const scrollPosition = recipeElement.offsetLeft - (containerWidth / 2) + (recipeWidth / 2);
      
      container.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      });
    }
  };

  const handleThumbnailClick = (recipeId, index) => {
    router.push(`/recipes/${recipeId}`);
    setCurrentRecipeIndex(index);
  };

  if (!relatedRecipes || relatedRecipes.length <= 1) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end pointer-events-none">
      <div className="absolute inset-0 bg-transparent pointer-events-auto" />
      
      <div className="w-full max-w-2xl bg-white rounded-t-2xl shadow-xl pointer-events-auto pb-4">
        <div className="relative px-4 pt-4">
          <div 
            ref={scrollerRef}
            className="flex space-x-4 overflow-x-auto pb-2 scrollbar-hide"
            style={{ 
              scrollSnapType: 'x mandatory',
              paddingLeft: 'calc(50% - 160px)', // Centers the first card
              paddingRight: 'calc(50% - 160px)'  // Centers the last card
            }}
          >
            {relatedRecipes.map((recipe, index) => (
              <div 
                key={recipe.id}
                className="flex-shrink-0 w-32 h-40 relative rounded-lg overflow-hidden cursor-pointer transition-transform hover:scale-105"
                style={{ scrollSnapAlign: 'center' }}
                onClick={() => handleThumbnailClick(recipe.id, index)}
              >
                {/* Meal type label - now on right side */}
                {recipe.meal_type && (
                  <div className="absolute top-2 right-2 bg-white/90 rounded-full px-2 py-1 z-10">
                    <p className="text-xs font-medium text-gray-800 capitalize">
                      {recipe.meal_type.toLowerCase()}
                    </p>
                  </div>
                )}
                
                <div className="absolute inset-0 bg-gray-100">
                  {recipe.imageUrl ? (
                    <img
                      src={recipe.imageUrl}
                      alt={recipe.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.classList.add('bg-gradient-to-br', 'from-gray-100', 'to-gray-200');
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <span className="text-gray-400 text-xs">No image</span>
                    </div>
                  )}
                </div>
                
                {index === currentRecipeIndex && (
                  <div className="absolute inset-0 ring-4 ring-teal-400 rounded-lg pointer-events-none"></div>
                )}
                
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="text-white text-sm font-medium truncate">{recipe.title}</p>
                  <p className="text-white/80 text-xs">
                    {recipe.nutrition?.calories || 0} kcal
                  </p>
                </div>
              </div>
            ))}
          </div>

          {currentRecipeIndex > 0 && (
            <button
              onClick={() => {
                const prevIndex = currentRecipeIndex - 1;
                handleThumbnailClick(relatedRecipes[prevIndex].id, prevIndex);
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-md hover:bg-gray-100 z-10"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
          )}
          
          {currentRecipeIndex < relatedRecipes.length - 1 && (
            <button
              onClick={() => {
                const nextIndex = currentRecipeIndex + 1;
                handleThumbnailClick(relatedRecipes[nextIndex].id, nextIndex);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-md hover:bg-gray-100 z-10"
            >
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          )}
        </div>

        {relatedRecipes[currentRecipeIndex] && (
          <div className="px-4 pt-2">
            <div className="grid grid-cols-3 gap-2 text-center max-w-md mx-auto">
              <div className="bg-blue-50 rounded-lg p-2">
                <p className="text-xs text-blue-600">Protein</p>
                <p className="font-semibold text-blue-800">
                  {relatedRecipes[currentRecipeIndex].nutrition?.protein || 0}g
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <p className="text-xs text-green-600">Carbs</p>
                <p className="font-semibold text-green-800">
                  {relatedRecipes[currentRecipeIndex].nutrition?.carbs || 0}g
                </p>
              </div>
              <div className="bg-amber-50 rounded-lg p-2">
                <p className="text-xs text-amber-600">Fat</p>
                <p className="font-semibold text-amber-800">
                  {relatedRecipes[currentRecipeIndex].nutrition?.fat || 0}g
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}