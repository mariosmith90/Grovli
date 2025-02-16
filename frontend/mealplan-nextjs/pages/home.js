import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Menu } from 'lucide-react';

const HomePage = () => {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

      {/* Navigation Bar */}
      <nav className="relative z-20 w-full p-6 bg-gray-800 bg-opacity-90 shadow-md">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          {/* Logo */}
          <div 
            className="text-white text-5xl font-bold cursor-pointer" 
            onClick={() => router.push('/home')}
          >
            Grovli
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex space-x-6 items-center">
            {isAuthenticated ? (
              <button
                onClick={() => router.push('/subscriptions')}
                className="text-white text-lg font-semibold hover:text-gray-300 transition"
              >
                Plans
              </button>
            ) : (
              <>
                <button
                  onClick={() => router.push('/login')}
                  className="text-white text-lg font-semibold hover:text-gray-300 transition"
                >
                  Login
                </button>
                <button
                  onClick={() => router.push('/register')}
                  className="text-white text-lg font-semibold hover:text-gray-300 transition"
                >
                  Register
                </button>
              </>
            )}
          </div>

          {!isAuthenticated && (
            <div className="md:hidden relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="text-white">
                <Menu size={32} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg z-50">
                  <ul className="py-2 text-gray-900">
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
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex items-center justify-center min-h-screen w-full overflow-hidden">
        <div className="max-w-3xl mx-auto text-center px-6 bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-8">
          <h1 className="text-5xl font-bold text-white mb-6">
          Smart Meal Planning
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

      {/* Footer */}
      <footer className="relative z-10 w-full bg-gray-800 text-white text-center py-6 mt-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center px-6">
          {/* Left - Branding */}
          <div className="text-lg font-semibold">© {new Date().getFullYear()} Grovli</div>
          {/* Middle - Links */}
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="/about" className="hover:text-gray-600 transition">About</a>
            <a href="https://form.typeform.com/to/r6ucQF6l" className="hover:text-gray-600 transition">Contact</a>
            <a href="/terms" className="hover:text-gray-600 transition">Terms</a>
            <a href="/privacy" className="hover:text-gray-600 transition">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;