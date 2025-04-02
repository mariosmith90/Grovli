"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@auth0/nextjs-auth0';
// Import the new Zustand store instead of the old context
import { useMealStore } from '../../lib/stores/mealStore';
import { useAuth } from '../../contexts/AuthContext';
import {
  Home, Menu, X, Calendar, ShoppingBag, User, 
  BookOpen, Utensils, Plus, Settings, LogOut,
  Check, Save, ShoppingCart
} from 'lucide-react';

export function BottomNavbar({ children }) {
  const router = useRouter();
  const [pathname, setPathname] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  // Get user from both auth systems - prefer Auth0 but fall back to our context
  const { user: auth0User, error: auth0Error, isLoading: auth0Loading } = useUser();
  const auth0Authenticated = !!auth0User;
  
  // Always use our auth context
  const auth = useAuth();
  const authUser = auth?.user;
  const authLoading = auth?.isLoading !== false;
  const authIsPro = auth?.isPro === true;
  
  // Use the most reliable source of user data
  const user = auth0User || authUser;
  const isLoading = auth0Loading && authLoading;
  const isAuthenticated = auth0Authenticated || !!user;
  
  // Use our new Zustand store with safer destructuring
  // First check if the hook is available and usable
  const mealStore = useMealStore();
  
  // Safely destructure values with fallbacks to prevent errors
  const isGenerating = mealStore?.isGenerating || false;
  const mealGenerationComplete = mealStore?.mealGenerationComplete || false;
  const currentMealPlanId = mealStore?.currentMealPlanId || null;
  const hasViewedGeneratedMeals = mealStore?.hasViewedGeneratedMeals || false;
  const currentJobId = mealStore?.currentJobId || null;
  const taskTrackingId = mealStore?.taskTrackingId || null;
  const backgroundTaskId = mealStore?.backgroundTaskId || null;
  
  // Safely access methods with noop fallbacks to prevent errors
  const setIsGenerating = mealStore?.setIsGenerating || (() => {});
  const setMealGenerationComplete = mealStore?.setMealGenerationComplete || (() => {});
  const setCurrentMealPlanId = mealStore?.setCurrentMealPlanId || (() => {});
  const setHasViewedGeneratedMeals = mealStore?.setHasViewedGeneratedMeals || (() => {});
  const resetMealGeneration = mealStore?.resetMealGeneration || (() => {});
  const updateGlobalState = mealStore?.updateGlobalState || (() => {});
  const notifyMealPlanReady = mealStore?.notifyMealPlanReady || (() => {});
  const notifyMealPlanComplete = mealStore?.handleMealPlanNotification || (() => false);
  const markStoreHydrated = mealStore?.actions?.markHydrated || (() => {});
  
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
    
    // Regular check for meal plan array
    const hasMealPlan = pathname === '/meals' && 
                       typeof window !== 'undefined' && 
                       Array.isArray(window.mealPlan) && 
                       window.mealPlan.length > 0;
    
    // Check URL parameter - this is important for the transition from green checkmark
    const hasShowCardsParam = typeof window !== 'undefined' && 
                             window.location.search.includes('showMealCards=true');
    
    // Check if there's a current meal plan ID in localStorage
    const hasMealPlanId = typeof window !== 'undefined' && 
                          localStorage.getItem('currentMealPlanId');
    
    // Check the Zustand store for additional context - this helps prevent errors after transitions
    const mealStore = typeof useMealStore !== 'undefined' ? useMealStore.getState() : null;
    const storeHasMealPlan = mealStore && Array.isArray(mealStore.mealPlan) && mealStore.mealPlan.length > 0;
    
    // Return true if any condition is met
    return hasMealPlan || hasShowCardsParam || (pathname === '/meals' && hasMealPlanId) || storeHasMealPlan;
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
      window.numDays = numDays;
      window.setNumDays = setNumDays;
      
      // Make toggleChatbot available globally
      window.toggleChatbotWindow = () => {
        if (typeof window.toggleChatbot === 'function') {
          window.toggleChatbot();
        }
      };
      
      return () => {
        window.numDays = undefined;
        window.setNumDays = undefined;
        window.toggleChatbotWindow = undefined;
      };
    }
  }, [numDays]);

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
      
      const handleRouteChange = () => {
        const newPath = window.location.pathname;
        setPathname(newPath);
        if (newPath === '/meals') {
          setVisitedMealsPage(true);
          localStorage.setItem('visitedMealsPage', 'true');
        }
      };
      
      window.addEventListener('popstate', handleRouteChange);
      
      // Use MutationObserver to detect client-side navigation
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
      
      // Load Pro status
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
    console.log(`[Navbar] FAB clicked on path: ${pathname}, mealGenerationComplete: ${mealGenerationComplete}, hasViewedGeneratedMeals: ${hasViewedGeneratedMeals}`);
    
    // Always use markHydrated from our component scope
    markStoreHydrated();
    
    // If on meal card view, return to meal selection or go to overview
    if (isMealCardView()) {
      e.stopPropagation();
      console.log("[Navbar] On meal card view, returning to meal selection");
      
      // Make sure Zustand store is fully initialized to prevent React error #310
      if (typeof window !== 'undefined') {
        // This explicit store initialization prevents the hooks error that can happen
        // due to component re-rendering after meal plan view
        try {
          // Ensure store is properly hydrated
          markStoreHydrated();
          
          // Update the states in a logical order - this is important to prevent React error #310
          setHasViewedGeneratedMeals(true);
        } catch (err) {
          console.error("[Navbar] Error updating store state:", err);
          // Continue with navigation anyway - the store will be initialized on the next page
        }
      }
      
      // If we're on a meals page with showMealCards parameter
      if (typeof window !== 'undefined' && window.location.search.includes('showMealCards=true')) {
        // Just clear the URL parameters and let the meal page handle it
        window.history.replaceState({}, document.title, '/meals');
      } else {
        // We're on the meal selection page, navigate back to input
        router.push('/meals');
      }
      return;
    }
    
    // If on meals page and not in card view, toggle days selector
    if (pathname === '/meals' && !isMealCardView()) {
      e.stopPropagation();
      setDaysMenuOpen(!daysMenuOpen);
      return;
    }
    
    // If meal plan is ready but not yet viewed, go to meals page with cards view
    if (mealGenerationComplete && !hasViewedGeneratedMeals) {
      console.log("[Navbar] ✅ Green checkmark clicked - navigating to meal cards view");
      
      // Use state already in component scope
      // No store.viewGeneratedMeals() needed
      
      // Get the current meal plan ID from our component scope
      const mealPlanIdToUse = currentMealPlanId;
      
      // Update only the visual button state immediately - don't update Zustand yet
      // This prevents the button from flashing between states during navigation
      setFabButtonState({
        isLoading: false,
        isReady: false // This makes the button visually show as normal, not green checkmark
      });
      
      console.log(`[Navbar] Transitioning to meal cards view with ID: ${mealPlanIdToUse || 'none'}`);
      
      // Navigate to the meal cards page - the URL parameter is critical
      if (mealPlanIdToUse) {
        console.log(`[Navbar] Using explicit meal plan ID: ${mealPlanIdToUse}`);
        window.location.href = `/meals?showMealCards=true&mealPlanId=${encodeURIComponent(mealPlanIdToUse)}`;
      } else {
        // Fallback if no ID available
        console.log("[Navbar] No meal plan ID available, using basic navigation");
        window.location.href = '/meals?showMealCards=true';
      }
      return;
    }
    
    // If meal plan is ready and we're not on meals page, go to meals page with cards
    if (mealGenerationComplete && pathname !== '/meals') {
      console.log("[Navbar] Ready meal plan navigation - not on meals page");
      
      // Use state already in component scope
      const mealPlanIdToUse = currentMealPlanId;
      
      console.log(`[Navbar] Navigating to meal cards from non-meals page with ID: ${mealPlanIdToUse || 'none'}`);
      
      // No need to call viewGeneratedMeals, just proceed
      
      // Use router.push for navigation - never block this operation
      if (mealPlanIdToUse) {
        router.push(`/meals?showMealCards=true&mealPlanId=${encodeURIComponent(mealPlanIdToUse)}`);
      } else {
        console.log("[Navbar] No meal plan ID available, using basic navigation");
        router.push('/meals?showMealCards=true');
      }
      return;
    }
    
    // Handle navigation to the meals page from other pages
    if (pathname !== '/meals') {
      console.log("[Navbar] Navigating to meals page from elsewhere");
      router.push('/meals');
      return;
    }
    
    // Only generate a new meal plan if we're already on the meals selection page
    if (pathname === '/meals' && !isMealCardView()) {
      console.log("[Navbar] On meals page, generating new meal plan");
      
      // Reset previous meal generation state
      resetMealGeneration();
      
      // Start the loading spinner immediately using our imported method
      setIsGenerating(true);
      
      // Also set in localStorage for redundancy
      if (typeof window !== 'undefined') {
        localStorage.setItem('hasViewedGeneratedMeals', 'false');
      }
      
      try {
        if (typeof window !== 'undefined' && window.generateMeals && typeof window.generateMeals === 'function') {
          // Generate new meal plan (we're already on the meals page)
          console.log("[Navbar] Calling window.generateMeals()");
          await window.generateMeals();
        } else {
          console.warn("[Navbar] window.generateMeals not found");
        }
      } catch (error) {
        console.error('Error generating meals:', error);
        setIsGenerating(false);
      }
    } else {
      console.log("[Navbar] Default case - not handling this state:", pathname, isMealCardView());
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

  // Check subscription once on load
  useEffect(() => {
    if (!isLoading && user) {
      // Get Pro status from auth context first (most reliable source)
      if (authIsPro) {
        setIsPro(true);
        localStorage.setItem('userIsPro', 'true');
        return;
      }
      
      // Check for special user 
      const userId = user.sub || user.id;
      const isSpecialUser = userId === "auth0|67b82eb657e61f81cdfdd503";
      if (isSpecialUser) {
        setIsPro(true);
        localStorage.setItem('userIsPro', 'true');
        
        // Set global flag
        if (typeof window !== 'undefined') {
          window.specialProUser = true;
          window.userId = user.sub;
        }
        return;
      }
      
      // Check localStorage as fallback
      if (localStorage.getItem('userIsPro') === 'true') {
        setIsPro(true);
        return;
      }
      
      // Final check with token (async)
      const checkToken = async () => {
        try {
          const token = await auth.getAuthToken();
          if (token) {
            const tokenPayload = JSON.parse(atob(token.split(".")[1]));
            const userSubscription = tokenPayload?.["https://dev-rw8ff6vxgb7t0i4c.us.auth0.com/app_metadata"]?.subscription;
            const proStatus = userSubscription === "pro";
            setIsPro(proStatus);
            localStorage.setItem('userIsPro', proStatus ? 'true' : 'false');
          }
        } catch (err) {
          console.error("Error checking subscription in token:", err);
        }
      };
      
      checkToken();
      
      // Set userId in window
      if (typeof window !== 'undefined' && user.sub) {
        window.userId = user.sub;
      }
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.userId = undefined;
      }
    };
  }, [user, isLoading, authIsPro, auth]);
  
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

  // Track FAB state in component state for more reliable rendering
  const [fabButtonState, setFabButtonState] = useState({
    isLoading: false,
    isReady: false
  });
  
  // Special handler for checking if we've just clicked the FAB and need to reset its state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check if we're already on the meals page and should reset the button
      const forceMealCardViewCheck = () => {
        const forceMealCardView = localStorage.getItem('forceMealCardView') === 'true';
        if (forceMealCardView && pathname === '/meals') {
          console.log("[Navbar] Force meal card view detected - updating button state");
          
          // Update the fab button state to show the normal icon
          setFabButtonState({
            isLoading: false,
            isReady: false
          });
          
          // Also update the context state
          setHasViewedGeneratedMeals(true);
        }
      };
      
      // Check immediately and after a short delay (to handle route changes)
      forceMealCardViewCheck();
      const timeoutId = setTimeout(forceMealCardViewCheck, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [pathname, setHasViewedGeneratedMeals]);
  
  // Listen for changes in generation state and poll for meal plan ready notifications
  useEffect(() => {
    // Only poll if we're generating or if a poll was interrupted
    if ((!isGenerating && !window.interruptedPolling) || !user) return;
    
    // Update fabButtonState to match isGenerating immediately
    setFabButtonState(prev => ({
      ...prev,
      isLoading: isGenerating,
      isReady: mealGenerationComplete && !hasViewedGeneratedMeals
    }));
    
    // Use trackingId from selectors
    const trackingId = taskTrackingId || backgroundTaskId;
    
    console.log(`[Navbar] Starting polling with jobId: ${currentJobId}, trackingId: ${trackingId}`);
    
    // Set up polling with proper job tracking
    let pollTimer;
    const checkForCompletedMeal = async () => {
      try {
        // Only check if we're still generating
        if (!isGenerating && !window.interruptedPolling) return;
        
        // Always update the store hydration state first
        markStoreHydrated();
        
        // Check API with added tracking params
        console.log("[Navbar] Checking for completed meal plan");
        const response = await fetch(`/api/webhook/meal-ready?user_id=${user.sub}&checkReadyPlans=true` + 
          (currentJobId ? `&jobId=${currentJobId}` : '') +
          (trackingId ? `&taskId=${trackingId}` : '')
        );
        
        if (response.ok) {
          const data = await response.json();
          // If we found a notification, update the state through the Zustand store
          if (data.has_notification && data.notification) {
            console.log("[Navbar] 🎉 Found completed meal plan notification:", data.notification);
            
            // Clear the interrupted polling flag
            window.interruptedPolling = false;
            
            // Use the Zustand handler for atomic state update
            const handled = notifyMealPlanComplete({
              ...data.notification,
              jobId: currentJobId,
              taskId: trackingId,
              timestamp: new Date().toISOString(),
              source: 'navbar_poll'
            });
            
            if (handled) {
              // Update only the visual button state immediately - Zustand handles the rest
              setFabButtonState({
                isLoading: false,
                isReady: true
              });
            } else {
              console.log("[Navbar] Store declined to handle the notification");
            }
          }
        }
      } catch (error) {
        console.error("[Navbar] Error checking for meal completion:", error);
        // Mark that polling was interrupted so we can resume on reload
        if (typeof window !== 'undefined') {
          window.interruptedPolling = true;
        }
      }
    };
    
    // Start polling every 5 seconds
    pollTimer = setInterval(checkForCompletedMeal, 5000);
    
    // Initial check - run immediately
    checkForCompletedMeal();
    
    // Also listen for direct events
    const handleMealReady = (event) => {
      console.log("[Navbar] Received direct mealPlanReady event:", event?.detail);
      
      // Check if this notification's job ID matches our current job ID (if any)
      const eventJobId = event?.detail?.jobId;
      
      if (currentJobId && eventJobId && currentJobId !== eventJobId) {
        console.log(`[Navbar] Event job ID ${eventJobId} doesn't match current job ID ${currentJobId}, ignoring`);
        return;
      }
      
      // Update visual button state
      setFabButtonState({
        isLoading: false,
        isReady: true
      });
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('mealPlanReady', handleMealReady);
    }
    
    return () => {
      clearInterval(pollTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('mealPlanReady', handleMealReady);
      }
    };
  }, [
    isGenerating, 
    user, 
    mealGenerationComplete, 
    hasViewedGeneratedMeals, 
    currentJobId, 
    taskTrackingId, 
    backgroundTaskId, 
    markStoreHydrated,
    notifyMealPlanComplete
  ]);
  
  // Get FAB state based on component state
  const getFabState = () => {
    // First determine the logical state based on all available signals
    const isInLoadingState = fabButtonState.isLoading || isGenerating || 
                          (typeof window !== 'undefined' && window.mealLoading === true);
    
    const isInReadyState = fabButtonState.isReady || 
                         (mealGenerationComplete && !hasViewedGeneratedMeals) || 
                         (typeof window !== 'undefined' && window.mealPlanReady === true && !hasViewedGeneratedMeals);
    
    const isInMenuOpenState = fabMenuOpen || daysMenuOpen;
    
    // Loading state takes precedence
    if (isInLoadingState && !isInMenuOpenState && !isInReadyState) {
      return {
        icon: (
          <svg className="animate-spin w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ),
        color: "bg-orange-500 hover:bg-orange-600"
      };
    }
    
    // Menu open states
    if (isInMenuOpenState) {
      return {
        icon: <X className="w-8 h-8" />,
        color: "bg-teal-700"
      };
    }
    
    // Ready state
    if (isInReadyState) {
      return {
        icon: <Check className="w-8 h-8" />,
        color: "bg-green-500 hover:bg-green-600"
      };
    }
    
    // Default state
    return {
      icon: <Plus className="w-8 h-8" />,
      color: pathname === '/meals' ? "bg-teal-600 hover:bg-teal-700" : "bg-teal-500 hover:bg-teal-600"
    };
  };
  
  const fabState = getFabState();

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
              
              {/* Radial menu removed - moving functionality to the overview page */}
              
              {/* Overlay removed - moved functionality to overview page */}
              
              <div className="relative">
                <button
                  onClick={handleFabClick}
                  disabled={false} // Never disable the button to improve UX
                  className={`fab-button ${fabState.color} text-white w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
                    daysMenuOpen ? 'rotate-45' : ''
                  } ${mealGenerationComplete && !hasViewedGeneratedMeals ? 'pulse-animation' : ''}`}
                >
                  {fabState.icon}
                </button>
                
              </div>
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

// Add pulse animation styles
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