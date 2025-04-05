"use client";

import { useCalorieService } from '../../../../lib/services/calorieDataService';

function CalorieProgressBar({ fallbackConsumed, fallbackTarget, globalSettings }) {  
  // Use our calorie service for consistent state
  const { 
    currentCalories, 
    targetCalories, 
    percentage, 
    remaining, 
    macros 
  } = useCalorieService();
  
  // Fallback to prop values if store is empty (for backwards compatibility)
  const displayedCalories = currentCalories || fallbackConsumed || 0;
  const displayedTarget = targetCalories || fallbackTarget || globalSettings?.calories || 2000;
  const displayedPercentage = percentage || Math.min(Math.round((displayedCalories / displayedTarget) * 100), 100);
  const displayedRemaining = remaining !== undefined ? remaining : (displayedTarget - displayedCalories);
  
  return (
    <div className="mt-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium">Daily Calories</span>
        <span className="text-sm font-medium">{displayedCalories} / {displayedTarget} kcal</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4">
        <div 
          className="bg-teal-600 h-4 rounded-full" 
          style={{ width: `${displayedPercentage}%` }}
        ></div>
      </div>
      <p className="text-sm text-gray-600 mt-2">
        {displayedRemaining > 0 
          ? `You have ${displayedRemaining} calories remaining today` 
          : "You've reached your calorie goal for today"}
      </p>
      
      {/* Optional macros display */}
      {macros && (macros.protein > 0 || macros.carbs > 0 || macros.fat > 0) && (
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>Protein: {macros.protein}g</span>
          <span>Carbs: {macros.carbs}g</span>
          <span>Fat: {macros.fat}g</span>
        </div>
      )}
    </div>
  );
}

export default CalorieProgressBar;