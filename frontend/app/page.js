"use client"
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0";
import { ArrowRight } from 'lucide-react';

const HomePage = () => {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [installPromptShown, setInstallPromptShown] = useState(false);

  useEffect(() => {
    // Let the browser handle the install prompt automatically
    // This will display the standard browser PWA install prompt
    // when the browser determines it's appropriate
    
    // We'll just track if the prompt has been shown for analytics
    let promptDisplayed = false;
    
    const handleAppInstalled = () => {
      console.log('App was installed');
      // You can track this event for analytics
      setInstallPromptShown(true);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const isAuthenticated = !!user;
  
  if (typeof window === "undefined") return null;
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-500 to-blue-600">
        <div className="animate-pulse w-16 h-16 bg-white/30 rounded-full"></div>
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
      
      {/* Subtle Geometric Overlay */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-gradient-to-br from-teal-500 to-blue-600 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-1/3 h-1/3 bg-purple-500 rounded-full blur-3xl"></div>
      </div>
      
      {/* Main Content */}
      <main className="relative z-10 flex items-center justify-center min-h-screen w-full px-4">
        <div className="max-w-md w-full text-center space-y-6 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 p-8 shadow-2xl">
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold text-white tracking-tight">Grovli</h1>
            <p className="text-gray-400 text-sm">Intelligent Meal Planning</p>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={handleGetStarted}
              className="w-full flex items-center justify-center gap-2 bg-white/10 text-white py-3 rounded-xl hover:bg-white/20 transition-all duration-300 ease-in-out group"
            >
              Get Started
              <ArrowRight 
                className="transform group-hover:translate-x-1 transition-transform" 
                size={20} 
              />
            </button>
            
            {/* The standard browser install prompt will show automatically */}
            {/* No custom install button needed */}
          </div>
        </div>
      </main>
    </div>
  );
};

export default HomePage;