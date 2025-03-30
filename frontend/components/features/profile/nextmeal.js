"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon } from 'lucide-react';

function NextMealCard({ meal, onJustAte, handleCreateNewMeals }) {
  const [isSelected, setIsSelected] = useState(false);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 max-w-3xl mx-auto">
      <div
        className={`flex flex-col md:flex-row gap-4 overflow-hidden relative
          ${isSelected ? "ring-2 ring-white" : ""}`}
      >
        <div
          className="w-full md:w-1/4 h-40 md:h-auto relative cursor-pointer group"
          onClick={() => setIsSelected(!isSelected)}
        >
          <img
            src={meal.image || ''}
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

          {meal.id && (
            <button
              onClick={() => router.push(`/mealplan/${meal.id}`)}
              className="w-full mt-3 py-2 bg-teal-500 hover:bg-teal-600 text-white font-bold transition-all"
            >
              See Recipe →
            </button>
          )}
          
          {isSelected && meal.name && (
            <button
              onClick={() => {
                onJustAte();
                setIsSelected(false);
              }}
              className="w-full mt-3 py-2 bg-teal-500 hover:bg-teal-600 text-white font-bold transition-all flex items-center justify-center"
            >
              <CheckIcon className="w-4 h-4 mr-2" />
              Mark as Completed
            </button>
          )}
        </div>
      </div>

      <button
        onClick={handleCreateNewMeals}
        className="w-full py-2 px-4 mt-2 bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all">
        Create New Meals
      </button>
    </div>
  );
}

export default NextMealCard;