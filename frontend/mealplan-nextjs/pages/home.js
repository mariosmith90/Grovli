import React from 'react';
import { useRouter } from 'next/router';
import { LogIn } from 'lucide-react';

const HomePage = () => {
  const router = useRouter();

  const handleGetStarted = () => {
    router.push('/');
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
          <div className="text-white text-6xl font-bold cursor-pointer pt-4" onClick={() => router.push('/home')}>
            Grovli
          </div>

          {/* Auth Buttons */}
          <div className="space-x-4">
            <button 
              onClick={() => router.push('/login')}
              className="px-6 py-2 text-white hover:text-gray-200 transition-colors"
            >
              Login
            </button>
            <button 
              onClick={() => router.push('/register')}
              className="px-6 py-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2"
            >
              <LogIn size={20} />
              Register
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex items-center justify-center min-h-[calc(100vh-88px)]">
        <div className="max-w-3xl mx-auto text-center px-6">
          <h1 className="text-5xl font-bold text-white mb-6">
            Smart Meal Planning, Made Simple
          </h1>
          <p className="text-xl text-gray-200 mb-8">
            Grovli helps you take the guesswork out of meal planning with personalized,  
            balanced meal plans tailored to your lifestyle. Enjoy stress-free eating while staying on
            track with your nutrition goals—one delicious meal at a time!
          </p>
          <button 
            onClick={handleGetStarted}
            className="px-8 py-3 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors text-lg font-medium"
          >
            Get Started
          </button>
        </div>
      </main>
    </div>
  );
};

export default HomePage;