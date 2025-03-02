"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0"; 

const HomePage = () => {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);

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

  const handleTryGrovli = () => {
    router.push("/meals"); 
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

      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 w-full p-6 bg-gray-500 bg-opacity-90 shadow-md z-50">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div
            className="text-white text-5xl font-bold cursor-pointer"
            onClick={() => router.push("/")}
          >
            Grovli
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex space-x-6 items-center">
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => router.push("/subscriptions")}
                  className="text-white text-lg font-semibold hover:text-gray-300 transition"
                >
                  Plans
                </button>
                <button
                  onClick={() => router.push("/account")}
                  className="text-white text-lg font-semibold hover:text-gray-300 transition"
                >
                  Account
                </button>
                <button
                  onClick={() => {
                    window.location.href = "/auth/logout"; // ✅ Logout with Auth0
                  }}
                  className="text-white text-lg font-semibold hover:text-gray-300 transition"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => window.location.href = "/auth/login"} // ✅ Auth0 login
                  className="text-white text-lg font-semibold hover:text-gray-300 transition"
                >
                  Login
                </button>
                <button
                  onClick={() => router.push("/register")}
                  className="text-white text-lg font-semibold hover:text-gray-300 transition"
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

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

      {/* ✅ Footer Restored */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 w-full bg-gray-500 text-white text-center py-6">
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