"use client"

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Calendar, Loader, Check } from "lucide-react";
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { Download } from 'lucide-react';
import { toast } from "react-hot-toast";
import { RecipeModal } from "../../../components/ui/recipemodal";
import { PlannerOverlay } from "../../../components/features/planner/planner";

// Helper function to parse instructions
function parseInstructions(instructions) {
  if (!instructions) return [];
  
  // For structured instructions with step markers
  if (instructions.includes('###') || instructions.includes('**') || 
      instructions.includes('Step') || instructions.includes('\\n')) {
    
    // Handle markdown and other common formatting
    let cleanInstructions = instructions
      // Replace markdown headings with a standard delimiter
      .replace(/#{1,3}\s*(.*?)(?=\n|$)/g, '###$1###')
      // Replace bold markdown
      .replace(/\*\*(.*?)\*\*/g, '###$1###')
      // Replace step indicators
      .replace(/Step\s+\d+\s*:\s*/gi, '###');
    
    // Split the text and clean up each part
    const parts = cleanInstructions.split(/###|\n/)
      .map(part => part.trim())
      .filter(part => part.length > 0);
    
    // Use heuristics to identify detailed instructions vs. section headers
    return parts.filter(part => {
      // Detailed instructions are typically longer and more complex
      // Section headers are usually short, title-cased phrases
      const isLikelyHeader = part.length < 25 && 
                             /^[A-Z][a-z]/.test(part) && 
                             !part.includes(',') && 
                             part.split(' ').length <= 4;
      
      return !isLikelyHeader;
    });
  }
  
  // Default handling for simple text
  return instructions.split('\\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

export default function RecipePage() {
  const params = useParams();
  const router = useRouter();
  const initialMealId = params?.id || "";
  const { user, isLoading: userLoading } = useUser();
  const [showIngredientConfirmation, setShowIngredientConfirmation] = useState(false);

  const [currentMealId, setMealId] = useState(initialMealId);
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [checkingSavedStatus, setCheckingSavedStatus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPlannerOverlay, setShowPlannerOverlay] = useState(false);
  const [relatedRecipes, setRelatedRecipes] = useState([]);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [changingRecipe, setChangingRecipe] = useState(false);

  const checkIfRecipeIsSaved = async (recipeId) => {
    if (!user || !recipeId) return false;

    try {
      setCheckingSavedStatus(true);
      
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-recipes/is-saved/${recipeId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        setIsSaved(data.isSaved);
        return data.isSaved;
      }
      
      return false;
    } catch (error) {
      console.error("Error checking saved status:", error);
      return false;
    } finally {
      setCheckingSavedStatus(false);
    }
  };

  // Make the updateRecipeData function available globally
  useEffect(() => {
    // Create a global function to update recipe data from the modal
    window.updateRecipeData = (newRecipeData) => {
      setChangingRecipe(true);
      
      if (newRecipeData && newRecipeData.id) {
        setMealId(newRecipeData.id);
        setRecipe(newRecipeData);
        
        // Check if this recipe is saved
        if (user) {
          checkIfRecipeIsSaved(newRecipeData.id);
        }
      }
      
      setTimeout(() => {
        setChangingRecipe(false);
      }, 300);
    };
    
    // Cleanup when component unmounts
    return () => {
      delete window.updateRecipeData;
    };
  }, [user]);

  // Load related recipes from localStorage
  useEffect(() => {
    if (recipe) {
      try {
        const mealPlanInputs = JSON.parse(localStorage.getItem("mealPlanInputs") || "{}");
        if (mealPlanInputs.mealPlan && Array.isArray(mealPlanInputs.mealPlan)) {
          const mealsFromPlan = mealPlanInputs.mealPlan;
          
          if (mealsFromPlan.length > 1) {
            setRelatedRecipes(mealsFromPlan);
            setShowRecipeModal(true);
          }
        }
      } catch (error) {
        console.error("Error loading meal plan data:", error);
      }
    }
  }, [recipe, currentMealId]);

  useEffect(() => {
    if (!currentMealId) return;
    
    const fetchRecipe = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mealplan/${currentMealId}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Recipe not found: ${errorText}`);
        }
        
        const data = await response.json();
        console.log("Recipe data from fetch:", data);
        console.log("Image URL:", data.imageUrl);
        setRecipe(data);
        
        // Check if recipe is saved after it's loaded
        if (user) {
          await checkIfRecipeIsSaved(currentMealId);
        }
      } catch (error) {
        console.error("Error fetching recipe:", error);
        setError(`Failed to load recipe: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchRecipe();
  }, [currentMealId, user]); 

  // Add ingredients to pantry
  const addIngredientsToUserPantry = async () => {
    if (!user) {
      router.push('/auth/login?returnTo=' + encodeURIComponent(window.location.pathname));
      return;
    }
  
    try {
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
  
      // Prepare ingredients for adding to pantry
      const ingredientsToAdd = recipe.ingredients.map(ingredient => ({
        name: ingredient.name,
        quantity: ingredient.quantity ? parseFloat(ingredient.quantity) : 1,
      }));
  
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-pantry/bulk-add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(ingredientsToAdd)
      });
  
      if (!response.ok) {
        throw new Error('Failed to add ingredients to pantry');
      }
  
      toast.success(`Added ${ingredientsToAdd.length} ingredients to your pantry`);
      setShowIngredientConfirmation(false);
    } catch (error) {
      console.error('Error adding ingredients:', error);
      toast.error('Failed to add ingredients to pantry');
    }
  };

  // Handle saving recipe
  const handleSaveRecipe = async () => {
    if (!user) {
      router.push('/auth/login?returnTo=' + encodeURIComponent(window.location.pathname));
      return;
    }

    try {
      setSaving(true);
      
      // Double check if it's already saved first
      const alreadySaved = await checkIfRecipeIsSaved(currentMealId);
      if (alreadySaved) {
        toast.success("Recipe is already saved!");
        return;
      }
      
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-recipes/saved-recipes/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          recipes: [recipe],
          plan_name: `Recipe - ${recipe.title}`
        })
      });

      if (!response.ok) {
        throw new Error("Failed to save recipe");
      }

      toast.success("Recipe saved successfully!");
      setIsSaved(true);
    } catch (error) {
      console.error("Error saving recipe:", error);
      toast.error("Failed to save recipe");
    } finally {
      setSaving(false);
    }
  };

  // Toggle planner overlay
  const togglePlannerOverlay = () => {
    if (!user) {
      router.push('/auth/login?returnTo=' + encodeURIComponent(window.location.pathname));
      return;
    }
    
    setShowPlannerOverlay(!showPlannerOverlay);
  };

  if (loading && !changingRecipe) return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="bg-white rounded-xlborder-nonep-8 text-center">
        <p className="text-xl">Loading recipe...</p>
      </div>
    </div>
  );  
  
  if (error) return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="bg-white rounded-xlborder-nonep-8">
        <button 
          onClick={() => router.back()}
          className="mb-6 flex items-center text-teal-600 hover:text-teal-800"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to meal plan
        </button>
        <p className="text-red-500 text-lg font-medium">{error}</p>
        <p className="mt-4">
          This could be due to:
          <ul className="list-disc pl-6 mt-2">
            <li>The meal ID format may have changed</li>
            <li>The meal may have been deleted from the database</li>
            <li>There might be a connection issue with the server</li>
          </ul>
        </p>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto max-w-4xl pt-20">
      {/* Recipe Modal */}
      {showRecipeModal && (
        <RecipeModal 
          mealId={currentMealId}
          relatedRecipes={relatedRecipes}
          onClose={() => setShowRecipeModal(false)}
        />
      )}

      {/* Planner Overlay - Now using our separate component */}
      {recipe && (
        <PlannerOverlay
          isOpen={showPlannerOverlay}
          onClose={() => setShowPlannerOverlay(false)}
          user={user}
          recipe={recipe}
          currentMealId={currentMealId}
        />
      )}

      <div className="bg-white min-h-screen relative">
        {/* Header with back button */}
        <div className="p-4 flex justify-between items-center">
          <button 
            onClick={() => router.back()}
            className="rounded-full bg-gray-100 p-2 flex items-center justify-center shadow-md"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        </div>
        
        {/* Recipe Title */}
        <div className="px-6 pb-4">
          <h1 className="text-xl font-bold text-gray-800">
            {recipe.title}
          </h1>
        </div>

        
        {/* Recipe Image with Action Buttons */}
        <div className="mb-4">
          <div className="relative rounded-3xl overflow-hidden h-72">
            <img
              src={recipe.imageUrl}
              alt={recipe.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                console.log("Image failed to load:", recipe.imageUrl);
                e.target.style.display = 'none';
              }}
            />
            
            {/* Action Buttons Overlay - Bottom Right */}
            <div className="absolute bottom-4 right-4 flex gap-2">
              {/* Smiley Face Button */}
              <button 
                className="p-3 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/40 transition-colors text-white shadow-lg"
                aria-label="Reaction"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </button>
              
              {/* Add to Planner Button */}
              <button 
                onClick={togglePlannerOverlay}
                disabled={checkingSavedStatus || (!isSaved && !checkingSavedStatus)} 
                className={`p-3 rounded-full ${
                  !isSaved && !checkingSavedStatus
                    ? "bg-black/20 text-white/50 cursor-not-allowed" 
                    : "bg-black/30 backdrop-blur-sm hover:bg-black/40 transition-colors text-white shadow-lg"
                }`}
                title={!isSaved ? "Save recipe first to add to planner" : "Add to meal planner"}
                aria-label="Add to Meal Plan"
              >
                <Calendar className="w-5 h-5" />
              </button>
              
              {/* Save Recipe Button */}
              <button 
                onClick={handleSaveRecipe}
                disabled={saving || isSaved || checkingSavedStatus}
                className={`p-3 rounded-full ${
                  checkingSavedStatus 
                    ? "bg-black/20 text-white/50 cursor-wait" 
                    : "bg-black/30 backdrop-blur-sm hover:bg-black/40 transition-colors text-white shadow-lg"
                }`}
                aria-label={isSaved ? "Recipe Saved" : "Save Recipe"}
              >
                {saving || checkingSavedStatus ? (
                  <Loader className="w-5 h-5 animate-spin" />
                ) : isSaved ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
          
        {/* Individual ingredient items on white background */}
        <div className="space-y-4">
          {recipe.ingredients.map((ingredient, idx) => (
            <div key={idx} className="bg-white py-4 px-5 flex items-center">
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900">
                  {ingredient.name} <span className="text-teal-600 font-normal">({ingredient.quantity})</span>
                </h3>
              </div>
            </div>
          ))}
        </div>
      
        {/* Instructions Section - Modern Step Format with titles filtered out */}
        <div className="px-6 pb-20">
          <h2 className="text-3xl font-bold mb-6">Instructions</h2>
          
          <div className="space-y-8">
            {parseInstructions(recipe.instructions).map((step, idx) => (
              <div key={idx} className="flex">
                <div className="mr-6">
                  <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 font-bold text-2xl shrink-0">
                    {idx + 1}
                  </div>
                </div>
                <div className="pt-3">
                  <p className="text-gray-800 text-lg">{step}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}