"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { 
  Filter, 
  Check,
  Loader,
  Tag,
  ArrowUpRight,
  BookOpen
} from 'lucide-react';
import Header from '../../components/header';
import Footer from '../../components/footer';
import { toast } from 'react-hot-toast';

export default function SavedMealsArchive() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const isAuthenticated = !!user;
  
  // State for saved meals
  const [allMeals, setAllMeals] = useState([]);
  const [filteredMeals, setFilteredMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLetter, setSelectedLetter] = useState('all');
  const [selectedTags, setSelectedTags] = useState([]);
  const [activeFilters, setActiveFilters] = useState(false);
  const [availableTags, setAvailableTags] = useState([]);
  
  // Alphabet for letter navigation
  const alphabet = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  
  // Group meals by first letter for the A-Z index
  const getMealsByLetter = useCallback(() => {
    const letterGroups = {};
    
    // Initialize all letters including # for meals starting with numbers
    alphabet.forEach(letter => {
      letterGroups[letter] = [];
    });
    
    // Organize meals by their first letter
    filteredMeals.forEach(meal => {
      const firstChar = meal.title.charAt(0).toUpperCase();
      const letterKey = firstChar.match(/[A-Z]/) ? firstChar : '#';
      
      if (!letterGroups[letterKey]) {
        letterGroups[letterKey] = [];
      }
      
      letterGroups[letterKey].push(meal);
    });
    
    // Sort meals within each letter group alphabetically
    Object.keys(letterGroups).forEach(letter => {
      letterGroups[letter].sort((a, b) => a.title.localeCompare(b.title));
    });
    
    return letterGroups;
  }, [filteredMeals, alphabet]);
  
  // Calculate available letters based on allMeals, not filteredMeals
