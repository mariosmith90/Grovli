"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0"; 
import Header from '../components/header';
import Footer from '../components/footer';

const HomePage = () => {
  const router = useRouter();
  const { user, isLoading } = useUser();

  // ✅ Convert user to authentication state
  const isAuthenticated = !!user;

  // ✅ Prevent SSR issues
  if (typeof window === "undefined") return null;

  // ✅ Handle Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  const handleGetStarted = () => {
    window.location.href = "https://form.typeform.com/to/r6ucQF6l"; // Redirect to Typeform
  };

  const handleTryGrovli = async () => {
    if (!user) {
      // If the user is not authenticated, redirect to login with a returnTo parameter
      router.push("/auth/login?returnTo=/onboarding");
      return;
    }
  
    try {
      // Check if the user has already completed onboarding
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/user-profile/check-onboarding/${user.sub}`);
  
      if (response.ok) {
        const data = await response.json();
        if (data.onboarded) {
          // If onboarding is complete, redirect to the meal planner
          router.push("/meals");
        } else {
          // If onboarding is not complete, redirect to onboarding
          router.push("/onboarding");
        }
      } else {
        console.error("Failed to fetch onboarding status:", response.status);
        // Fallback: Redirect to onboarding if the API call fails
        router.push("/onboarding");
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      // Fallback: Redirect to onboarding if there's an error
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

      {/* Footer Component */}
      <Footer />
    </div>
  );
};

export default HomePage;