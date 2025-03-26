import React, { useState, useEffect } from 'react';

const CulturalInfo = ({ selectedCuisine }) => {
  const [culturalInfo, setCulturalInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCulturalInfo = async () => {
      if (!selectedCuisine) {
        setCulturalInfo(null);
        return;
      }
      
      setLoading(true);
      setError('');
      
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        console.log(`Fetching from: ${apiUrl}/cultural-info/${selectedCuisine.toLowerCase()}`);
        
        const response = await fetch(`${apiUrl}/cultural-info/${selectedCuisine.toLowerCase()}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        setCulturalInfo(data);
      } catch (err) {
        console.error('Error fetching cultural information:', err);
        setError('Failed to load cultural information. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchCulturalInfo();
  }, [selectedCuisine]);

  if (!selectedCuisine) {
    return (
      <div className="mt-6 p-8 bg-gray-50/50 backdrop-blur-sm rounded-2xl border border-gray-100 text-center">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </div>
          <p className="text-gray-500 font-light">Select a cuisine to explore its unique characteristics</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-6 p-8 bg-gray-50/50 backdrop-blur-sm rounded-2xl border border-gray-100 animate-pulse">
        <div className="flex items-center space-x-3 mb-6">
          <div className="h-8 w-8 rounded-full bg-gray-300"></div>
          <div className="h-5 bg-gray-300 rounded-full w-1/3"></div>
        </div>
        <div className="h-4 bg-gray-300 rounded-full w-3/4 mb-4"></div>
        <div className="h-4 bg-gray-300 rounded-full w-2/3 mb-8"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="h-5 bg-gray-300 rounded-full w-1/3 mb-4"></div>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-8 w-20 bg-gray-300 rounded-full"></div>
              ))}
            </div>
          </div>
          <div>
            <div className="h-5 bg-gray-300 rounded-full w-1/3 mb-4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-300 rounded-full w-full"></div>
              <div className="h-4 bg-gray-300 rounded-full w-5/6"></div>
              <div className="h-4 bg-gray-300 rounded-full w-4/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 p-6 bg-red-50/70 backdrop-blur-sm text-red-700 rounded-2xl border border-red-100 flex items-center space-x-3">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>{error}</p>
      </div>
    );
  }

  if (!culturalInfo) return null;

  // Get color accent or default to a modern indigo
  const accentColor = culturalInfo.colorAccent || "#6366F1";
  
  // Create a lighter version for backgrounds
  const getLighterColor = () => {
    // Remove the # and convert to RGB
    const hex = accentColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Return a very light version with high transparency
    return `rgba(${r}, ${g}, ${b}, 0.08)`;
  };
  
  return (
    <div 
      className="mt-1 mb-5 p-8 bg-white/90 backdrop-blur-md rounded-2xl border border-gray-100 transition-all duration-300"
      style={{ 
        background: `linear-gradient(to bottom right, white, ${getLighterColor()})`,
      }}
    >
      <div className="flex items-center mb-6">
        <div 
          className="h-10 w-1.5 rounded-full mr-4" 
          style={{ backgroundColor: accentColor }}
        ></div>
        <div>
          <h3 
            className="text-2xl font-medium"
            style={{ color: accentColor }}
          >
            {culturalInfo.cuisine}
          </h3>
          <p className="text-gray-600 mt-1 font-light">{culturalInfo.description}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="relative">
          <h4 className="text-lg font-medium text-gray-800 mb-4 flex items-center">
            <span 
              className="w-6 h-6 mr-2 rounded-full flex items-center justify-center text-white text-xs"
              style={{ backgroundColor: accentColor }}
            >
              1
            </span>
            Key Ingredients
          </h4>
          
          <div className="flex flex-wrap gap-2 mb-5">
            {culturalInfo.keyIngredients.map((ingredient, index) => (
              <span 
                key={index} 
                className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
                style={{ 
                  backgroundColor: getLighterColor(),
                  color: accentColor,
                  border: `1px solid ${accentColor}20`
                }}
              >
                {ingredient}
              </span>
            ))}
          </div>
        </div>
        
        <div>
          <h4 className="text-lg font-medium text-gray-800 mb-4 flex items-center">
            <span 
              className="w-6 h-6 mr-2 rounded-full flex items-center justify-center text-white text-xs"
              style={{ backgroundColor: accentColor }}
            >
              2
            </span>
            Health Benefits
          </h4>
          
          {Array.isArray(culturalInfo.healthBenefits) ? (
            <ul className="space-y-3">
              {culturalInfo.healthBenefits.map((benefit, index) => (
                <li 
                  key={index} 
                  className="flex items-start p-3 rounded-xl transition-all duration-200 hover:bg-gray-50"
                  style={{ 
                    borderLeft: `2px solid ${accentColor}` 
                  }}
                >
                  <span className="text-gray-700">{benefit}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p 
              className="p-3 rounded-xl"
              style={{ 
                borderLeft: `2px solid ${accentColor}`,
                background: getLighterColor() 
              }}
            >
              {culturalInfo.healthBenefits}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CulturalInfo;