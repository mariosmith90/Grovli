"use client";

import { Coffee, Utensils, Apple, Moon } from 'lucide-react';
import { useMemo } from 'react';

/**
 * Component for rendering meal type icons
 * Extracted to its own component for reusability
 */
const MealTypeIcon = ({ type, className = "w-6 h-6 mr-2 text-teal-600" }) => {
  // Map of meal types to their icon components
  const icons = useMemo(() => ({
    breakfast: Coffee,
    lunch: Utensils,
    snack: Apple,
    dinner: Moon
  }), []);
  
  // Get the icon component for this type
  const Icon = icons[type];
  
  // Render the icon if one exists for this type
  return Icon ? <Icon className={className} /> : null;
};

export default MealTypeIcon;