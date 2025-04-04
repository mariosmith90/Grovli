"use client";

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useUser } from "@auth0/nextjs-auth0";

import { useProfileStore } from '../stores/profileStore';
import { 
  loadMealCompletions, 
  saveMealCompletion, 
  fetchUserMealPlans,
  loadDataForDate,
  fetchSavedMeals,
  loadUserSettings
} from '../services/profileService';

/**
 * Hook that provides all the profile actions needed in components
 * A clean way to access Zustand state and actions while adding API integration
 */
export function useProfileActions() {
  const router = useRouter();
  
  // Get auth state from Auth0
  const { user, isLoading: isAuthLoading } = useUser();
  
  // Get profile store state and actions
  const {
    activeSection,
    setActiveSection,
    isLoadingSavedMeals,
    setIsLoadingSavedMeals,
    selectedDate,
    setSelectedDate,
    selectedMealType,
    setSelectedMealType,
    mealPlan,
    setMealPlan,
    nextMeal,
    updateNextMealCard,
    currentMealIndex,
    setCurrentMealIndex,
    updateCalorieCount,
    toggleMealCompletion,
    markMealAsEaten,
    viewSavedMealsForType,
    updateMealTimes,
    completedMeals
  } = useProfileStore();
  
  // Load initial data on component mount
  useEffect(() => {
    // Skip if auth is still loading or no user
    if (!user?.sub || isAuthLoading) return;
    
    // Load user settings and data
    const initializeProfile = async () => {
      try {
        // Load settings from localStorage first
        useProfileStore.getState().loadSettingsFromStorage();
        
        // Then fetch user meal plans from API
        await fetchUserMealPlans(user.sub);
        
        // And load user settings from server
        await loadUserSettings(user.sub);
      } catch (err) {
        console.error("Error initializing profile:", err);
      }
    };
    
    initializeProfile();
  }, [user, isAuthLoading]);
  
  // Set up event listeners for refreshing data
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.sub) return;
    
    // Define event handlers
    const handleFocus = () => {
      if (user?.sub) {
        fetchUserMealPlans(user.sub);
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user?.sub) {
        loadMealCompletions(user.sub);
      }
    };
    
    // Add listeners
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);
  
  // Update meals based on current time periodically
  useEffect(() => {
    // Get from store directly to avoid stale closures
    const { isDataReady, mealPlan } = useProfileStore.getState();
    if (!isDataReady || !Array.isArray(mealPlan) || mealPlan.length === 0) return;
    
    // Update now
    updateMealTimes();
    
    // Set interval for periodic updates
    const intervalTime = typeof window !== 'undefined' && 
                        window.navigator.userAgent.includes('Mobile') ? 120000 : 60000;
    const intervalId = setInterval(updateMealTimes, intervalTime);
    
    return () => clearInterval(intervalId);
  }, [updateMealTimes]);
  
  // Save completions when component unmounts
  useEffect(() => {
    return () => {
      if (user?.sub) {
        // Get fresh state at unmount time
        const { completedMeals } = useProfileStore.getState();
        
        // Save each meal completion
        Object.entries(completedMeals).forEach(([mealType, completed]) => {
          saveMealCompletion(user.sub, mealType, completed).catch(console.error);
        });
      }
    };
  }, [user]);
  
  // Handle date change
  const handleDateChange = useCallback(async (date) => {
    if (!user?.sub) return;
    
    setSelectedDate(date);
    await loadDataForDate(date, user.sub);
  }, [user, setSelectedDate]);
  
  // Handle just ate action
  const handleJustAte = useCallback(() => {
    // Use the store action to mark meal as eaten
    markMealAsEaten();
    
    // Save to API
    if (user?.sub) {
      const currentMeal = mealPlan[currentMealIndex];
      if (currentMeal?.type) {
        saveMealCompletion(user.sub, currentMeal.type, true).catch(console.error);
      }
    }
  }, [user, mealPlan, currentMealIndex, markMealAsEaten]);
  
  // Handle toggle meal completion
  const handleToggleMealCompletion = useCallback(async (mealType) => {
    // Toggle in store
    const newCompleted = toggleMealCompletion(mealType);
    
    // Save to API
    if (user?.sub) {
      try {
        await saveMealCompletion(user.sub, mealType, newCompleted);
      } catch (error) {
        console.error('Failed to toggle meal completion:', error);
        toast.error('Failed to update meal completion status');
      }
    }
  }, [user, toggleMealCompletion]);
  
  // Handle removing a meal
  const handleRemoveMeal = useCallback(async (mealType) => {
    if (!user?.sub) return;
    
    try {
      console.log(`Removing meal of type: ${mealType}`);
      
      setSelectedMealType(mealType);
      setIsLoadingSavedMeals(true);
      
      // Find meal index
      const mealIndex = mealPlan.findIndex(meal => meal.type === mealType);
      if (mealIndex !== -1) {
        // Create updated meal plan
        const updatedMealPlan = [...mealPlan];
        
        // Reset meal to default
        updatedMealPlan[mealIndex] = {
          ...updatedMealPlan[mealIndex],
          name: '',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          image: '',
          id: null,
          completed: false
        };
        
        // Update state
        setMealPlan(updatedMealPlan);
        
        // Update meal times and calorie data
        updateMealTimes();
        updateCalorieCount();
      }
      
      // Switch to saved meals view
      setActiveSection('savedMeals');
      
      // Fetch saved meals for this type
      await fetchSavedMeals(mealType);
    } catch (error) {
      console.error('Error removing meal:', error);
      toast.error('Error removing meal');
    } finally {
      setIsLoadingSavedMeals(false);
    }
  }, [
    user, 
    mealPlan, 
    setSelectedMealType, 
    setIsLoadingSavedMeals, 
    setMealPlan, 
    updateMealTimes, 
    updateCalorieCount, 
    setActiveSection
  ]);
  
  // Handle adding a meal
  const handleAddMeal = useCallback(async (mealType) => {
    if (!user?.sub) return;
    
    try {
      console.log(`Adding meal of type: ${mealType}`);
      
      // Update UI state
      setSelectedMealType(mealType);
      setIsLoadingSavedMeals(true);
      setActiveSection('savedMeals');
      
      // Fetch saved meals for this type
      await fetchSavedMeals(mealType);
      
      // Check if we have any saved meals
      const { savedMeals } = useProfileStore.getState();
      if (!savedMeals[mealType] || savedMeals[mealType].length === 0) {
        toast.info(`No saved ${mealType} meals available. Create new meals to add them.`);
      }
    } catch (error) {
      console.error(`Error loading saved meals for ${mealType}:`, error);
      toast.error(`Couldn't load saved meals`);
    } finally {
      setIsLoadingSavedMeals(false);
    }
  }, [
    user, 
    setSelectedMealType, 
    setIsLoadingSavedMeals, 
    setActiveSection
  ]);
  
  // Handle selecting a saved meal
  const handleSelectSavedMeal = useCallback((meal) => {
    if (!meal) return;
    
    // Get current state
    const { selectedMealType, mealPlan, currentMealIndex } = useProfileStore.getState();
    if (!selectedMealType) return;
    
    // Find meal index
    const mealIndex = mealPlan.findIndex(m => m.type === selectedMealType);
    if (mealIndex === -1) return;
    
    // Create updated meal plan
    const updatedMealPlan = [...mealPlan];
    updatedMealPlan[mealIndex] = {
      ...updatedMealPlan[mealIndex],
      name: meal.name,
      title: meal.title || meal.name,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      image: meal.image,
      id: meal.id
    };
    
    // Update the store
    useProfileStore.setState(state => {
      state.mealPlan = updatedMealPlan;
      
      // Update next meal if this was the current meal
      if (mealIndex === currentMealIndex) {
        state.updateNextMealCard(updatedMealPlan[mealIndex]);
      }
      
      // Update calorie counts
      state.updateCalorieCount();
      
      // Return to timeline view
      state.activeSection = 'timeline';
    });
    
    // TODO: Add API call to save meal to plan
  }, []);
  
  // Handle creating new meals
  const handleCreateNewMeals = useCallback(() => {
    router.push('/meals');
  }, [router]);
  
  // Handle viewing meal planner
  const handleViewMealPlanner = useCallback(() => {
    router.push('/planner');
  }, [router]);
  
  // Return all actions and state needed by components
  return {
    // User state
    user,
    isAuthenticated: !!user,
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
    savedMeals: useProfileStore(state => state.savedMeals),
    calorieData: useProfileStore(state => state.calorieData),
    globalSettings: useProfileStore(state => state.globalSettings),
    
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
  };
}