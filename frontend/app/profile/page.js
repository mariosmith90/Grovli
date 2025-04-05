"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useUser } from '@auth0/nextjs-auth0';
import { useRouter } from 'next/navigation';

// Import our services, hooks, and components
import { useMealCompletionService } from '../../lib/services/mealCompletionService';
import { useCalorieService } from '../../lib/services/calorieDataService';
import { useSWRConfig } from 'swr';
import { useApiGet, useApiMutation } from '../../lib/swr-client';

// UI Components
import MealTypeIcon from '../../components/features/profile/timeline/MealTypeIcon';
import DayTimelineSlider from '../../components/features/profile/timeline/daytimeline';
import MealTimeline from '../../components/features/profile/mealplan/mealtimeline';
import NextMealCard from '../../components/features/profile/timeline/nextmeal';
import CalorieProgressBar from '../../components/features/profile/common/caloriebar';
import SavedMeals from '../../components/features/profile/mealplan/savedmeals';
import ProfileHeaderSection from '../../components/features/profile/common/profileheader';

// Zustand store for minimal UI state
import { useMealPlanStore } from '../../lib/stores/mealPlanStore';

export default function ProfilePage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  
  // Auth state first - always have this hook called in the same order
  const { user, isLoading: isAuthLoading } = useUser();
  const isAuthenticated = !!user;
  const userId = user?.sub || ''; // Provide empty string instead of undefined
  
  // Always call all hooks in the same order, regardless of auth state
  // Local UI state
  const [activeSection, setActiveSection] = useState('timeline');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isLoadingSavedMeals, setIsLoadingSavedMeals] = useState(false);
  
  // Our centralized services - always call these hooks
  const mealCompletionService = useMealCompletionService();
  const calorieService = useCalorieService();
  const apiMutation = useApiMutation();
  
  // Extract methods from services
  const { 
    completions, 
    toggleCompletion, 
    syncWithBackend,
    getCompletionsForDate,
    importFromSWR
  } = mealCompletionService;
  
  const {
    calculateFromMeals,
    setTargetCalories,
    importSettings
  } = calorieService;
  
  // Use meal plan store - always call this hook
  const mealPlanStore = useMealPlanStore();
  const { 
    profileMeals: mealPlan,
    setProfileMeals, 
    nextMeal,
    updateNextMealCard,
    savedMeals,
    setSavedMeals,
    globalSettings,
    activePlanId,
    setActivePlanId
  } = mealPlanStore;
  
  // Timeline scroll ref - always create this ref
  const timelineRef = useRef(null);
  
  // Data fetching keys - always define these keys, even if they're null
  const userProfileKey = userId ? `/user-profile/${userId}` : null;
  const userPlansKey = userId ? `/api/user-plans/user/${userId}` : null;
  const dateStr = selectedDate.toISOString().split('T')[0];
  const completionsKey = userId ? `/user-profile/meal-completion/${userId}/${dateStr}` : null;
  const savedMealsKey = userId ? `/api/user-recipes/saved-recipes` : null;
  
  // SWR data fetching hooks - always call these hooks in the same order
  const { data: userProfile } = useApiGet(userProfileKey);
  const { data: userPlans } = useApiGet(userPlansKey);
  const { data: completionsData } = useApiGet(completionsKey);
  const { data: savedMealsData } = useApiGet(savedMealsKey);
  
  // Helper to format time
  const formatTime = (timeStr) => {
    if (!timeStr) return '00:00';
    return timeStr;
  };
  
  // Initialize when user data is loaded - with better error handling
  useEffect(() => {
    if (!isAuthLoading && userId) {
      // Define a function to safely load user data
      const loadUserData = async () => {
        try {
          // Always try to load completions from SWR, even if it might fail
          await importFromSWR(userId, new Date()).catch(e => {
            console.warn('Failed to import completions from SWR:', e);
            // Continue anyway - this is recoverable
          });
          
          // Import settings if available, with fallbacks
          if (userProfile?.settings) {
            importSettings(userProfile.settings);
          } else if (globalSettings) {
            // Use stored settings
            importSettings(globalSettings);
          } else {
            // If no settings available, set defaults
            importSettings({ calories: 2000, protein: 100, carbs: 250, fat: 65 });
          }
        } catch (error) {
          console.error('Error initializing profile data:', error);
          // Don't throw - we want the UI to continue loading
        }
      };
      
      // Call our loading function
      loadUserData();
      
      // Update next meal in 10 seconds and every minute after
      const updateInterval = setInterval(() => {
        if (mealPlan && mealPlan.length > 0) {
          try {
            updateNextMeal(mealPlan);
          } catch (error) {
            console.error('Error updating next meal:', error);
            // Don't throw - keep the interval running
          }
        }
      }, 60000);
      
      return () => clearInterval(updateInterval);
    }
  }, [userId, isAuthLoading, userProfile]);
  
  // Load meal plan when user plans data is available
  useEffect(() => {
    if (userPlans && Array.isArray(userPlans) && userPlans.length > 0) {
      loadUserMealPlan(userPlans);
    }
  }, [userPlans]);
  
  // Update completions and calorie data when completions change
  useEffect(() => {
    if (completionsData && mealPlan && mealPlan.length > 0) {
      // Calculate calories based on meal plan and completions
      calculateFromMeals(mealPlan, completionsData);
    }
  }, [completionsData, mealPlan]);
  
  // Update saved meals when data is loaded
  useEffect(() => {
    if (savedMealsData && Array.isArray(savedMealsData)) {
      // Group by meal type
      const mealsByType = savedMealsData.reduce((acc, meal) => {
        const type = meal.type || 'other';
        if (!acc[type]) acc[type] = [];
        acc[type].push(meal);
        return acc;
      }, {});
      
      setSavedMeals(mealsByType);
    }
  }, [savedMealsData]);
  
  // Scroll to today in the timeline
  const scrollToToday = useCallback(() => {
    if (!timelineRef.current) return;
    
    const todayElement = timelineRef.current.querySelector('[data-today="true"]');
    if (!todayElement) return;
    
    try {
      todayElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    } catch (err) {
      console.error("Error scrolling to today:", err);
    }
  }, [timelineRef]);
  
  // Scroll to today when component mounts
  useEffect(() => {
    const scrollTimeout = setTimeout(scrollToToday, 300);
    return () => clearTimeout(scrollTimeout);
  }, [scrollToToday]);
  
  // Load user meal plan
  const loadUserMealPlan = (plans) => {
    if (!plans || !Array.isArray(plans) || plans.length === 0) return;
    
    // Find the most recent plan
    const sortedPlans = [...plans].sort((a, b) => 
      new Date(b.updated_at) - new Date(a.updated_at)
    );
    
    const latestPlan = sortedPlans[0];
    if (!latestPlan) return;
    
    // Set active plan ID
    setActivePlanId(latestPlan.id);
    
    // Default meal types and times
    const mealTypeToTime = {
      breakfast: '8:00 AM',
      lunch: '12:30 PM',
      snack: '3:30 PM',
      dinner: '7:00 PM'
    };
    
    // Create a template for the meal plan
    const mealPlanTemplate = [
      { type: 'breakfast', time: mealTypeToTime.breakfast },
      { type: 'lunch', time: mealTypeToTime.lunch },
      { type: 'snack', time: mealTypeToTime.snack },
      { type: 'dinner', time: mealTypeToTime.dinner }
    ];
    
    // Today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Find today's meals
    const todaysMeals = latestPlan.meals
      ? latestPlan.meals.filter(meal => meal.date === today)
      : [];
    
    // Create profile meals by combining template with real data
    const profileMeals = mealPlanTemplate.map(template => {
      // Find matching meal from the plan
      const mealData = todaysMeals.find(m => m.mealType === template.type);
      
      if (!mealData) {
        // Return empty template
        return {
          ...template,
          name: '',
          title: '',
          nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
          image: '',
          imageUrl: '',
          id: null,
          completed: false
        };
      }
      
      // Get meal details from the plan - ensure we have a valid meal object
      const meal = mealData.meal ? { ...mealData.meal } : {};
      
      // Safely extract and normalize data with fallbacks
      return {
        ...template,
        name: meal.title || meal.name || '',
        title: meal.title || meal.name || '',
        nutrition: meal.nutrition ? { ...meal.nutrition } : { calories: 0, protein: 0, carbs: 0, fat: 0 },
        image: meal.imageUrl || meal.image || null, // Use null instead of empty string for image properties
        imageUrl: meal.imageUrl || meal.image || null,
        id: mealData.mealId || (meal.id ? meal.id : null),
        completed: completionsData?.[template.type] === true || false
      };
    });
    
    // Update the profile meals
    setProfileMeals(profileMeals);
    
    // Update the next meal card
    updateNextMeal(profileMeals);
  };
  
  // Update the next meal card
  const updateNextMeal = (meals) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Convert meal times to minutes
    const mealsWithMinutes = meals.map(meal => {
      const timeStr = meal.time || '12:00 PM';
      const [time, modifier] = timeStr.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      let totalMinutes = hours * 60 + (minutes || 0);
      
      if (modifier === 'PM' && hours < 12) totalMinutes += 12 * 60;
      if (modifier === 'AM' && hours === 12) totalMinutes = minutes || 0;
      
      return { ...meal, minutesOfDay: totalMinutes };
    });
    
    // Find the next meal that hasn't been completed
    let nextMealIndex = -1;
    mealsWithMinutes.forEach((meal, index) => {
      // Skip if already completed
      if (completionsData?.[meal.type]) return;
      
      // If this meal is later today and closer than current next meal
      if (meal.minutesOfDay > currentMinutes && 
          (nextMealIndex === -1 || meal.minutesOfDay < mealsWithMinutes[nextMealIndex].minutesOfDay)) {
        nextMealIndex = index;
      }
    });
    
    // If no upcoming meal found, use the first incomplete meal
    if (nextMealIndex === -1) {
      nextMealIndex = mealsWithMinutes.findIndex(meal => !completionsData?.[meal.type]);
    }
    
    // If no incomplete meal, use the first meal
    if (nextMealIndex === -1) nextMealIndex = 0;
    
    // Update the next meal
    if (nextMealIndex >= 0 && nextMealIndex < meals.length) {
      updateNextMealCard(meals[nextMealIndex]);
    }
  };
  
  // Handle date change
  const handleDateChange = async (date) => {
    setSelectedDate(date);
    
    // Format date for API
    const dateString = date.toISOString().split('T')[0];
    
    // Update completions using SWR's standard patterns
    if (userId) {
      try {
        // Construct the key for the selected date
        const completionsKey = `/user-profile/meal-completion/${userId}/${dateString}`;
        
        // Use mutate to force revalidation (reload data from API)
        await mutate(completionsKey);
        
        // Import the new completions into our service
        importFromSWR(userId, date);
      } catch (error) {
        console.error('Error loading completions for date:', error);
      }
    }
  };
  
  // Handle just ate button click
  const handleJustAte = async () => {
    if (!nextMeal || !nextMeal.type) return;
    
    await handleToggleMealCompletion(nextMeal.type);
  };
  
  // Toggle meal completion status using SWR pattern
  const handleToggleMealCompletion = async (mealType) => {
    if (!userId) return;
    
    // Toggle in our service
    const newStatus = toggleCompletion(mealType, selectedDate);
    
    // Calculate calories immediately with updated completions
    const updatedCompletions = {
      ...completionsData,
      [mealType]: newStatus
    };
    
    // Update calorie calculations immediately
    calculateFromMeals(mealPlan, updatedCompletions);
    
    // Get the completions key for SWR
    const dateString = selectedDate.toISOString().split('T')[0];
    const completionsKey = `/user-profile/meal-completion/${userId}/${dateString}`;
    
    // Use SWR's optimistic update pattern
    toast.promise(
      mutate(
        completionsKey,
        async (currentData) => {
          // Optimistic data
          const optimisticData = {
            ...(currentData || {}),
            [mealType]: newStatus
          };
          
          // Perform the backend sync
          await syncWithBackend(userId, mealType, newStatus, selectedDate);
          
          // Return the updated data
          return optimisticData;
        },
        {
          optimisticData: (currentData) => ({
            ...(currentData || {}),
            [mealType]: newStatus
          }),
          revalidate: false // We'll handle revalidation in syncWithBackend
        }
      ),
      {
        loading: 'Saving...',
        success: 'Meal status updated',
        error: 'Failed to update meal status'
      }
    );
    
    // Also update the meal plan if it's today
    if (dateString === new Date().toISOString().split('T')[0]) {
      // Update next meal after completion state changes
      updateNextMeal(mealPlan);
    }
  };
  
  // Handle adding a meal
  const handleAddMeal = (mealType) => {
    // For simplicity, just navigate to saved meals section 
    // and filter for the selected meal type
    setActiveSection('saved');
    // TODO: Implement selecting a meal type for the saved meals view
  };
  
  // Handle removing a meal using SWR pattern
  const handleRemoveMeal = async (mealType) => {
    if (!userId || !activePlanId) return;
    
    // Find the meal index
    const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
    if (mealIndex === -1) return;
    
    // Create updated meal plan
    const updatedMealPlan = [...mealPlan];
    
    // Clear meal data but keep the structure
    updatedMealPlan[mealIndex] = {
      ...updatedMealPlan[mealIndex],
      name: '',
      title: '',
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      image: '',
      imageUrl: '',
      id: null,
      completed: false
    };
    
    // Update UI immediately
    setProfileMeals(updatedMealPlan);
    
    // Recalculate calories 
    calculateFromMeals(updatedMealPlan, completionsData);
    
    // Update nextMeal
    updateNextMeal(updatedMealPlan);
    
    // Prepare API payload
    const today = new Date().toISOString().split('T')[0];
    const payload = {
      planId: activePlanId,
      meals: updatedMealPlan
        .filter(meal => meal.id) // Only include meals with IDs
        .map(meal => ({
          date: today,
          mealType: meal.type,
          mealId: meal.id
        }))
    };
    
    // Use SWR's mutation pattern
    toast.promise(
      mutate(
        userPlansKey,
        async () => {
          try {
            // Use the API mutation
            await apiMutation.put('/api/user-plans/update', payload);
            
            // Return the updated data that should be in the SWR cache
            // Note: This is a simplification; in a real app, we might need to transform the data
            return userPlans;
          } catch (error) {
            console.error('Error removing meal:', error);
            throw error;
          }
        },
        {
          revalidate: true, // Always revalidate after mutation
          populateCache: true, // Update the cache with the returned data
          rollbackOnError: true // Revert on error
        }
      ),
      {
        loading: 'Removing meal...',
        success: 'Meal removed',
        error: 'Failed to remove meal'
      }
    );
  };
  
  // Handle selection of a saved meal using SWR pattern
  const handleSelectSavedMeal = async (meal) => {
    if (!userId || !activePlanId || !meal) return;
    
    setIsLoadingSavedMeals(true);
    
    try {
      // Get the current meal type (can be enhanced for better UX)
      const mealType = 'breakfast'; // This is a simplification - should come from UI selection
      
      // Find meal index
      const mealIndex = mealPlan.findIndex(m => m.type === mealType);
      if (mealIndex === -1) return;
      
      // Create updated meal plan
      const updatedMealPlan = [...mealPlan];
      
      // Update the meal
      updatedMealPlan[mealIndex] = {
        ...updatedMealPlan[mealIndex],
        name: meal.title || meal.name || '',
        title: meal.title || meal.name || '',
        nutrition: meal.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        image: meal.imageUrl || meal.image || '',
        imageUrl: meal.imageUrl || meal.image || '',
        id: meal.id
      };
      
      // Update UI immediately
      setProfileMeals(updatedMealPlan);
      
      // Recalculate calories
      calculateFromMeals(updatedMealPlan, completionsData);
      
      // Update nextMeal
      updateNextMeal(updatedMealPlan);
      
      // Prepare API payload
      const today = new Date().toISOString().split('T')[0];
      const payload = {
        planId: activePlanId,
        meals: updatedMealPlan
          .filter(m => m.id) // Only include meals with IDs
          .map(m => ({
            date: today,
            mealType: m.type,
            mealId: m.id
          }))
      };
      
      // Use SWR's mutation pattern
      await mutate(
        userPlansKey,
        async () => {
          // Send the update to the API
          await apiMutation.put('/api/user-plans/update', payload);
          
          // Return the expected updated data (simplified)
          return userPlans;
        },
        {
          revalidate: true,
          populateCache: true,
          rollbackOnError: true
        }
      );
      
      // Show success message
      toast.success('Meal added to plan');
      
      // Switch back to timeline view
      setActiveSection('timeline');
    } catch (error) {
      console.error('Error adding meal:', error);
      toast.error('Failed to add meal');
    } finally {
      setIsLoadingSavedMeals(false);
    }
  };
  
  // Create new meal plans
  const handleCreateNewMeals = () => {
    router.push('/meals');
  };
  
  // Go to meal planner
  const handleViewMealPlanner = () => {
    router.push('/planner');
  };
  
  // Check if UI is ready
  const isUiReady = !isAuthLoading && isAuthenticated && mealPlan && mealPlan.length > 0;
  
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Profile header */}
      <ProfileHeaderSection
        user={user}
        loading={isAuthLoading}
        nextMeal={nextMeal}
        mealTime={nextMeal?.time || ""}
        onDateChange={handleDateChange}
        selectedDate={selectedDate}
        timelineRef={timelineRef}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        handleViewMealPlanner={handleViewMealPlanner}
      />
      
      {isUiReady ? (
        <>
          {/* Next meal card */}
          <section className="mb-6 bg-white p-4">
            <NextMealCard 
              meal={nextMeal} 
              time={formatTime(nextMeal?.time)} 
              onJustAte={handleJustAte} 
              handleCreateNewMeals={handleCreateNewMeals} 
            />
            <div className="mt-4">
              <CalorieProgressBar 
                fallbackConsumed={0}
                fallbackTarget={globalSettings?.calories || 2000}
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
              />
            </section>
          ) : (
            <section className="mb-6 bg-white p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold">Saved Meals</h2>
                <button
                  onClick={() => setActiveSection('timeline')}
                  className="flex items-center text-teal-600 hover:text-teal-800"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  <span>Back to Timeline</span>
                </button>
              </div>
              <SavedMeals 
                meals={savedMeals}
                isLoading={isLoadingSavedMeals}
                onSelectMeal={handleSelectSavedMeal}
              />
            </section>
          )}
        </>
      ) : (
        // Loading or no auth state
        <div className="p-8 text-center">
          {isAuthLoading ? (
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto mb-4"></div>
              <div className="h-32 bg-gray-200 rounded mb-4"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          ) : (
            <div>
              <h2 className="text-lg mb-4">Log in to see your meal plan</h2>
              <button
                onClick={() => router.push('/auth/login?returnTo=/profile')}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
              >
                Log In
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}