import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { LogIn, Menu } from 'lucide-react';

const HomePage = () => {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    // Check for authentication token on page load
    const token = localStorage.getItem("token");
    setIsAuthenticated(!!token); // Convert token to boolean
  }, []);

  const handleGetStarted = () => {
    window.location.href = "https://form.typeform.com/to/r6ucQF6l"; // Redirect to Typeform
  };

  const handleTryGrovli = () => {
    if (isAuthenticated) {
      router.push('/'); // Redirect to meal planner
    } else {
      router.push('/login'); // Redirect to login
    }
  };

  // Handle click outside to close menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-gray-900">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url('/homepage.jpeg')`, 
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 w-full p-6">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          {/* Logo */}
          <div 
            className="text-white text-6xl font-bold cursor-pointer pt-4" 
            onClick={() => router.push('/home')}
          >
            Grovli
          </div>

          {/* Hamburger Menu */}
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(!menuOpen)} className="text-white">
              <Menu size={32} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg overflow-hidden z-50">
                <ul className="py-2 text-gray-900">
                  {isAuthenticated && (
                    <>
                      <li>
                        <button 
                          onClick={() => {
                            router.push('/subscriptions');
                            setMenuOpen(false);
                          }} 
                          className="w-full text-left px-4 py-2 hover:bg-gray-200 block"
                        >
                          Plans
                        </button>
                      </li>
                    </>
                  )}
                  {!isAuthenticated && (
                    <>
                      <li>
                        <button 
                          onClick={() => {
                            router.push('/login');
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
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex items-center justify-center min-h-screen w-full overflow-hidden">
        <div className="max-w-3xl mx-auto text-center px-6">
          <h1 className="text-5xl font-bold text-white mb-6">
            Smart Meal Planning, Made Simple
          </h1>
          <p className="text-xl text-gray-200 mb-8">
            Grovli helps you take the guesswork out of meal planning with personalized,  
            balanced meal plans tailored to your lifestyle. Enjoy stress-free eating while staying on
            track with your nutrition goals—one delicious meal at a time!
          </p>

          {/* Get Started - Redirects to Typeform */}
          <button 
            onClick={handleGetStarted}
            className="px-8 py-3 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors text-lg font-medium"
          >
            Get Started
          </button>

          {/* Try Grovli - Redirects to Meal Planner/Login */}
          <p 
            onClick={handleTryGrovli}
            className="text-white text-lg mt-4 cursor-pointer font-bold hover:underline"
          >
            Try Grovli
          </p>
        </div>
      </main>
    </div>
  );
};

export default HomePage;