// Zustand store for meal generation state management
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Create the meal store using Zustand best practices
export const useMealStore = create(
  persist(
    (set, get) => ({
      // Core state
      isGenerating: false,
      mealGenerationComplete: false,
      currentMealPlanId: null,
      hasViewedGeneratedMeals: false,
      mealPlan: [],
      displayedMealType: '',
      mealType: 'Breakfast',
      backgroundTaskId: null,
      
      // Status tracking for debugging
      status: {
        lastUpdated: new Date().toISOString(),
        lastAction: 'init',
        sequence: 0
      },
      
      // Actions with middleware pattern
      actions: {
        // Record an action for debugging (middleware pattern)
        logAction: (actionName, data) => {
          const state = get();
          const sequence = state.status.sequence + 1;
          console.log(`[MealStore] ${actionName}${data ? `: ${JSON.stringify(data)}` : ''} (seq: ${sequence})`);
          
          set({ 
            status: {
              lastUpdated: new Date().toISOString(),
              lastAction: actionName,
              sequence
            }
          });
        },
        
        // Sync with window globals (middleware pattern)
        syncWithWindow: () => {
          const state = get();
          if (typeof window === 'undefined') return;
          
          window.mealLoading = state.isGenerating;
          window.mealPlanReady = state.mealGenerationComplete;
          window.mealPlan = state.mealPlan;
          
          if (state.currentMealPlanId) {
            localStorage.setItem('currentMealPlanId', state.currentMealPlanId);
          }
        }
      },
      
      // ------ Core actions ------
      
      // Update generation status
      setIsGenerating: (value) => {
        get().actions.logAction('setIsGenerating', value);
        
        set({ isGenerating: value });
        
        // Sync with window globals
        if (typeof window !== 'undefined') {
          window.mealLoading = value;
        }
      },
      
      // Update meal plan completion status
      setMealGenerationComplete: (value) => {
        get().actions.logAction('setMealGenerationComplete', value);
        
        set({ mealGenerationComplete: value });
        
        // Sync with window globals
        if (typeof window !== 'undefined') {
          window.mealPlanReady = value;
        }
      },
      
      // Set current meal plan ID
      setCurrentMealPlanId: (id) => {
        get().actions.logAction('setCurrentMealPlanId', id);
        
        set({ currentMealPlanId: id });
        
        // Store in localStorage for compatibility 
        if (typeof window !== 'undefined' && id) {
          localStorage.setItem('currentMealPlanId', id);
        }
      },
      
      // Set meal plan data
      setMealPlan: (plan) => {
        get().actions.logAction('setMealPlan', { length: plan?.length });
        
        set({ mealPlan: plan });
        
        // Update window globals
        if (typeof window !== 'undefined') {
          window.mealPlan = plan;
        }
      },
      
      // Update meal view status
      setHasViewedGeneratedMeals: (value) => {
        get().actions.logAction('setHasViewedGeneratedMeals', value);
        set({ hasViewedGeneratedMeals: value });
      },
      
      // Update meal type and displayed type
      setMealType: (type) => {
        get().actions.logAction('setMealType', type);
        set({ mealType: type, displayedMealType: type });
      },
      
      // Update just the displayed meal type
      setDisplayedMealType: (type) => {
        get().actions.logAction('setDisplayedMealType', type);
        set({ displayedMealType: type });
      },
      
      // Set background task ID
      setBackgroundTaskId: (id) => {
        get().actions.logAction('setBackgroundTaskId', id);
        set({ backgroundTaskId: id });
      },
      
      // ------ Composite actions ------
      
      // Start meal plan generation process
      startMealGeneration: (preferences = {}) => {
        get().actions.logAction('startMealGeneration', preferences);
        
        // Reset state and start generation
        set({
          isGenerating: true,
          mealGenerationComplete: false,
          hasViewedGeneratedMeals: false,
          // Store preferences if needed
          ...(preferences ? { preferences } : {})
        });
        
        // Sync with window globals
        get().actions.syncWithWindow();
      },
      
      // Handle a successful meal plan fetch
      handleMealPlanSuccess: (mealPlan, mealPlanId) => {
        get().actions.logAction('handleMealPlanSuccess', { mealPlanId, mealCount: mealPlan?.length });
        
        // Update state with the new meal plan
        set({
          mealPlan,
          currentMealPlanId: mealPlanId,
          isGenerating: false,
          mealGenerationComplete: true,
          hasViewedGeneratedMeals: false
        });
        
        // Sync with window globals
        get().actions.syncWithWindow();
        
        // Trigger an event for components that might be listening
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mealPlanReady', {
            detail: {
              mealPlanId,
              timestamp: new Date().toISOString(),
              source: 'zustand'
            }
          }));
        }
        
        return true;
      },
      
      // Process notification of completed meal plan
      handleMealPlanNotification: (notification) => {
        get().actions.logAction('handleMealPlanNotification', notification);
        
        if (!notification || !notification.meal_plan_id) {
          console.error('[MealStore] Invalid notification received');
          return false;
        }
        
        // Update state with notification data
        set({
          currentMealPlanId: notification.meal_plan_id,
          isGenerating: false,
          mealGenerationComplete: true,
          hasViewedGeneratedMeals: false
        });
        
        // Sync with window globals
        get().actions.syncWithWindow();
        
        // Trigger an event for compatibility
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mealPlanReady', {
            detail: {
              mealPlanId: notification.meal_plan_id,
              userId: notification.user_id,
              timestamp: new Date().toISOString(),
              source: 'notification'
            }
          }));
        }
        
        return true;
      },
      
      // Begin tracking a background task
      startTaskChecking: (taskId) => {
        get().actions.logAction('startTaskChecking', taskId);
        
        set({
          isGenerating: true,
          mealGenerationComplete: false,
          hasViewedGeneratedMeals: false,
          currentMealPlanId: taskId,
          backgroundTaskId: taskId
        });
        
        // Update window globals
        if (typeof window !== 'undefined') {
          window.mealLoading = true;
          window.mealPlanReady = false;
          localStorage.setItem('currentMealPlanId', taskId);
        }
      },
      
      // Reset all meal generation state
      resetMealGeneration: () => {
        get().actions.logAction('resetMealGeneration');
        
        set({
          isGenerating: false,
          mealGenerationComplete: false,
          currentMealPlanId: null,
          hasViewedGeneratedMeals: false,
          backgroundTaskId: null,
          mealPlan: []
        });
        
        // Clean up localStorage and window globals
        if (typeof window !== 'undefined') {
          window.mealLoading = false;
          window.mealPlanReady = false;
          localStorage.removeItem('currentMealPlanId');
          localStorage.removeItem('mealGenerationState');
        }
      },
      
      // Handle button click to view generated meals
      viewGeneratedMeals: () => {
        const state = get();
        
        // Only proceed if meal generation is complete
        if (!state.mealGenerationComplete) {
          console.log('[MealStore] Cannot view meals - generation not complete');
          return false;
        }
        
        get().actions.logAction('viewGeneratedMeals', { mealPlanId: state.currentMealPlanId });
        
        // Don't mark as viewed yet - that happens after navigation completes
        // Update window globals for compatibility
        if (typeof window !== 'undefined') {
          window.mealLoading = false;
          window.mealPlanReady = true;
          window.mealPlan = state.mealPlan;
        }
        
        return true;
      },
      
      // Mark meals as viewed (called after navigation)
      markMealsAsViewed: () => {
        get().actions.logAction('markMealsAsViewed');
        set({ hasViewedGeneratedMeals: true });
      }
    }),
    {
      name: 'grovli-meals',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist essential data
        mealGenerationComplete: state.mealGenerationComplete,
        currentMealPlanId: state.currentMealPlanId,
        mealPlan: state.mealPlan,
        displayedMealType: state.displayedMealType,
        mealType: state.mealType,
        backgroundTaskId: state.backgroundTaskId
      }),
      // Add version control for potential schema migrations
      version: 1
    }
  )
)

// Export a selector hook for common state combinations
export const useMealStatus = () => {
  const isGenerating = useMealStore(state => state.isGenerating);
  const isComplete = useMealStore(state => state.mealGenerationComplete);
  const hasViewed = useMealStore(state => state.hasViewedGeneratedMeals);
  
  return {
    isGenerating,
    isComplete,
    hasViewed,
    isReadyToView: isComplete && !hasViewed
  };
}