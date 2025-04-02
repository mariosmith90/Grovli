"use client";

import { toast } from 'react-hot-toast';

/**
 * DuplicateMeals provides functionality for duplicating meals from one day to another
 * This is specific to the planner page's object-based meal plan format
 */
const DuplicateMeals = ({ 
  mealPlan,
  updateMealPlan,
  formatDateKey
}) => {
  // Duplicate meals from one day to another
  const duplicateDayMeals = (sourceDate, targetDate) => {
    if (!sourceDate || !targetDate) return;
    
    const sourceDateKey = formatDateKey(sourceDate);
    const targetDateKey = formatDateKey(targetDate);
    
    // Skip if trying to duplicate to the same day
    if (sourceDateKey === targetDateKey) {
      toast.error("Cannot duplicate to the same day");
      return false;
    }
    
    // Get meals from source day
    const sourceDayMeals = mealPlan[sourceDateKey] || {};
    
    // If no meals on source day, show error
    if (Object.keys(sourceDayMeals).length === 0) {
      toast.error("No meals to duplicate from selected day");
      return false;
    }
    
    // Create the updated meal plan
    const updatedMealPlan = { ...mealPlan };
    updatedMealPlan[targetDateKey] = { ...sourceDayMeals };
    
    // Create a list of affected meals for the saving indicator
    const affectedMeals = Object.keys(sourceDayMeals).map(mealType => ({ 
      dateKey: targetDateKey, 
      mealType 
    }));
    
    // Save the updated plan
    updateMealPlan(updatedMealPlan, 'duplicate', affectedMeals);
    return true;
  };

  return {
    duplicateDayMeals
  };
};

export default DuplicateMeals;