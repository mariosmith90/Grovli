import React from 'react';
import { Settings } from 'lucide-react';

const SettingsIcon = ({ 
  onClick, 
  className = '' 
}) => {
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-full hover:bg-gray-100 transition-colors group ${className}`}
      aria-label="Open Settings"
    >
      <Settings 
        className="w-6 h-6 text-gray-600 group-hover:text-teal-600 transition-colors" 
      />
    </button>
  );
};

export default SettingsIcon;