// Calculate available letters based on search and tag filtered meals, but not letter filter
const getAvailableLetters = useCallback(() => {
    const letterCounts = {};
    
    // Initialize counts for all letters
    alphabet.forEach(letter => {
      letterCounts[letter] = 0;
    });
    
    // Apply search and tag filters to get intermediate filtered meals
    let intermediateFilteredMeals = [...allMeals];
    
    // Apply search filter
    if (searchTerm) {
      const lowerCaseSearch = searchTerm.toLowerCase();
      intermediateFilteredMeals = intermediateFilteredMeals.filter(meal => 
        meal.title.toLowerCase().includes(lowerCaseSearch) ||
        (meal.ingredients && meal.ingredients.some(ingredient => 
          (typeof ingredient === 'string' && ingredient.toLowerCase().includes(lowerCaseSearch)) ||
          (ingredient.name && ingredient.name.toLowerCase().includes(lowerCaseSearch))
        ))
      );
    }
    
    // Apply tag filters
    if (selectedTags.length > 0) {
      intermediateFilteredMeals = intermediateFilteredMeals.filter(meal => {
        const mealType = meal.meal_type?.toLowerCase() || '';
        return selectedTags.includes(mealType);
      });
    }
    
    // Count meals for each letter from the filtered collection
    intermediateFilteredMeals.forEach(meal => {
      const firstChar = meal.title.charAt(0).toUpperCase();
      const letterKey = firstChar.match(/[A-Z]/) ? firstChar : '#';
      
      if (letterCounts[letterKey] !== undefined) {
        letterCounts[letterKey]++;
      }
    });
    
    return letterCounts;
  }, [allMeals, alphabet, searchTerm, selectedTags]);
  
  // Calculate letter groups when filteredMeals changes
  const letterGroups = getMealsByLetter();
  const letterCounts = getAvailableLetters();
  
  // Filter meals based on search term and selected letter
  useEffect(() => {
    if (!allMeals.length) {
      setFilteredMeals([]);
      return;
    }
    
    let result = [...allMeals];
    
    // Apply search filter
    if (searchTerm) {
      const lowerCaseSearch = searchTerm.toLowerCase();
      result = result.filter(meal => 
        meal.title.toLowerCase().includes(lowerCaseSearch) ||
        (meal.ingredients && meal.ingredients.some(ingredient => 
          (typeof ingredient === 'string' && ingredient.toLowerCase().includes(lowerCaseSearch)) ||
          (ingredient.name && ingredient.name.toLowerCase().includes(lowerCaseSearch))
        ))
      );
    }
    
    // Apply tag filters
    if (selectedTags.length > 0) {
      result = result.filter(meal => {
        const mealType = meal.meal_type?.toLowerCase() || '';
        return selectedTags.includes(mealType);
      });
    }
    
    // Apply letter filter
    if (selectedLetter !== 'all') {
      result = result.filter(meal => {
        const firstChar = meal.title.charAt(0).toUpperCase();
        const letterKey = firstChar.match(/[A-Z]/) ? firstChar : '#';
        return letterKey === selectedLetter;
      });
    }
    
    setFilteredMeals(result);
  }, [allMeals, searchTerm, selectedLetter, selectedTags]);
  
  // Extract available tags (meal types) from meals
  useEffect(() => {
    if (allMeals.length) {
      const tags = allMeals
        .map(meal => meal.meal_type?.toLowerCase() || '')
        .filter(Boolean)
        .filter((value, index, self) => self.indexOf(value) === index)
        .sort();
      
      setAvailableTags(tags);
    }
  }, [allMeals]);
  
  // Fetch saved meals from the API
  const fetchSavedMeals = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Get access token using Auth0
      const accessToken = await getAccessToken({
        authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
      });
      
      // API request to get all saved meal plans
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/api/user-recipes/saved-recipes/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Flatten all meal plans into a single array of meals
      const allMeals = [];
      const addedMealIds = new Set();
      
      data.forEach(plan => {
        if (plan.recipes && Array.isArray(plan.recipes)) {
          plan.recipes.forEach(recipe => {
            // Avoid duplicates by checking ID
            if (!addedMealIds.has(recipe.id)) {
              allMeals.push({
                id: recipe.id,
                recipe_id: recipe.recipe_id,
                title: recipe.title || '',
                meal_type: recipe.meal_type || '',
                nutrition: recipe.nutrition || {},
                ingredients: recipe.ingredients || [],
                instructions: recipe.instructions || '',
                imageUrl: recipe.imageUrl || '',
                planName: plan.name,
                planId: plan.id,
                saved_at: plan.created_at
              });
              
              addedMealIds.add(recipe.id);
            }
          });
        }
      });
      
      setAllMeals(allMeals);
      setFilteredMeals(allMeals);
      
    } catch (error) {
      console.error('Error fetching saved meals:', error);
      toast.error('Failed to load your saved meals');
    } finally {
      setLoading(false);
    }
  };
  
  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      fetchSavedMeals();
    }
  }, [isAuthenticated, isLoading]);
  
  // Navigate to meal details page
  const viewMealDetails = (mealId) => {
    router.push(`/recipes/${mealId}`);
  };
  
  // Toggle tag selection
  const toggleTag = (tag) => {
    setSelectedTags(prevTags => 
      prevTags.includes(tag)
        ? prevTags.filter(t => t !== tag)
        : [...prevTags, tag]
    );
  };
  
  // Reset all filters
  const resetFilters = () => {
    setSelectedLetter('all');
    setSearchTerm('');
    setSelectedTags([]);
    setActiveFilters(false);
  };
  
  // Count total filtered meals
  const totalFilteredMeals = Object.values(letterGroups).reduce(
    (total, meals) => total + meals.length, 
    0
  );
  
  return (
    <>
      <Header />
      
      {/* Full-screen white background */}
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
      
      {/* Main Content Container */}
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg w-full max-w-5xl flex-grow flex flex-col">
          {/* Page Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
                <BookOpen className="w-6 h-6 mr-2 text-teal-600" />
                Saved Meals
              </h2>
              <p className="text-gray-500 mt-1">
                Browse all your saved recipes in one place
              </p>
            </div>
            
            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative flex-grow">
                <input
                  type="text"
                  placeholder="Search meals or ingredients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                />
              </div>
              
              <button
                onClick={() => setActiveFilters(!activeFilters)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center ${
                  selectedTags.length > 0
                    ? 'bg-teal-50 border-teal-200 text-teal-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Filter className={`w-4 h-4 mr-2 ${
                  selectedTags.length > 0 ? 'text-teal-500' : 'text-gray-500'
                }`} />
                Filters {selectedTags.length > 0 && `(${selectedTags.length})`}
              </button>
            </div>
          </div>
          
          {/* Active Filters Panel */}
          {activeFilters && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200 animate-fadeIn">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium text-gray-700">Meal Types</h3>
                <button 
                  onClick={resetFilters}
                  className="text-sm text-teal-600 hover:text-teal-800"
                >
                  Reset All
                </button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center ${
                      selectedTags.includes(tag)
                        ? 'bg-teal-100 text-teal-800 border border-teal-200'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {selectedTags.includes(tag) && (
                      <Check className="w-3 h-3 mr-1.5" />
                    )}
                    <span className="capitalize">{tag}</span>
                  </button>
                ))}
                
                {availableTags.length === 0 && (
                  <p className="text-sm text-gray-500">No meal types available</p>
                )}
              </div>
            </div>
          )}
          
          {/* Alphabet Navigation */}
            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm py-3 mb-6 border-b border-gray-200">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium text-gray-700">
                {totalFilteredMeals} {totalFilteredMeals === 1 ? 'Recipe' : 'Recipes'}
                </h3>
                
                <button 
                onClick={() => setSelectedLetter('all')}
                className={`text-sm px-3 py-1 rounded-md ${
                    selectedLetter === 'all'
                    ? 'bg-teal-100 text-teal-800 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                >
                View All
                </button>
            </div>
            
            <div className="flex flex-wrap gap-1.5">
                {alphabet.map(letter => {
                    const hasItems = letterCounts[letter] > 0;
                    
                    return (
                        <button
                            key={letter}
                            onClick={() => {
                                if (hasItems) {
                                    // If clicking the same letter, toggle it off
                                    // If clicking a different letter, select it
                                    setSelectedLetter(current => current === letter ? 'all' : letter);
                                }
                            }}
                            disabled={!hasItems}
                            className={`w-7 h-7 flex items-center justify-center rounded-md font-medium text-sm
                            ${hasItems 
                                ? selectedLetter === letter
                                ? 'bg-teal-500 text-white' // Selected letter
                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100' // Available letters stand out more
                                : 'bg-gray-50/50 text-gray-300 cursor-not-allowed' // Clearer disabled state
                            }
                            `}
                            title={hasItems ? `View ${letter} recipes` : 'No recipes start with this letter'}
                        >
                            {letter}
                        </button>
                    );
                })}
            </div>
            </div>
          
          {/* Loading State */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader className="w-8 h-8 text-teal-500 animate-spin mb-4" />
              <p className="text-gray-500">Loading your saved meals...</p>
            </div>
          ) : filteredMeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <BookOpen className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-700 mb-2">No meals found</h3>
              <p className="text-gray-500 max-w-md mb-6">
                {allMeals.length === 0
                  ? "You don't have any saved meals yet. Create a meal plan to get started!"
                  : "No meals match your current filters. Try adjusting your search or filters."}
              </p>
              <button
                onClick={() => router.push('/meals')}
                className="px-4 py-2 bg-teal-500 text-white font-medium rounded-lg hover:bg-teal-600 transition-colors"
              >
                Create New Meals
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Render meal groups by letter (when a letter is selected or for all letters) */}
              {selectedLetter === 'all' ? (
                alphabet.map(letter => {
                  const meals = letterGroups[letter];
                  
                  if (!meals || meals.length === 0) return null;
                  
                  return (
                    <div key={letter} id={letter} className="scroll-mt-20">
                      <div className="flex items-center mb-3">
                        <h3 className="text-xl font-bold text-teal-600 w-10 h-10 flex items-center justify-center bg-teal-50 rounded-lg">
                          {letter}
                        </h3>
                        <div className="ml-3 flex-grow border-t border-gray-200"></div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {meals.map(meal => (
                          <MealCard 
                            key={meal.id} 
                            meal={meal} 
                            onClick={() => viewMealDetails(meal.recipe_id || meal.id)} 
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div>
                  <div className="flex items-center mb-3">
                    <h3 className="text-xl font-bold text-teal-600 w-10 h-10 flex items-center justify-center bg-teal-50 rounded-lg">
                      {selectedLetter}
                    </h3>
                    <div className="ml-3 flex-grow border-t border-gray-200"></div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {letterGroups[selectedLetter].map(meal => (
                      <MealCard 
                        key={meal.id} 
                        meal={meal} 
                        onClick={() => viewMealDetails(meal.recipe_id || meal.id)} 
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

// Meal Card Component
function MealCard({ meal, onClick }) {
  const formattedCalories = typeof meal.nutrition?.calories === 'number' 
    ? meal.nutrition.calories 
    : typeof meal.calories === 'number'
      ? meal.calories
      : 'N/A';
  
  return (
        <div 
        onClick={onClick}
        className="bg-white rounded-lg overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all transform hover:translate-y-[-2px] cursor-pointer"
        >
      <div className="relative h-40 overflow-hidden">
        <img 
          src={meal.imageUrl || '/fallback-meal-image.jpg'} 
          alt={meal.title}
          className="w-full h-full object-cover transition-transform hover:scale-105"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = "/fallback-meal-image.jpg";
          }}
        />
        {meal.meal_type && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/80 backdrop-blur-sm text-gray-800 capitalize">
              <Tag className="w-3 h-3 mr-1" />
              {meal.meal_type}
            </span>
          </div>
        )}
      </div>
      
      <div className="p-4">
        <h3 className="font-medium text-gray-800 mb-1 truncate group-hover:text-teal-600">
          {meal.title}
        </h3>
        
        <div className="flex items-center justify-between mt-2">
          <div className="text-sm text-gray-500">
            {formattedCalories !== 'N/A' ? `${formattedCalories} cal` : ''}
          </div>
          
          <div className="text-teal-600 text-sm font-medium flex items-center">
            See Recipe
            <ArrowUpRight className="w-3 h-3 ml-1" />
        </div>
        </div>
      </div>
    </div>
  );
}