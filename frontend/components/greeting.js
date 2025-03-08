"use client";
import { useState, useEffect } from 'react';

export default function DynamicGreeting({ user }) {
  const [greeting, setGreeting] = useState('');
  
  useEffect(() => {
    // Get current hour to determine time of day
    const currentHour = new Date().getHours();
    
    // Set greeting based on time of day
    if (currentHour >= 5 && currentHour < 12) {
      setGreeting('Good morning');
    } else if (currentHour >= 12 && currentHour < 18) {
      setGreeting('Good afternoon');
    } else {
      setGreeting('Good evening');
    }
  }, []);
  
  // Extract first name from user.name if user exists
  const firstName = user?.name ? user.name.split(' ')[0] : '';
  
  if (!user) {
    return (
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">
        Your Meal Plan
      </h2>
    );
  }
  
  return (
    <h2 className="text-xl font-semibold text-gray-800 mb-6">
      {greeting}, {firstName}
    </h2>
  );
}