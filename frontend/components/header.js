"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from "@auth0/nextjs-auth0";
import { Menu } from 'lucide-react';

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
    }
    
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
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
                onClick={() => router.push('/planner')}
                className="text-white hover:text-teal-300"
              >
                Planner
              </button>
              <button
                onClick={() => router.push('/profile')}
                className="text-white hover:text-teal-300"
              >
                Profile
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
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg z-50 mobile-menu-content">
              <ul className="py-2 text-gray-900">
                {!isAuthenticated ? (
                  <>
                    <li>
                      <button
                        onClick={() => {
                          router.push('/auth/login?returnTo=/profile');
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
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
                        className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
                      >
                        Register
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    {/* Planner link without icon */}
                    <li>
                      <button
                        onClick={() => {
                          router.push('/planner');
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
                      >
                        Planner
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          router.push('/profile');
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
                      >
                        Profile
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          router.push('/auth/logout');
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
                      >
                        Logout
                      </button>
                    </li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}