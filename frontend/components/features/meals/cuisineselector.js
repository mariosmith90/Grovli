"use client";
import { useState } from 'react';
import CulturalInfo from './culturalinfo';

export default function CuisineSelector({ 
  availableCuisines = [
    { name: "American", image: "/images/cuisines/american.jpg" },
    { name: "Asian", image: "/images/cuisines/asian.jpg" },
    { name: "Caribbean", image: "/images/cuisines/caribbean.jpg" },
    { name: "Indian", image: "/images/cuisines/indian.jpg" },
    { name: "Latin", image: "/images/cuisines/latin.jpg" },
    { name: "Mediterranean", image: "/images/cuisines/mediterranean.jpg" }
  ],
  selectedCuisines = "",
  onSelect
}) {
  const [selectedInfoCuisine, setSelectedInfoCuisine] = useState(null);

  const handleCuisineSelect = (cuisine) => {
    setSelectedInfoCuisine(cuisine.name);
    if (onSelect) {
      onSelect(cuisine.name, (prev) => {
        const preferencesArray = prev.split(" ").filter(Boolean);
        const updatedPreferences = preferencesArray.filter((item) =>
          !availableCuisines.map(c => c.name).includes(item)
        );
        return [...updatedPreferences, cuisine.name].join(" ");
      });
    }
  };

  const toggleCuisineInfo = (cuisineName, e) => {
    e.stopPropagation();
    setSelectedInfoCuisine(prevSelected => 
      prevSelected === cuisineName ? null : cuisineName
    );
  };

  return (
    <div className="mb-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {availableCuisines.map((cuisine) => (
          <div 
            key={cuisine.name} 
            className={`relative rounded-lg overflow-hidden cursor-pointer transition-all transform hover:scale-105 ${
              selectedCuisines.includes(cuisine.name) ? "ring-4 ring-orange-500" : ""
            }`}
            onClick={() => handleCuisineSelect(cuisine)}
          >
            <div className="aspect-[4/3] bg-gray-200">
              <img 
                src={cuisine.image} 
                alt={`${cuisine.name} cuisine`} 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = "/placeholder.jpg";
                }}
              />
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <p className="text-white font-medium">{cuisine.name}</p>
            </div>
            
            <button 
              className="absolute top-2 right-2 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-800 hover:bg-white transition-colors shadow-md z-10"
              onClick={(e) => toggleCuisineInfo(cuisine.name, e)}
              aria-label={`Information about ${cuisine.name} cuisine`}
            >
              <span className="text-sm font-semibold">i</span>
            </button>
            
            {selectedCuisines.includes(cuisine.name) && (
              <div className="absolute top-0 left-0 w-full h-full bg-orange-500/20 pointer-events-none" />
            )}
          </div>
        ))}
      </div>
      
      {selectedInfoCuisine && (
        <div className="mt-2 p-4 bg-gray-100 rounded-lg">
          <CulturalInfo selectedCuisine={selectedInfoCuisine} />
        </div>
      )}
    </div>
  );
}