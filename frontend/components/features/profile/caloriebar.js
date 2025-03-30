"use client";

function CalorieProgressBar({ consumed, target, globalSettings }) {  
  const targetCalories = globalSettings?.calories || target;
  const percentage = Math.min(Math.round((consumed / targetCalories) * 100), 100);
  const remaining = targetCalories - consumed;
  
  return (
    <div className="mt-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium">Daily Calories</span>
        <span className="text-sm font-medium">{consumed} / {targetCalories} kcal</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4">
        <div 
          className="bg-teal-600 h-4 rounded-full" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <p className="text-sm text-gray-600 mt-2">
        {remaining > 0 
          ? `You have ${remaining} calories remaining today` 
          : "You've reached your calorie goal for today"}
      </p>
    </div>
  );
}

export default CalorieProgressBar;