"use client";

import { useState, useEffect } from 'react';

function DayTimelineSlider({ currentDate, onDateChange, timelineRef }) {
  const [dates, setDates] = useState([]);
  
  useEffect(() => {
    const generateDates = () => {
      const result = [];
      const today = new Date();
      
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 3);
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        result.push(date);
      }
      
      setDates(result);
    };
    
    generateDates();
  }, [currentDate]);

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };
  
  const isSelected = (date) => {
    return date.getDate() === currentDate.getDate() &&
           date.getMonth() === currentDate.getMonth() &&
           date.getFullYear() === currentDate.getFullYear();
  };
  
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-700">Select Day</h3>
        <button 
          onClick={() => onDateChange(new Date())}
          className="text-sm text-teal-600 hover:text-teal-800 transition-colors"
        >
          Today
        </button>
      </div>
      
      <div className="relative" ref={timelineRef}>
        <div className="flex justify-between items-center gap-2 overflow-x-auto py-2">
          {dates.map((date, index) => (
            <button
              key={index}
              onClick={() => onDateChange(date)}
              className={`flex flex-col items-center min-w-[60px] p-2 rounded-lg transition-all ${
                isSelected(date) 
                  ? 'bg-teal-500 text-white ring-2 ring-teal-300 transform scale-105' 
                  : isToday(date)
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-100'
              }`}
              data-today={isToday(date)}
            >
              <span className="text-xs font-medium">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className={`text-lg font-semibold ${isSelected(date) ? 'text-white' : ''}`}>
                {date.getDate()}
              </span>
              <span className="text-xs">
                {date.toLocaleDateString('en-US', { month: 'short' })}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DayTimelineSlider;