"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from "@auth0/nextjs-auth0";
import {
  Home, 
  Menu, 
  X, 
  Calendar, 
  ShoppingBag, 
  User, 
  BookOpen,
  Utensils,
  Plus,
  Settings,
  LogOut,
  Check,
  Save,
  ShoppingCart
} from 'lucide-react';

export function BottomNavbar({ children }) {
  const router = useRouter();
  const [pathname, setPathname] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useUser();
  const isAuthenticated = !!user;
  const [isGenerating, setIsGenerating] = useState(false);
  const [mealGenerationComplete, setMealGenerationComplete] = useState(false);
  const [hasViewedGeneratedMeals, setHasViewedGeneratedMeals] = useState(false);
  
  // Track if we've been to the meals page to preserve function access
  const [visitedMealsPage, setVisitedMealsPage] = useState(false);
  
  // State for the radial FAB menu
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  // Check if the current route should have navigation
  const shouldShowNavbar = () => {
    if (!pathname) return false;
    
    // Don't show navbar on homepage or onboarding pages
    return !(
      pathname === '/' || 
      pathname === '/onboarding' || 
      pathname.startsWith('/onboarding/')
    );
  };
  
  // Check if the current route is a meal card view
  const isMealCardView = () => {
    if (!pathname) return false;
    
    // Check if a meal plan is being displayed
    return pathname === '/meals' && 
           typeof window !== 'undefined' && 
           Array.isArray(window.mealPlan) && 
           window.mealPlan.length > 0;
  };

  // Check if a path is active
  const isActive = (path) => {
    if (!pathname) return false;
    
    // Special case for settings page
    if (path === '/settings' && pathname === '/settings') {
      return true;
    }
    
    return pathname === path || pathname.startsWith(`${path}/`);
  };
  
  // Close the FAB menu if it's open when clicking outside
  useEffect(() => {
    if (fabMenuOpen && typeof document !== 'undefined') {
      const handleGlobalClick = (event) => {
        // Check if click is on the FAB or its children
        if (!event.target.closest(".fab-menu") && 
            !event.target.closest(".fab-button")) {
          setFabMenuOpen(false);
        }
      };
      
      document.addEventListener("mousedown", handleGlobalClick);
      
      return () => {
        document.removeEventListener("mousedown", handleGlobalClick);
      };
    }
  }, [fabMenuOpen]);

  // Handle the FAB click
  const handleFabClick = async (e) => {
    // If on meal card view, just toggle the menu
    if (isMealCardView()) {
      e.stopPropagation();
      setFabMenuOpen(!fabMenuOpen);
      return;
    }
    
    // Regular FAB behavior from here
    
    // If meals were generated but not viewed yet, just navigate to meals page
    if (mealGenerationComplete && !hasViewedGeneratedMeals) {
      setHasViewedGeneratedMeals(true);
      localStorage.setItem('hasViewedGeneratedMeals', 'true');
      router.push('/meals');
      return;
    }
    
    // If we've viewed generated meals, but clicked again, we should reset
    // to start a new generation
    if (mealGenerationComplete && hasViewedGeneratedMeals && pathname !== '/meals') {
      setMealGenerationComplete(false);
      localStorage.removeItem('mealGenerationComplete');
      setHasViewedGeneratedMeals(false);
      localStorage.removeItem('hasViewedGeneratedMeals');
      router.push('/meals');
      return;
    }
    
    if (pathname === '/meals' || (visitedMealsPage && !pathname.startsWith('/meals'))) {
      // If not on meals page but have visited it, navigate back
      if (pathname !== '/meals') {
        router.push('/meals');
        return;
      }
      
      // We're on the meals page, proceed with generation
      setIsGenerating(true);
      setMealGenerationComplete(false);
      localStorage.removeItem('mealGenerationComplete');
      setHasViewedGeneratedMeals(false);
      localStorage.removeItem('hasViewedGeneratedMeals');
      
      if (typeof window !== 'undefined') {
        // Try to find and call the global function
        if (window.generateMeals && typeof window.generateMeals === 'function') {
          try {
            await window.generateMeals();
            setMealGenerationComplete(true);
            localStorage.setItem('mealGenerationComplete', 'true');
          } catch (error) {
            console.error('Error generating meals:', error);
          } finally {
            setIsGenerating(false);
          }
        } else {
          // If function not defined, reload to reinitialize
          console.warn('generateMeals function not found, refreshing page');
          window.location.reload();
          setIsGenerating(false);
        }
      } else {
        setIsGenerating(false);
      }
    } else {
      // First time going to meals page
      router.push('/meals');
    }
  };
  
  const handleSaveMeal = (e) => {
    e.stopPropagation();
    setFabMenuOpen(false);
    
    if (typeof window !== 'undefined') {
      // Attempt to call the global save function from the meals page
      if (window.saveSelectedRecipes) {
        // Ensure all meals are selected before saving
        if (window.mealPlan && Array.isArray(window.mealPlan) && window.selectedRecipes) {
          // Select all meals in the plan
          window.mealPlan.forEach(meal => {
            if (meal && meal.id && !window.selectedRecipes.includes(meal.id)) {
              // Add the meal ID to the selectedRecipes array
              window.selectedRecipes.push(meal.id);
            }
          });
        }
        
        // Call save function
        window.saveSelectedRecipes();
      } else {
        console.warn('Global save function not found');
      }
    }
  };
  
  const handleViewRecipe = (e) => {
    e.stopPropagation();
    setFabMenuOpen(false);
    
    if (typeof window !== 'undefined' && window.handleViewRecipeGlobal) {
      window.handleViewRecipeGlobal(e);
    }
  };
  
  const handleOrderIngredients = (e) => {
    e.stopPropagation();
    setFabMenuOpen(false);
    
    if (typeof window !== 'undefined' && window.handleOrderIngredientsGlobal) {
      window.handleOrderIngredientsGlobal(e);
    }
  };

  // Update getFabIcon to consider the hasViewedGeneratedMeals state and if in meal card view
  const getFabIcon = () => {
    if (isMealCardView()) {
      return fabMenuOpen ? <X className="w-8 h-8" /> : <Plus className="w-8 h-8" />;
    }
    
    if (isGenerating) {
      // Show loading spinner when generating
      return (
        <svg className="animate-spin w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
    } else if (pathname === '/meals' || (mealGenerationComplete && !hasViewedGeneratedMeals)) {
      // Checkmark when on meals page OR when generation is complete but not yet viewed
      return <Check className="w-8 h-8" />;
    } else {
      // Plus icon for other cases
      return <Plus className="w-8 h-8" />;
    }
  };

  // Get current path only after component mounts (client-side only)
  useEffect(() => {
    // Safe check for browser environment
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      setPathname(currentPath);
      
      // If we're on the meals page now, mark that we've visited it
      if (currentPath === '/meals') {
        setVisitedMealsPage(true);
        localStorage.setItem('visitedMealsPage', 'true');
      } else if (localStorage.getItem('visitedMealsPage') === 'true') {
        setVisitedMealsPage(true);
      }
      
      // Check if meal generation was previously completed
      const completionStatus = localStorage.getItem('mealGenerationComplete');
      if (completionStatus === 'true') {
        setMealGenerationComplete(true);
      }
      
      // Handle route changes
      const handleRouteChange = () => {
        const newPath = window.location.pathname;
        setPathname(newPath);
        
        // If navigating to the meals page, mark that we've visited it
        if (newPath === '/meals') {
          setVisitedMealsPage(true);
          localStorage.setItem('visitedMealsPage', 'true');
        }
        
        // Close any open FAB menu when changing pages
        setFabMenuOpen(false);
      };
      
      // Listen for navigation events
      window.addEventListener('popstate', handleRouteChange);
      
      // Create a MutationObserver to detect any DOM changes that might indicate navigation
      const observer = new MutationObserver(() => {
        const newPath = window.location.pathname;
        if (newPath !== pathname) {
          setPathname(newPath);
          if (newPath === '/meals') {
            setVisitedMealsPage(true);
            localStorage.setItem('visitedMealsPage', 'true');
          }
          
          // Close any open FAB menu when changing pages
          setFabMenuOpen(false);
        }
      });
      
      // Start observing
      observer.observe(document.body, { 
        childList: true, 
        subtree: true 
      });
      
      return () => {
        window.removeEventListener('popstate', handleRouteChange);
        observer.disconnect();
      };
    }
  }, [pathname]);

  // Get the right button color based on state
  const getFabColor = () => {
    if (isMealCardView()) {
      return fabMenuOpen ? "bg-teal-700" : "bg-teal-600";
    }
    
    if (pathname === '/meals') {
      return "bg-teal-600 hover:bg-teal-700";
    } else {
      return "bg-teal-500 hover:bg-teal-600";
    }
  };

  return (
    <>
      {/* Render any children (props) passed to this component */}
      <div className={shouldShowNavbar() ? "mb-24" : ""}>
        {children}
      </div>
      
      {/* Fixed Bottom Navigation - Only show on relevant pages */}
      {shouldShowNavbar() && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
          {/* Floating Action Button */}
          {isAuthenticated && (
            <div className="absolute left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10" style={{ marginLeft: '10px', background: 'transparent' }}>
              {/* Radial menu buttons - only visible when on meal card view and fabMenuOpen is true */}
              {isMealCardView() && (
                <div className={`fab-menu relative ${fabMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                  {/* Top Left Button */}
                  <button
                    onClick={handleSaveMeal}
                    className={`absolute rounded-full shadow-lg transition-all duration-300 flex items-center justify-center p-0 ${
                      fabMenuOpen ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: 'rgb(234, 88, 12)', // orange-500
                      transform: fabMenuOpen 
                        ? 'translate(-65px, -65px)' 
                        : 'translate(0, 0)',
                      zIndex: 10
                    }}
                    aria-label="Save All Meals"
                  >
                    <Save className="w-4 h-4 text-white" />
                  </button>
                  
                  {/* Top Button */}
                  <button
                    onClick={handleViewRecipe}
                    className={`absolute rounded-full shadow-lg transition-all duration-300 flex items-center justify-center p-0 ${
                      fabMenuOpen ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{
                      width: '48px', 
                      height: '48px',
                      backgroundColor: 'rgb(20, 184, 166)', // teal-500
                      transform: fabMenuOpen 
                        ? 'translate(0px, -80px)' 
                        : 'translate(0, 0)',
                      zIndex: 10
                    }}
                    aria-label="View Full Recipe"
                  >
                    <BookOpen className="w-4 h-4 text-white" />
                  </button>
                  
                  {/* Top Right Button */}
                  <button
                    onClick={handleOrderIngredients}
                    className={`absolute rounded-full shadow-lg transition-all duration-300 flex items-center justify-center p-0 ${
                      fabMenuOpen ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: 'rgb(13, 148, 136)', // teal-600
                      transform: fabMenuOpen 
                        ? 'translate(65px, -65px)' 
                        : 'translate(0, 0)',
                      zIndex: 10
                    }}
                    aria-label="Order Ingredients"
                  >
                    <ShoppingCart className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}
              
              {/* Backdrop for FAB menu - only visible when in meal card view and fabMenuOpen is true */}
              {isMealCardView() && fabMenuOpen && (
                <div 
                  className="fixed inset-0 bg-black bg-opacity-10 z-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFabMenuOpen(false);
                  }}
                ></div>
              )}
              
              {/* Main FAB button */}
              <button
                onClick={handleFabClick}
                disabled={isGenerating && !isMealCardView()}
                className={`
                  fab-button 
                  ${getFabColor()} 
                  text-white w-16 h-16 rounded-full 
                  flex items-center justify-center 
                  shadow-lg transition-all 
                  ${fabMenuOpen ? 'rotate-45' : ''} 
                  ${mealGenerationComplete && !hasViewedGeneratedMeals && pathname !== '/meals' && !isMealCardView() ? 'pulse-animation' : ''}
                  focus:outline-none focus:ring-0 active:bg-transparent
                `}
                style={{
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                {getFabIcon()}
              </button>
            </div>
          )}
          
          <div className="max-w-screen-xl mx-auto px-4">
            {isAuthenticated ? (
              <div className="flex items-center h-20">
                {/* Four buttons with even spacing */}
                <div className="flex justify-around w-full">
                  <NavButton 
                    icon={<Calendar className="w-6 h-6" />} 
                    label="Planner" 
                    path="/planner" 
                    isActive={isActive('/planner')}
                    onClick={() => router.push('/planner')}
                  />
                  
                  <NavButton 
                    icon={<ShoppingBag className="w-6 h-6" />} 
                    label="Pantry" 
                    path="/pantry" 
                    isActive={isActive('/pantry')}
                    onClick={() => router.push('/pantry')}
                  />
                  
                  {/* Center space for FAB - invisible but takes up space */}
                  <div className="w-16 flex-shrink-0"></div>
                  
                  <NavButton 
                    icon={<Utensils className="w-6 h-6" />} 
                    label="Meals" 
                    path="/saved-meals" 
                    isActive={isActive('/saved-meals')}
                    onClick={() => router.push('/saved-meals')}
                  />
                  
                  <NavButton 
                    icon={<User className="w-6 h-6" />} 
                    label="Profile" 
                    path="/profile" 
                    isActive={isActive('/profile')}
                    onClick={() => router.push('/profile')}
                  />
                </div>
              </div>
            ) : (
              <div className="flex justify-around items-center h-16">
                <NavButton 
                  icon={<Home className="w-8 h-8" />} 
                  label="Home" 
                  path="/" 
                  isActive={isActive('/')}
                  onClick={() => router.push('/')}
                />
                
                <NavButton 
                  icon={<User className="w-8 h-8" />} 
                  label="Login" 
                  path="/auth/login" 
                  isActive={isActive('/auth/login')}
                  onClick={() => router.push('/auth/login?returnTo=/profile')}
                />
              </div>
            )}
          </div>
          
          {/* More Menu (Slide Up Panel) */}
          {menuOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setMenuOpen(false)}>
              <div 
                className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-xl p-6 transform transition-transform duration-300 ease-in-out"
                onClick={e => e.stopPropagation()}
              >
                {/* Small indicator at top of modal */}
                <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-12 h-1.5 bg-gray-300 rounded-full"></div>
                
                <div className="pt-4 flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-gray-800">More Options</h3>
                  <button 
                    onClick={() => setMenuOpen(false)} 
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="grid grid-cols-3 gap-6">
                  {isAuthenticated ? (
                    <>
                      <button
                        onClick={() => {
                          router.push('/meals');
                          setMenuOpen(false);
                        }}
                        className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-12 h-12 flex items-center justify-center bg-teal-100 text-teal-600 rounded-full mb-2">
                          <Utensils className="w-8 h-8" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">Meals</span>
                      </button>

                      <button
                        onClick={() => {
                          router.push('/settings');
                          setMenuOpen(false);
                        }}
                        className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-12 h-12 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full mb-2">
                          <Settings className="w-8 h-8" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">Settings</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          router.push('/auth/logout');
                          setMenuOpen(false);
                        }}
                        className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-12 h-12 flex items-center justify-center bg-red-100 text-red-600 rounded-full mb-2">
                          <LogOut className="w-8 h-8" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">Logout</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          router.push('/register');
                          setMenuOpen(false);
                        }}
                        className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-12 h-12 flex items-center justify-center bg-green-100 text-green-600 rounded-full mb-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                        </div>
                        <span className="text-sm font-medium text-gray-700">Register</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </nav>
      )}
    </>
  );
}

// Also add the CSS for the pulse animation if not already present
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.7); }
      70% { box-shadow: 0 0 0 15px rgba(20, 184, 166, 0); }
      100% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0); }
    }
    
    .pulse-animation {
      animation: pulse 2s infinite;
    }
  `;
  document.head.appendChild(style);
}

// NavButton component for consistent styling
function NavButton({ icon, label, path, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center px-3 h-full focus:outline-none transition-colors ${
        isActive 
          ? 'text-teal-600' 
          : 'text-gray-500 hover:text-teal-600'
      }`}
    >
      <div className={`relative ${isActive ? 'scale-110 transition-transform' : ''}`}>
        {icon}
      </div>
      <span className={`text-sm mt-1.5 ${isActive ? 'font-medium' : ''}`}>{label}</span>
    </button>
  );
}

export default BottomNavbar;