import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast'; // Make sure this is imported
import { getAccessToken } from "@auth0/nextjs-auth0";
import { Plus } from 'lucide-react'; // Import the Plus icon

const CulturalInfo = ({ selectedCuisine, user }) => {
  const [culturalInfo, setCulturalInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addingIngredient, setAddingIngredient] = useState(null);

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

  // Add ingredient to pantry function
  const handleAddToPantry = async (ingredient) => {
    if (!user) {
      toast.error('Please sign in to add items to your pantry');
      return;
    }
  
    setAddingIngredient(ingredient);
    
    try {
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/api/user-pantry/add-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: ingredient,
          quantity: 1,
          // Don't specify category here to trigger auto-categorization
          // The backend will use auto_categorize_item() when category is null
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add ingredient to pantry');
      }
      
      toast.success(`Added ${ingredient} to your pantry`);
      
      // Rest of the function remains the same...
    } catch (error) {
      console.error('Error adding ingredient to pantry:', error);
      toast.error('Failed to add ingredient to pantry');
    } finally {
      setAddingIngredient(null);
    }
  };

  if (loading) {
    // Loading skeleton (unchanged)
    return (
      <div className="">
        {/* ... existing loading skeleton code ... */}
      </div>
    );
  }

  if (error) {
    // Error display (unchanged)
    return (
      <div className="mt-6 p-6 bg-red-50/70 backdrop-blur-sm text-red-700 rounded-2xl border border-red-100 flex items-center space-x-3">
        {/* ... existing error display code ... */}
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
              <button 
                key={index}
                onClick={() => handleAddToPantry(ingredient)}
                disabled={addingIngredient === ingredient}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center"
                style={{ 
                  backgroundColor: getLighterColor(),
                  color: accentColor,
                  border: `1px solid ${accentColor}20`
                }}
              >
                {ingredient}
                {addingIngredient === ingredient ? (
                  <div className="w-4 h-4 ml-2 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Plus className="w-4 h-4 ml-2 opacity-60" />
                )}
              </button>
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