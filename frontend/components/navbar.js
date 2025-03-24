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
  Check
} from 'lucide-react';

export default function BottomNavbar({ children }) {
  const router = useRouter();
  const [pathname, setPathname] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useUser();
  const isAuthenticated = !!user;
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Track if we've been to the meals page to preserve function access
  const [visitedMealsPage, setVisitedMealsPage] = useState(false);

  // Get current path only after component mounts (client-side only)
  useEffect(() => {
    // Safe check for browser environment
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      setPathname(currentPath);
      
      // If we're on the meals page now, mark that we've visited it
      if (currentPath === '/meals') {
        setVisitedMealsPage(true);
      }
      
      // Handle route changes
      const handleRouteChange = () => {
        const newPath = window.location.pathname;
        setPathname(newPath);
        
        // If navigating to the meals page, mark that we've visited it
        if (newPath === '/meals') {
          setVisitedMealsPage(true);
        }
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
          }
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

  // Check if a path is active
  const isActive = (path) => {
    if (!pathname) return false;
    
    // Special case for settings page
    if (path === '/settings' && pathname === '/settings') {
      return true;
    }
    
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  // Handle clicking outside of mobile menu
  useEffect(() => {
    if (menuOpen && typeof document !== 'undefined') {
      const handleOutsideClick = (event) => {
        if (!event.target.closest(".mobile-menu") && 
            !event.target.closest(".mobile-menu-content")) {
          setMenuOpen(false);
        }
      };
      
      document.addEventListener("mousedown", handleOutsideClick);
      document.body.style.overflow = 'hidden'; // Prevent scrolling
      
      return () => {
        document.removeEventListener("mousedown", handleOutsideClick);
        document.body.style.overflow = 'auto';
      };
    }
  }, [menuOpen]);

  // Handle the FAB click - if on meals page, trigger the global function
  const handleFabClick = async () => {
    if (pathname === '/meals' || (visitedMealsPage && !pathname.startsWith('/meals'))) {
      // If not on meals page but have visited it, navigate back
      if (pathname !== '/meals') {
        router.push('/meals');
        return;
      }
      
      // We're on the meals page, proceed with generation
      setIsGenerating(true);
      
      if (typeof window !== 'undefined') {
        // Try to find and call the global function
        if (window.generateMeals && typeof window.generateMeals === 'function') {
          try {
            await window.generateMeals();
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

  // Key icon and button features based on current state
  const getFabIcon = () => {
    if (isGenerating) {
      // Show loading spinner when generating
      return (
        <svg className="animate-spin w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
    } else if (pathname === '/meals') {
      // Checkmark when on meals page
      return <Check className="w-7 h-7" />;
    } else {
      // Plus icon for other pages
      return <Plus className="w-7 h-7" />;
    }
  };

  // Get the right button color based on state
  const getFabColor = () => {
    if (pathname === '/meals') {
      return "bg-teal-600 hover:bg-blue-700";
    } else {
      return "bg-teal-500 hover:bg-teal-600";
    }
  };

  return (
    <>
      {/* Render any children (props) passed to this component */}
      <div className={shouldShowNavbar() ? "mb-20" : ""}>
        {children}
      </div>
      
      {/* Fixed Bottom Navigation - Only show on relevant pages */}
      {shouldShowNavbar() && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
          {/* Floating Action Button for creating meals */}
          {isAuthenticated && (
            <div className="absolute left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
              <button
                onClick={handleFabClick}
                disabled={isGenerating}
                className={`${getFabColor()} text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all`}
              >
                {getFabIcon()}
              </button>
            </div>
          )}
          
          <div className="max-w-screen-xl mx-auto px-4">
            {isAuthenticated ? (
              <div className="flex justify-around items-center h-16">
                {/* Meals Button */}
                <NavButton 
                  icon={<Utensils className="w-6 h-6" />} 
                  label="Meals" 
                  path="/meals" 
                  isActive={isActive('/meals')}
                  onClick={() => router.push('/meals')}
                />
                
                {/* Planner Button */}
                <NavButton 
                  icon={<Calendar className="w-6 h-6" />} 
                  label="Planner" 
                  path="/planner" 
                  isActive={isActive('/planner')}
                  onClick={() => router.push('/planner')}
                />
                
                {/* Empty space for FAB */}
                <div className="w-12 h-full"></div>
                
                {/* Pantry Button */}
                <NavButton 
                  icon={<ShoppingBag className="w-6 h-6" />} 
                  label="Pantry" 
                  path="/pantry" 
                  isActive={isActive('/pantry')}
                  onClick={() => router.push('/pantry')}
                />
                
                {/* Profile Button */}
                <NavButton 
                  icon={<User className="w-6 h-6" />} 
                  label="Profile" 
                  path="/profile" 
                  isActive={isActive('/profile') || isActive('/saved-meals')}
                  onClick={() => router.push('/profile')}
                />
              </div>
            ) : (
              <div className="flex justify-around items-center h-16">
                <NavButton 
                  icon={<Home className="w-6 h-6" />} 
                  label="Home" 
                  path="/" 
                  isActive={isActive('/')}
                  onClick={() => router.push('/')}
                />
                
                <NavButton 
                  icon={<User className="w-6 h-6" />} 
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
                          router.push('/saved-meals');
                          setMenuOpen(false);
                        }}
                        className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-12 h-12 flex items-center justify-center bg-teal-100 text-teal-600 rounded-full mb-2">
                          <BookOpen className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">Saved Meals</span>
                      </button>

                      <button
                        onClick={() => {
                          router.push('/settings');
                          setMenuOpen(false);
                        }}
                        className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-12 h-12 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full mb-2">
                          <Settings className="w-6 h-6" />
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
                          <LogOut className="w-6 h-6" />
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
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

// NavButton component for consistent styling
function NavButton({ icon, label, path, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-full h-full focus:outline-none transition-colors ${
        isActive 
          ? 'text-teal-600' 
          : 'text-gray-500 hover:text-teal-600'
      }`}
    >
      <div className={`relative ${isActive ? 'scale-110 transition-transform' : ''}`}>
        {icon}
        {isActive && (
          <span className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-teal-600 rounded-full"></span>
        )}
      </div>
      <span className={`text-xs mt-1 ${isActive ? 'font-medium' : ''}`}>{label}</span>
    </button>
  );
}