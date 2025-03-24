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
  LogOut
} from 'lucide-react';

export default function BottomNavbar({ children }) {
  const router = useRouter();
  const [pathname, setPathname] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useUser();
  const isAuthenticated = !!user;

  // Get current path on client side
  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  // Check if the current route should have navigation
  const shouldShowNavbar = () => {
    // Don't show navbar on homepage or onboarding pages
    return !pathname || !(
      pathname === '/' || 
      pathname === '/onboarding' || 
      pathname.startsWith('/onboarding/')
    );
  };
  
  // Update path when navigation happens
  useEffect(() => {
    const handleRouteChange = () => {
      setPathname(window.location.pathname);
    };

    // Listen for route changes
    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // Handle clicking outside of mobile menu
  const handleOutsideClick = (event) => {
    if (menuOpen &&
        !event.target.closest(".mobile-menu") &&
        !event.target.closest(".mobile-menu-content")) {
      setMenuOpen(false);
    }
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

  // Add event listener on mount, remove on unmount
  useEffect(() => {
    if (menuOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      // Prevent scrolling when menu is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.body.style.overflow = 'auto';
    };
  }, [menuOpen]);

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
                onClick={() => router.push('/meals')}
                className="bg-teal-500 hover:bg-teal-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-colors"
              >
                <Plus className="w-7 h-7" />
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