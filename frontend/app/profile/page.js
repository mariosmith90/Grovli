"use client";

import { useCallback, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Import our custom hooks and components
import { useProfileActions } from '../../lib/hooks/useProfileActions';
import MealTypeIcon from '../../components/features/profile/timeline/MealTypeIcon';
import DayTimelineSlider from '../../components/features/profile/timeline/daytimeline';
import MealTimeline from '../../components/features/profile/mealplan/mealtimeline';
import NextMealCard from '../../components/features/profile/timeline/nextmeal';
import CalorieProgressBar from '../../components/features/profile/common/caloriebar';
import SavedMeals from '../../components/features/profile/mealplan/savedmeals';
import ProfileHeaderSection from '../../components/features/profile/common/profileheader';

export default function ProfilePage() {
  // Get all state and actions from our custom hook
  const {
    // User state
    user,
    isAuthenticated,
    isAuthLoading,
    
    // UI state
    activeSection,
    isLoadingSavedMeals,
    selectedDate,
    selectedMealType,
    
    // Meal data
    mealPlan,
    nextMeal,
    currentMealIndex,
    completedMeals,
    calorieData,
    globalSettings,
    
    // Actions
    handleDateChange,
    handleJustAte,
    handleToggleMealCompletion,
    handleRemoveMeal,
    handleAddMeal,
    handleSelectSavedMeal,
    handleCreateNewMeals,
    handleViewMealPlanner,
    setActiveSection
  } = useProfileActions();
  
  // Reference for the timeline scroll
  const timelineRef = useRef(null);
  
  // Scroll to today in the timeline when data is ready
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (timelineRef.current) {
      const scrollToToday = () => {
        const todayElement = timelineRef.current.querySelector('[data-today="true"]');
        if (!todayElement) return;
        
        // Detect mobile for optimized scrolling
        const isMobile = window.navigator.userAgent.includes('Mobile');
        
        try {
          if (isMobile) {
            // Simple scroll for mobile (better performance)
            const container = timelineRef.current;
            const elementOffset = todayElement.offsetLeft;
            const containerWidth = container.clientWidth;
            
            // Center the element
            const scrollTo = elementOffset - (containerWidth / 2) + (todayElement.offsetWidth / 2);
            container.scrollLeft = scrollTo;
          } else {
            // Smooth scroll for desktop
            todayElement.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'center'
            });
          }
        } catch (err) {
          console.error("Error scrolling to today:", err);
          
          // Fallback manual scroll
          if (timelineRef.current) {
            const scrollPosition = todayElement.offsetLeft - (timelineRef.current.clientWidth / 2);
            timelineRef.current.scrollLeft = scrollPosition;
          }
        }
      };
      
      // Small delay to ensure DOM is fully rendered
      const scrollTimeout = setTimeout(scrollToToday, 300);
      return () => clearTimeout(scrollTimeout);
    }
  }, [mealPlan]);

  // Render sections based on loading state
  const renderContent = useCallback(() => {
    if (isAuthLoading) {
      return (
        <div className="flex justify-center items-center py-8">
          <div className="animate-pulse text-gray-500">Authenticating...</div>
        </div>
      );
    }
    
    if (!isAuthenticated) {
      return (
        <div className="flex flex-col justify-center items-center py-8 gap-4">
          <div className="text-red-500 font-medium">Please log in to view your meal plan</div>
          <button 
            onClick={() => window.location.href = '/auth/login?returnTo=/profile'} 
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Log in
          </button>
        </div>
      );
    }
    
    return (
      <>
        {/* Day Timeline Slider */}
        <section className="mb-4 bg-white p-4 rounded-lg shadow-sm">
          <DayTimelineSlider 
            currentDate={selectedDate}
            onDateChange={handleDateChange}
            timelineRef={timelineRef}
          />
        </section>

        {/* Next Meal Section */}
        <section className="mb-6 bg-white p-4">
          <h2 className="text-2xl font-semibold mb-3 flex items-center">
            <MealTypeIcon type={nextMeal.type} />
            {nextMeal.type.charAt(0).toUpperCase() + nextMeal.type.slice(1)}
          </h2>
          <NextMealCard 
            meal={nextMeal} 
            onJustAte={handleJustAte} 
            handleCreateNewMeals={handleCreateNewMeals} 
          />
          <div className="mt-4">
            <CalorieProgressBar 
              consumed={calorieData.consumed} 
              target={calorieData.target}
              globalSettings={globalSettings}
            />
          </div>
        </section>
        
        {/* Timeline or Saved Meals Section */}
        {activeSection === 'timeline' ? (
          <section className="mb-6 bg-white p-4">
            <h2 className="text-lg font-semibold mb-3">Your Meal Timeline</h2>
            <MealTimeline 
              meals={mealPlan} 
              onAddMeal={handleAddMeal}
              onRemoveMeal={handleRemoveMeal}
              toggleMealCompletion={handleToggleMealCompletion}
              completedMeals={completedMeals}
            />
          </section>
        ) : (
          <section className="mb-6 bg-white p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold">Saved Meals</h2>
              <button 
                onClick={() => setActiveSection('timeline')}
                className="text-teal-600 hover:underline flex items-center"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Timeline
              </button>
            </div>
            <SavedMeals 
              mealType={selectedMealType} 
              onSelectMeal={handleSelectSavedMeal}
              isLoading={isLoadingSavedMeals}
              handleCreateNewMeals={handleCreateNewMeals}
            />
          </section>
        )}
      </>
    );
  }, [
    isAuthLoading,
    isAuthenticated,
    selectedDate,
    nextMeal,
    activeSection,
    mealPlan,
    completedMeals,
    selectedMealType,
    isLoadingSavedMeals,
    calorieData,
    globalSettings,
    handleDateChange,
    handleJustAte,
    handleAddMeal,
    handleRemoveMeal,
    handleToggleMealCompletion,
    handleSelectSavedMeal,
    handleCreateNewMeals,
    setActiveSection
  ]);

  return (
    <>
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 border-none w-full max-w-4xl flex-grow flex flex-col">
          <ProfileHeaderSection
            title="Today's Meals"
            onViewMealPlanner={handleViewMealPlanner}
          />
          
          {renderContent()}
          
        </div>
      </main>
    </>
  );
}