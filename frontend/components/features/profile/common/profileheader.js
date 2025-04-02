"use client";

export default function ProfileHeaderSection({ onViewMealPlanner, title = "Today's Meals" }) {
  return (
    <div className="mb-4 flex justify-between items-center">
      <h2 className="text-2xl font-semibold text-gray-800">{title}</h2>
      <button
        onClick={onViewMealPlanner}
        className="flex items-center text-teal-600 hover:text-teal-800 transition-colors"
      >
        View Meal Planner
      </button>
    </div>
  );
}