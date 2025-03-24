"use client"
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0";
import Header from '../components/header';

const HomePage = () => {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // PWA Install Prompt Setup
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Existing authentication checks
  const isAuthenticated = !!user;
  
  if (typeof window === "undefined") return null;
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  const handleGetStarted = async () => {
    if (!user) {
      router.push("/auth/login?returnTo=/onboarding");
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/user-profile/check-onboarding/${user.sub}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.onboarded) {
          router.push("/meals");
        } else {
          router.push("/onboarding");
        }
      } else {
        console.error("Failed to fetch onboarding status:", response.status);
        router.push("/onboarding");
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      router.push("/onboarding");
    }
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('App installed');
      }
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-gray-900">
      {/* Background Image */}
      <div
        className="fixed inset-0 z-0 min-h-screen"
        style={{
          backgroundImage: `url('/homepage.jpeg')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/50" />
      </div>
      
      {/* Header Component */}
      <Header />
      
      {/* Main Content */}
      <main className="relative z-10 flex items-center justify-center min-h-screen w-full overflow-hidden">
        <div className="max-w-3xl mx-auto text-center px-6 bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-8">
          <h1 className="text-5xl font-bold text-white mb-6">Smart Meal Planning</h1>
          <p className="text-xl text-gray-200 mb-8">
            Grovli helps you take the guesswork out of meal planning with personalized, balanced
            meal plans tailored to your lifestyle. Enjoy stress-free eating while staying on
            track with your nutrition goals—one delicious meal at a time!
          </p>
          
          {/* Get Started Button */}
          <div className="flex flex-col items-center space-y-4">
            <button
              onClick={handleGetStarted}
              className="px-8 py-3 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors text-lg font-medium"
            >
              Get Started
            </button>

            {/* Conditional Download Button */}
            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="px-8 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors text-lg font-medium"
              >
                Download App
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default HomePage;