import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { LogIn } from 'lucide-react';

const HomePage = () => {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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

  const handleAuthButtonClick = () => {
    if (isAuthenticated) {
      localStorage.removeItem("token"); // Clear token on logout
      setIsAuthenticated(false);
      router.push('/home'); // Redirect to home page after logout
    } else {
      router.push('/login'); // Redirect to login page
    }
  };

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

          {/* Auth Buttons */}
          <div className="space-x-4">
            <button 
              onClick={handleAuthButtonClick} 
              className="px-6 py-2 text-white hover:text-gray-200 transition-colors"
            >
              {isAuthenticated ? "Logout" : "Login"}
            </button>
            {!isAuthenticated && (
              <button 
                onClick={() => router.push('/register')}
                className="px-6 py-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2"
              >
                <LogIn size={20} />
                Register
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex items-center justify-center min-h-screen w-full overflow-y-hidden">
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