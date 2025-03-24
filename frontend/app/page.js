"use client"
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0";
import { Download, ArrowRight } from 'lucide-react';
import Header from '../components/header';

const HomePage = () => {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [deferredPrompt, setDeferredPrompt] = useState(null);

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
      
      {/* Subtle Geometric Overlay */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-gradient-to-br from-teal-500 to-blue-600 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-1/3 h-1/3 bg-purple-500 rounded-full blur-3xl"></div>
      </div>
      
      {/* Header Component */}
      <Header />
      
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

            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="w-full flex items-center justify-center gap-2 border border-white/10 text-white/70 py-3 rounded-xl hover:bg-white/5 transition-all duration-300 ease-in-out group"
              >
                <Download 
                  className="text-teal-400 group-hover:rotate-6 transition-transform" 
                  size={20} 
                />
                Install App
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default HomePage;