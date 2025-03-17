"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from "@auth0/nextjs-auth0";
import { Menu, X } from 'lucide-react';

export default function Header() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useUser();
  const isAuthenticated = !!user;

  // Handle clicking outside of mobile menu
  const handleOutsideClick = (event) => {
    if (menuOpen &&
        !event.target.closest(".mobile-menu") &&
        !event.target.closest(".mobile-menu-content")) {
      setMenuOpen(false);
    }
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
    <nav className="fixed top-0 left-0 w-full py-3 px-4 bg-gray-500 bg-opacity-90 shadow-md z-50">
      <div className="flex justify-between items-center max-w-6xl mx-auto">
        {/* Title with Link (Smaller Text) */}
        <div
          className="text-white text-2xl font-bold cursor-pointer"
          onClick={() => router.push('/')}
        >
          Grovli
        </div>

        {/* Desktop Navigation - Hidden on Mobile */}
        <div className="hidden md:flex items-center space-x-6">
          {isAuthenticated ? (
            <>
              <button
                onClick={() => router.push('/meals')}
                className="text-white hover:text-teal-300"
              >
                Meals
              </button>
              <button
                onClick={() => router.push('/planner')}
                className="text-white hover:text-teal-300"
              >
                Planner
              </button>
              <button
                onClick={() => router.push('/pantry')}
                className="text-white hover:text-teal-300"
              >
                Pantry
              </button>
              <button
                onClick={() => router.push('/profile')}
                className="text-white hover:text-teal-300"
              >
                Profile
              </button>
              <button
                onClick={() => router.push('/saved-meals')}
                className="text-white hover:text-teal-300"
              >
                My Meals
              </button>
              <button
                onClick={() => router.push('/settings')}
                className="text-white hover:text-teal-300"
              >
                Settings
              </button>
              <button
                onClick={() => router.push('/auth/logout')}
                className="text-white hover:text-teal-300"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => router.push('/auth/login?returnTo=/profile')}
                className="text-white hover:text-teal-300"
              >
                Login
              </button>
              <button
                onClick={() => router.push('/register')}
                className="text-white hover:text-teal-300"
              >
                Register
              </button>
            </>
          )}
        </div>

        {/* Mobile Navigation - Always Visible on Mobile */}
        <div className="md:hidden relative mobile-menu">
          <button onClick={() => setMenuOpen(!menuOpen)} className="text-white">
            <Menu size={32} />
          </button>
          
          {/* Full-height, full-width menu that slides in from the right */}
          {menuOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
              <div 
                className="fixed top-0 right-0 h-full w-full max-w-xs bg-gradient-to-b from-gray-800 to-gray-900 shadow-xl transform transition-transform duration-300 ease-in-out mobile-menu-content flex flex-col"
              >
                <div className="flex justify-between items-center py-5 px-4 border-b border-gray-700" style={{ height: '80px' }}>
                  <button onClick={() => setMenuOpen(false)} className="text-white absolute right-4">
                    <X size={32} />
                  </button>
                </div>
                
                <ul className="py-4 text-white w-full">
                  {!isAuthenticated ? (
                    <>
                      <li>
                        <button
                          onClick={() => {
                            router.push('/auth/login?returnTo=/profile');
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-6 py-4 text-lg font-medium hover:bg-gray-700 transition-colors duration-200 flex items-center justify-end"
                        >
                          Login
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            router.push('/register');
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-6 py-4 text-lg font-medium hover:bg-gray-700 transition-colors duration-200 flex items-center justify-end"
                        >
                          Register
                        </button>
                      </li>
                    </>
                  ) : (
                    <>
                      {/* Meals link */}
                      <li>
                        <button
                          onClick={() => {
                            router.push('/meals');
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-6 py-4 text-lg font-medium hover:bg-gray-700 transition-colors duration-200 flex items-center justify-end"
                        >
                          Meals
                        </button>
                      </li>
                      {/* Planner link */}
                      <li>
                        <button
                          onClick={() => {
                            router.push('/planner');
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-6 py-4 text-lg font-medium hover:bg-gray-700 transition-colors duration-200 flex items-center justify-end"
                        >
                          Planner
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            router.push('/pantry');
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-6 py-4 text-lg font-medium hover:bg-gray-700 transition-colors duration-200 flex items-center justify-end relative"
                        >
                          Pantry
                          <span className="ml-2 bg-orange-500 text-white text-xs px-1 py-0.5 rounded">BETA</span>
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            router.push('/profile');
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-6 py-4 text-lg font-medium hover:bg-gray-700 transition-colors duration-200 flex items-center justify-end"
                        >
                          Profile
                        </button>
                      </li>
                      {/* Saved Meals link */}
                      <li>
                        <button
                          onClick={() => {
                            router.push('/saved-meals');
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-6 py-4 text-lg font-medium hover:bg-gray-700 transition-colors duration-200 flex items-center justify-end"
                        >
                          My Meals
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            router.push('/settings');
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-6 py-4 text-lg font-medium hover:bg-gray-700 transition-colors duration-200 flex items-center justify-end"
                        >
                          Settings
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            router.push('/auth/logout');
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-6 py-4 text-lg font-medium hover:bg-gray-700 transition-colors duration-200 flex items-center justify-end"
                        >
                          Logout
                        </button>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}