"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import { useMealGeneration } from '../contexts/MealGenerationContext';
import {
  Home, Menu, X, Calendar, ShoppingBag, User, 
  BookOpen, Utensils, Plus, Settings, LogOut,
  Check, Save, ShoppingCart
} from 'lucide-react';

export function BottomNavbar({ children }) {
  const router = useRouter();
  const [pathname, setPathname] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isLoading } = useUser();
  const isAuthenticated = !!user;
  
  const { 
    isGenerating, 
    setIsGenerating,
    mealGenerationComplete,
    setMealGenerationComplete,
    currentMealPlanId,
    setCurrentMealPlanId
  } = useMealGeneration();
  
  const [hasViewedGeneratedMeals, setHasViewedGeneratedMeals] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [visitedMealsPage, setVisitedMealsPage] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [daysMenuOpen, setDaysMenuOpen] = useState(false);
  const [numDays, setNumDays] = useState(1);

  const shouldShowNavbar = () => {
    if (!pathname) return false;
    return !(
      pathname === '/' || 
      pathname === '/onboarding' || 
      pathname.startsWith('/onboarding/')
    );
  };
  
  const isMealCardView = () => {
    if (!pathname) return false;
    return pathname === '/meals' && 
           typeof window !== 'undefined' && 
           Array.isArray(window.mealPlan) && 
           window.mealPlan.length > 0;
  };

  const isActive = (path) => {
    if (!pathname) return false;
    if (path === '/settings' && pathname === '/settings') {
      return true;
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkLoading = () => {
        const currentLoading = isGenerating || window.mealLoading || localStorage.getItem('isGenerating') === 'true';
        if (currentLoading !== isGenerating) {
          setIsGenerating(currentLoading);
        }
      };
      
      checkLoading();
      const interval = setInterval(checkLoading, 250);
      return () => clearInterval(interval);
    }
  }, [isGenerating, setIsGenerating]);

  useEffect(() => {
    // Listen for the custom mealGenerationComplete event
    const handleMealGenComplete = (event) => {
      console.log("🎉 Meal generation complete event received!");
      setIsGenerating(false);
      setMealGenerationComplete(true);
      setHasViewedGeneratedMeals(false);
      
      if (event.detail && event.detail.mealPlanId) {
        setCurrentMealPlanId(event.detail.mealPlanId);
      }
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('mealGenerationComplete', handleMealGenComplete);
      
      return () => {
        window.removeEventListener('mealGenerationComplete', handleMealGenComplete);
      };
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadingState = localStorage.getItem('isGenerating');
      if (loadingState === 'true') {
        setIsGenerating(true);
      }
      
      const completionStatus = localStorage.getItem('mealGenerationComplete');
      if (completionStatus === 'true') {
        setMealGenerationComplete(true);
      }
      
      const viewedStatus = localStorage.getItem('hasViewedGeneratedMeals');
      if (viewedStatus === 'true') {
        setHasViewedGeneratedMeals(true);
      }
  
      const visitedStatus = localStorage.getItem('visitedMealsPage');
      if (visitedStatus === 'true') {
        setVisitedMealsPage(true);
      }
  
      const currentPath = window.location.pathname;
      setPathname(currentPath);
      
      if (currentPath === '/meals') {
        setVisitedMealsPage(true);
        localStorage.setItem('visitedMealsPage', 'true');
      }
  
      const handleRouteChange = () => {
        const newPath = window.location.pathname;
        setPathname(newPath);
        if (newPath === '/meals') {
          setVisitedMealsPage(true);
          localStorage.setItem('visitedMealsPage', 'true');
        }
      };
      
      window.addEventListener('popstate', handleRouteChange);
      
      const observer = new MutationObserver(() => {
        const newPath = window.location.pathname;
        if (newPath !== pathname) {
          setPathname(newPath);
          if (newPath === '/meals') {
            setVisitedMealsPage(true);
            localStorage.setItem('visitedMealsPage', 'true');
          }
        }
      });
      
      observer.observe(document.body, { 
        childList: true, 
        subtree: true 
      });
      
      const proStatus = localStorage.getItem('userIsPro');
      if (proStatus === 'true') {
        setIsPro(true);
      }
      
      return () => {
        window.removeEventListener('popstate', handleRouteChange);
        observer.disconnect();
      };
    }
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (!isGenerating && typeof window !== 'undefined') {
        window.mealLoading = false;
        localStorage.removeItem('isGenerating');
      }
    };
  }, [isGenerating]);
  
  useEffect(() => {
    if ((fabMenuOpen || daysMenuOpen) && typeof document !== 'undefined') {
      const handleGlobalClick = (event) => {
        if (!event.target.closest(".fab-menu") && 
            !event.target.closest(".fab-button")) {
          setFabMenuOpen(false);
          setDaysMenuOpen(false);
        }
      };
      
      document.addEventListener("mousedown", handleGlobalClick);
      return () => {
        document.removeEventListener("mousedown", handleGlobalClick);
      };
    }
  }, [fabMenuOpen, daysMenuOpen]);

  const toggleDaysMenu = (e) => {
    if (isMealCardView()) return;
    if (pathname === '/meals') {
      e.stopPropagation();
      setDaysMenuOpen(!daysMenuOpen);
      setFabMenuOpen(false);
    }
  };

  const handleFabClick = async (e) => {
    if (isMealCardView()) {
      e.stopPropagation();
      setFabMenuOpen(!fabMenuOpen);
      return;
    }
    
    if (pathname === '/meals' && !isMealCardView()) {
      e.stopPropagation();
      setDaysMenuOpen(!daysMenuOpen);
      return;
    }
    
    if (mealGenerationComplete && !hasViewedGeneratedMeals) {
      setHasViewedGeneratedMeals(true);
      localStorage.setItem('hasViewedGeneratedMeals', 'true');
      
      // This is the key change - passing query parameter to force showing meal cards
      router.push('/meals?showMealCards=true');
      return;
    }
    
    if (mealGenerationComplete && pathname !== '/meals') {
      // Add query parameter here too to ensure consistency
      router.push('/meals?showMealCards=true');
      return;
    }
    
    if (pathname === '/meals' || (visitedMealsPage && !pathname.startsWith('/meals'))) {
      setIsGenerating(true);
      localStorage.setItem('hasViewedGeneratedMeals', 'false');
      
      try {
        if (typeof window !== 'undefined') {
          if (window.generateMeals && typeof window.generateMeals === 'function') {
            await window.generateMeals();
            setMealGenerationComplete(true);
          } else {
            console.warn('generateMeals function not found, refreshing page');
            window.location.reload();
          }
        }
      } catch (error) {
        console.error('Error generating meals:', error);
        setIsGenerating(false);
      } finally {
        setIsGenerating(false);
      }
    } else {
      router.push('/meals');
    }
  };
  
  const handleSaveMeal = (e) => {
    e.stopPropagation();
    setFabMenuOpen(false);
    
    if (typeof window !== 'undefined') {
      if (window.saveSelectedRecipes) {
        if (window.mealPlan && Array.isArray(window.mealPlan) && window.selectedRecipes) {
          window.mealPlan.forEach(meal => {
            if (meal && meal.id && !window.selectedRecipes.includes(meal.id)) {
              window.selectedRecipes.push(meal.id);
            }
          });
        }
        window.saveSelectedRecipes();
      } else {
        console.warn('Global save function not found');
      }
    }
  };

  const fetchSubscriptionStatus = async () => {
    if (!user) return;

    try {
      if (user.sub === "auth0|67b82eb657e61f81cdfdd503") {
        setIsPro(true);
        localStorage.setItem('userIsPro', 'true');
        console.log("✅ Special user detected - Pro features enabled");
        return;
      }

      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      if (!token) {
        throw new Error("Failed to retrieve access token.");
      }

      const tokenPayload = JSON.parse(atob(token.split(".")[1]));
      const userSubscription = tokenPayload?.["https://dev-rw8ff6vxgb7t0i4c.us.auth0.com/app_metadata"]?.subscription;
      
      const proStatus = userSubscription === "pro";
      setIsPro(proStatus);
      localStorage.setItem('userIsPro', proStatus ? 'true' : 'false');
    } catch (err) {
      console.error("Error fetching subscription status:", err);
    }
  };

  useEffect(() => {
    if (!isLoading && user) {
      fetchSubscriptionStatus();
    }
  }, [user, isLoading]);
  
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

  const getFabIcon = () => {
    // Check explicitly for meal generation completion
    if (mealGenerationComplete && !hasViewedGeneratedMeals && !isGenerating) {
      console.log("✅ Showing completion icon (check mark)");
      return <Check className="w-8 h-8" />;
    }
    
    if (isGenerating) {
      console.log("⏳ Showing spinner icon");
      return (
        <svg className="animate-spin w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
    }
  
    if (isMealCardView()) {
      return fabMenuOpen ? <X className="w-8 h-8" /> : <Plus className="w-8 h-8" />;
    }
    
    if (pathname === '/meals' && !isMealCardView()) {
      return daysMenuOpen ? <X className="w-8 h-8" /> : <Plus className="w-8 h-8" />;
    } else {
      return <Plus className="w-8 h-8" />;
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleStorageChange = () => {
        const savedState = localStorage.getItem('mealGenerationState');
        if (savedState) {
          const { isGenerating: savedIsGenerating } = JSON.parse(savedState);
          setIsGenerating(savedIsGenerating);
        }
      };
  
      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      setPathname(currentPath);
      
      if (currentPath === '/meals') {
        setVisitedMealsPage(true);
        localStorage.setItem('visitedMealsPage', 'true');
      } else if (localStorage.getItem('visitedMealsPage') === 'true') {
        setVisitedMealsPage(true);
      }
      
      const completionStatus = localStorage.getItem('mealGenerationComplete');
      if (completionStatus === 'true') {
        setMealGenerationComplete(true);
      }
      
      const handleRouteChange = () => {
        const newPath = window.location.pathname;
        setPathname(newPath);
        if (newPath === '/meals') {
          setVisitedMealsPage(true);
          localStorage.setItem('visitedMealsPage', 'true');
        }
      };
      
      window.addEventListener('popstate', handleRouteChange);
      
      const observer = new MutationObserver(() => {
        const newPath = window.location.pathname;
        if (newPath !== pathname) {
          setPathname(newPath);
          if (newPath === '/meals') {
            setVisitedMealsPage(true);
            localStorage.setItem('visitedMealsPage', 'true');
          }
        }
      });
      
      observer.observe(document.body, { 
        childList: true, 
        subtree: true 
      });
      
      const proStatus = localStorage.getItem('userIsPro');
      if (proStatus === 'true') {
        setIsPro(true);
      }
      
      return () => {
        window.removeEventListener('popstate', handleRouteChange);
        observer.disconnect();
      };
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.numDays = numDays;
      window.setNumDays = setNumDays;
      return () => {
        window.numDays = undefined;
        window.setNumDays = undefined;
      };
    }
  }, [numDays]);

  const getFabColor = () => {
    if (isMealCardView()) {
      return fabMenuOpen ? "bg-teal-700" : "bg-teal-600";
    }
    
    if (pathname === '/meals') {
      return daysMenuOpen ? "bg-teal-700" : "bg-teal-600 hover:bg-teal-700";
    } else {
      return "bg-teal-500 hover:bg-teal-600";
    }
  };

  return (
    <>
      <div className={shouldShowNavbar() ? "mb-24" : ""}>
        {children}
      </div>
      
      {shouldShowNavbar() && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
          {isAuthenticated && (
            <div 
              className="absolute left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10" 
              style={{ 
                marginLeft: '10px', 
                background: 'transparent',
                boxShadow: 'none',
                border: 'none'
              }}
            >            
              {pathname === '/meals' && !isMealCardView() && daysMenuOpen && (
                <div className={`fab-menu relative pointer-events-auto`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNumDays(1);
                      setDaysMenuOpen(false);
                      if (typeof window !== 'undefined' && window.generateMeals) {
                        window.generateMeals();
                      }
                    }}
                    className={`absolute rounded-full shadow-lg transition-all duration-300 flex items-center justify-center p-0 opacity-100`}
                    style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: numDays === 1 ? 'rgb(13, 148, 136)' : 'rgb(20, 184, 166)', 
                      transform: 'translate(-65px, -65px)',
                      zIndex: 10
                    }}
                    aria-label="1 Day"
                  >
                    <span className="text-white font-bold">1</span>
                  </button>
                  
                  {[3, 5, 7].map((days) => (
                    <button
                      key={days}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNumDays(days);
                        setDaysMenuOpen(false);
                        if (typeof window !== 'undefined' && window.generateMeals) {
                          window.generateMeals();
                        }
                      }}
                      className={`absolute rounded-full shadow-lg transition-all duration-300 flex items-center justify-center p-0 opacity-100`}
                      style={{
                        width: '48px',
                        height: '48px',
                        backgroundColor: numDays === days ? 'rgb(13, 148, 136)' : 'rgb(20, 184, 166)', 
                        transform: days === 3 
                          ? 'translate(0px, -80px)' 
                          : days === 5 
                            ? 'translate(65px, -65px)' 
                            : 'translate(80px, 0px)',
                        zIndex: 10
                      }}
                      aria-label={`${days} Days`}
                    >
                      <span className="text-white font-bold">{days}</span>
                      {!isPro && (
                        <div className="absolute -top-1 -right-1 bg-orange-500 rounded-full w-4 h-4 flex items-center justify-center">
                          <span className="text-white text-xs">$</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              
              {isMealCardView() && (
                <div className={`fab-menu relative ${fabMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                  <button
                    onClick={handleSaveMeal}
                    className={`absolute rounded-full shadow-lg transition-all duration-300 flex items-center justify-center p-0 ${
                      fabMenuOpen ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: 'rgb(234, 88, 12)',
                      transform: fabMenuOpen 
                        ? 'translate(-65px, -65px)' 
                        : 'translate(0, 0)',
                      zIndex: 10
                    }}
                    aria-label="Save All Meals"
                  >
                    <Save className="w-4 h-4 text-white" />
                  </button>
                  
                  <button
                    onClick={handleViewRecipe}
                    className={`absolute rounded-full shadow-lg transition-all duration-300 flex items-center justify-center p-0 ${
                      fabMenuOpen ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{
                      width: '48px', 
                      height: '48px',
                      backgroundColor: 'rgb(20, 184, 166)',
                      transform: fabMenuOpen 
                        ? 'translate(0px, -80px)' 
                        : 'translate(0, 0)',
                      zIndex: 10
                    }}
                    aria-label="View Full Recipe"
                  >
                    <BookOpen className="w-4 h-4 text-white" />
                  </button>
                  
                  <button
                    onClick={handleOrderIngredients}
                    className={`absolute rounded-full shadow-lg transition-all duration-300 flex items-center justify-center p-0 ${
                      fabMenuOpen ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: 'rgb(13, 148, 136)',
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
              
              {isMealCardView() && fabMenuOpen && (
                <div 
                  className="fixed inset-0 z-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFabMenuOpen(false);
                  }}
                ></div>
              )}
              
              <button
                onClick={handleFabClick}
                disabled={isGenerating && !isMealCardView()}
                className={`fab-button ${getFabColor()} text-white w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  fabMenuOpen || daysMenuOpen ? 'rotate-45' : ''
                } ${mealGenerationComplete && !hasViewedGeneratedMeals && pathname !== '/meals' && !isMealCardView() ? 'pulse-animation' : ''}`}
              >
                {getFabIcon()}
              </button>
            </div>
          )}
          
          <div className="max-w-screen-xl mx-auto px-4">
            {isAuthenticated ? (
              <div className="flex items-center h-20">
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
          
          {menuOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setMenuOpen(false)}>
              <div 
                className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-xl p-6 transform transition-transform duration-300 ease-in-out"
                onClick={e => e.stopPropagation()}
              >
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