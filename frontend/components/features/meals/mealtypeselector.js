"use client";
import { Fragment } from 'react';

export default function MealTypeSelector({ 
  selectedMealType = "Breakfast", 
  onSelect, 
  isPro = false,
  onUpgradeClick
}) {
  const regularMealTypes = [
    { name: "Breakfast", image: "/images/meals/breakfast.jpg" },
    { name: "Lunch", image: "/images/meals/lunch.jpg" },
    { name: "Dinner", image: "/images/meals/dinner.jpg" },
    { name: "Snack", image: "/images/meals/snack.jpg" }
  ];

  const proMealType = { 
    name: "Full Day", 
    image: "/images/meals/full-day.jpg" 
  };

  return (
    <div className="mb-8">
      <p className="text-base font-semibold text-gray-700 mb-3">
        Meal Type
      </p>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {regularMealTypes.map((meal) => (
          <div 
            key={meal.name} 
            className={`relative rounded-lg overflow-hidden cursor-pointer transition-all transform hover:scale-105 ${
              selectedMealType === meal.name ? "ring-4 ring-teal-500" : ""
            }`}
            onClick={() => onSelect(meal.name)}
          >
            <div className="aspect-[4/3] bg-gray-200">
              <img 
                src={meal.image} 
                alt={`${meal.name}`} 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = "/placeholder.jpg";
                }}
              />
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <p className="text-white font-medium">{meal.name}</p>
            </div>
            
            {selectedMealType === meal.name && (
              <div className="absolute top-0 left-0 w-full h-full bg-teal-500/20 pointer-events-none" />
            )}
          </div>
        ))}
        
        <div 
          className={`relative rounded-lg overflow-hidden ${
            isPro ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-70"
          } transition-all transform ${
            selectedMealType === proMealType.name ? "ring-4 ring-teal-500" : ""
          }`}
          onClick={() => {
            if (isPro) {
              onSelect(proMealType.name);
            }
          }}
        >
          <div className="aspect-[4/3] bg-gray-200">
            <img 
              src={proMealType.image} 
              alt={proMealType.name} 
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.src = "/placeholder.jpg";
              }}
            />
            
            {!isPro && (
              <div className="absolute top-2 right-2 bg-teal-600 text-white text-xs px-2 py-1 rounded-full">
                PRO
              </div>
            )}
          </div>
          
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
            <p className="text-white font-medium">{proMealType.name}</p>
          </div>
          
          {selectedMealType === proMealType.name && (
            <div className="absolute top-0 left-0 w-full h-full bg-teal-500/20 pointer-events-none" />
          )}
        </div>
      </div>
      
      {!isPro && (
        <p className="text-sm text-gray-600 mt-2">
          Full Day is a <strong>Pro feature</strong>.{" "}
          <span
            className="text-blue-600 cursor-pointer hover:underline"
            onClick={onUpgradeClick || (() => window.location.href = 'https://buy.stripe.com/aEU7tX2yi6YRe9W3cg')}
          >
            Upgrade Now
          </span>
        </p>
      )}
    </div>
  );
}