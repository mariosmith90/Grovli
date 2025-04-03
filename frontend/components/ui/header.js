"use client";
import { useRouter } from 'next/navigation';
import { Settings, Bot, ShoppingCart, Menu, X } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

export default function Header({ toggleChatbot }) {
  const router = useRouter();
  const [pathname, setPathname] = useState('');
  const [shouldShow, setShouldShow] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Get current path and set visibility on client side
  useEffect(() => {
    // Function to check current path and update state
    const checkPath = () => {
      const currentPath = window.location.pathname;
      setPathname(currentPath);
      // Check if header should be hidden
      const hidePaths = ['/settings', '/', '/onboarding'];
      const shouldHide = hidePaths.includes(currentPath) || 
                         hidePaths.some(path => currentPath.startsWith(path + '/'));
      setShouldShow(!shouldHide);
    };

    // Check path immediately
    checkPath();

    // Add event listeners for path changes
    window.addEventListener('popstate', checkPath);
    const handleRouteChange = () => {
      setTimeout(checkPath, 100); // Small delay to ensure path has updated
    };
    document.addEventListener('click', handleRouteChange);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('popstate', checkPath);
      document.removeEventListener('click', handleRouteChange);
    };
  }, []);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Don't render if we shouldn't show
  if (!shouldShow) {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 p-2 bg-white/90 backdrop-blur-sm flex items-center justify-between">
      {/* Logo Section */}
      <div 
        className="cursor-pointer"
        onClick={() => {
          // Always go to the meal selection page, not the meal card view
          router.push('/meals');
          // Clear any meal plan data if we're navigating from meal cards
          if (typeof window !== 'undefined' && window.mealPlanActive) {
            window.mealPlan = [];
          }
        }}
      >
        <img 
          src="/logo.png" 
          alt="App Logo" 
          className="h-16 w-auto" 
        />
      </div>

      {/* Hamburger Menu */}
      <div className="relative mr-2" ref={menuRef}>
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)} 
          className="p-3 rounded-full bg-transparent hover:bg-white/10 transition-all text-teal-600 hover:text-teal-700"
          aria-label="Menu"
        >
          {isMenuOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
        </button>
        
        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg bg-white/90 backdrop-blur-sm overflow-hidden transform origin-top-right transition-all duration-200 ease-in-out z-50">
            <div className="py-1">
              {/* Shopping Cart Button */}
              <button 
                onClick={() => {
                  router.push('/pantry');
                  setIsMenuOpen(false);
                }} 
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100/80 transition-all hover:text-teal-600"
              >
                <ShoppingCart className="w-5 h-5" />
                <span>Shopping Cart</span>
              </button>
              
              {/* Chatbot Toggle Button */}
              <button 
                onClick={() => {
                  window.toggleChatbotWindow?.();
                  setIsMenuOpen(false);
                }} 
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100/80 transition-all hover:text-teal-600"
              >
                <Bot className="w-5 h-5" />
                <span>Chatbot Assistant</span>
              </button>

              {/* Settings Button */}
              <button 
                onClick={() => {
                  router.push('/settings');
                  setIsMenuOpen(false);
                }} 
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100/80 transition-all hover:text-teal-600"
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}