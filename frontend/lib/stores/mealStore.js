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
      isHydrated: typeof window !== 'undefined', // Track if we're in browser (hydrated)
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
        
        // Mark the store as hydrated (client-side only)
        markHydrated: () => {
          const state = get();
          if (state.isHydrated) return; // Already hydrated
          
          console.log(`[MealStore] Marking store as hydrated`);
          set({ isHydrated: true });
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
        // Generate a unique job ID for this generation request
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        get().actions.logAction('startMealGeneration', {
          ...preferences,
          jobId: jobId
        });
        
        // First reset any old state
        const oldState = get();
        if (oldState.currentMealPlanId || oldState.mealGenerationComplete) {
          console.log(`[MealStore] Clearing previous meal plan state before starting new generation`);
          get().resetMealGeneration();
        }
        
        // Explicitly clear any existing meal plan association
        localStorage.removeItem('currentMealPlanId');
        
        // Reset state and start generation
        set({
          isGenerating: true,
          mealGenerationComplete: false,
          hasViewedGeneratedMeals: false,
          // Store preferences if needed
          ...(preferences ? { preferences } : {}),
          // Store the current job ID so we can verify when notifications come in
          currentJobId: jobId,
          lastGenerationTimestamp: new Date().toISOString()
        });
        
        // Store the job ID in localStorage for recovery
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentJobId', jobId);
          localStorage.setItem('lastGenerationTimestamp', new Date().toISOString());
        }
        
        // Sync with window globals
        get().actions.syncWithWindow();
        
        return jobId;
      },
      
      // Handle a successful meal plan fetch
      handleMealPlanSuccess: (mealPlan, mealPlanId) => {
        const state = get();
        const currentTimestamp = new Date().toISOString();
        
        get().actions.logAction('handleMealPlanSuccess', { 
          mealPlanId, 
          mealCount: mealPlan?.length,
          currentJobId: state.currentJobId,
          isGenerating: state.isGenerating,
          timestamp: currentTimestamp
        });
        
        // Only process this meal plan if we're actively generating meals or it matches our job ID
        if (!state.isGenerating && state.currentMealPlanId && state.currentMealPlanId !== mealPlanId) {
          console.log(`[MealStore] Ignoring incoming meal plan ${mealPlanId} because we're not generating and it doesn't match current meal plan ID ${state.currentMealPlanId}`);
          return false;
        }
        
        // Update state with the new meal plan
        set({
          mealPlan,
          currentMealPlanId: mealPlanId,
          isGenerating: false,
          mealGenerationComplete: true,
          hasViewedGeneratedMeals: false,
          lastSuccessTimestamp: currentTimestamp,
          notificationSource: 'direct_api'
        });
        
        // Persist to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentMealPlanId', mealPlanId);
          localStorage.setItem('lastSuccessTimestamp', currentTimestamp);
          localStorage.setItem('mealGenerationComplete', 'true');
        }
        
        // Sync with window globals
        get().actions.syncWithWindow();
        
        // Trigger an event for components that might be listening
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mealPlanReady', {
            detail: {
              mealPlanId,
              jobId: state.currentJobId,
              timestamp: currentTimestamp,
              source: 'zustand'
            }
          }));
        }
        
        return true;
      },
      
      // Process notification of completed meal plan
      handleMealPlanNotification: (notification) => {
        const state = get();
        const currentTimestamp = new Date().toISOString();
        
        get().actions.logAction('handleMealPlanNotification', {
          ...notification,
          currentState: {
            isGenerating: state.isGenerating,
            currentMealPlanId: state.currentMealPlanId,
            currentJobId: state.currentJobId,
            timestamp: currentTimestamp
          }
        });
        
        if (!notification || !notification.meal_plan_id) {
          console.error('[MealStore] Invalid notification received');
          return false;
        }
        
        // Check if we already have a meal plan ready - avoid overwriting with an old notification
        if (state.mealGenerationComplete && 
            state.currentMealPlanId && 
            state.currentMealPlanId !== notification.meal_plan_id) {
          
          // We need to check timing - only accept newer notifications
          const lastGenerationTime = state.lastGenerationTimestamp ? new Date(state.lastGenerationTimestamp).getTime() : 0;
          const notificationTime = notification.timestamp ? new Date(notification.timestamp).getTime() : Date.now();
          
          // If this is an old notification (from before our last generation started), ignore it
          if (lastGenerationTime > notificationTime) {
            console.log(`[MealStore] Ignoring outdated notification. Current meal plan: ${state.currentMealPlanId}, notification for: ${notification.meal_plan_id}`);
            return false;
          }
        }
        
        // Update state with notification data
        set({
          currentMealPlanId: notification.meal_plan_id,
          isGenerating: false,
          mealGenerationComplete: true,
          hasViewedGeneratedMeals: false,
          lastNotificationTimestamp: currentTimestamp,
          notificationSource: 'webhook'
        });
        
        // Persist to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentMealPlanId', notification.meal_plan_id);
          localStorage.setItem('lastNotificationTimestamp', currentTimestamp);
          localStorage.setItem('mealGenerationComplete', 'true');
        }
        
        // Sync with window globals
        get().actions.syncWithWindow();
        
        // Trigger an event for compatibility
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mealPlanReady', {
            detail: {
              mealPlanId: notification.meal_plan_id,
              userId: notification.user_id,
              jobId: state.currentJobId,
              timestamp: currentTimestamp,
              source: 'notification'
            }
          }));
        }
        
        return true;
      },
      
      // Begin tracking a background task
      startTaskChecking: (taskId) => {
        const state = get();
        
        get().actions.logAction('startTaskChecking', {
          taskId,
          currentJobId: state.currentJobId
        });
        
        // Generate a unique task tracking ID that combines job and task
        const trackingId = state.currentJobId 
          ? `${state.currentJobId}-${taskId}` 
          : taskId;
        
        set({
          isGenerating: true,
          mealGenerationComplete: false,
          hasViewedGeneratedMeals: false,
          currentMealPlanId: taskId,
          backgroundTaskId: taskId,
          taskTrackingId: trackingId,
          lastTaskStartTimestamp: new Date().toISOString()
        });
        
        // Update window globals
        if (typeof window !== 'undefined') {
          window.mealLoading = true;
          window.mealPlanReady = false;
          localStorage.setItem('currentMealPlanId', taskId);
          localStorage.setItem('taskTrackingId', trackingId);
          localStorage.setItem('lastTaskStartTimestamp', new Date().toISOString());
        }
        
        return trackingId;
      },
      
      // Reset all meal generation state
      resetMealGeneration: () => {
        get().actions.logAction('resetMealGeneration');
        
        // Create a local timestamp when this reset happened to help track job association
        const resetTimestamp = new Date().toISOString();
        
        set({
          isGenerating: false,
          mealGenerationComplete: false,
          currentMealPlanId: null,
          hasViewedGeneratedMeals: false,
          backgroundTaskId: null,
          mealPlan: [],
          lastResetTimestamp: resetTimestamp
        });
        
        // Clean up localStorage and window globals
        if (typeof window !== 'undefined') {
          window.mealLoading = false;
          window.mealPlanReady = false;
          localStorage.removeItem('currentMealPlanId');
          localStorage.removeItem('mealGenerationState');
          
          // Store the reset timestamp in localStorage for recovery on page refresh
          localStorage.setItem('lastMealResetTimestamp', resetTimestamp);
        }
      },
      
      // Handle button click to view generated meals
      viewGeneratedMeals: () => {
        const state = get();
        
        // Guard against server-side execution or non-hydrated state
        if (!state.isHydrated) {
          console.log('[MealStore] Logging viewGeneratedMeals call - not hydrated yet');
          // Continue even if not hydrated - don't block navigation
        }
        
        // Log for debugging but don't block navigation if generation is not complete
        if (!state.mealGenerationComplete) {
          console.log('[MealStore] Warning: Viewing meals but generation not complete');
          // Continue anyway - don't block navigation
        }
        
        get().actions.logAction('viewGeneratedMeals', { 
          mealPlanId: state.currentMealPlanId,
          isHydrated: state.isHydrated,
          isComplete: state.mealGenerationComplete
        });
        
        // Just update the status for logging, but don't set transition flag
        set({
          status: {
            lastUpdated: new Date().toISOString(),
            lastAction: 'viewGeneratedMeals',
            sequence: state.status.sequence + 1
          }
        });
        
        // Don't mark as viewed yet - that happens after navigation completes
        // Update window globals for compatibility
        if (typeof window !== 'undefined') {
          window.mealLoading = false;
          window.mealPlanReady = true;
          window.mealPlan = state.mealPlan;
        }
        
        // Always return true to allow navigation to proceed
        return true;
      },
      
      // Mark meals as viewed (called after navigation)
      markMealsAsViewed: () => {
        const state = get();
        
        // Log hydration state but proceed anyway
        if (!state.isHydrated) {
          console.log('[MealStore] Warning: markMealsAsViewed called before hydration');
          // Proceed anyway to avoid blocking state transitions
        }
        
        get().actions.logAction('markMealsAsViewed');
        
        // Update viewed state
        set({
          hasViewedGeneratedMeals: true,
          status: {
            lastUpdated: new Date().toISOString(),
            lastAction: 'markMealsAsViewed',
            sequence: state.status.sequence + 1
          }
        });
        
        // Also update localStorage directly for redundancy
        if (typeof window !== 'undefined') {
          localStorage.setItem('hasViewedGeneratedMeals', 'true');
        }
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
        hasViewedGeneratedMeals: state.hasViewedGeneratedMeals,
        isHydrated: true, // Always persist as true to avoid hydration mismatches
        backgroundTaskId: state.backgroundTaskId,
        // New fields for job tracking
        currentJobId: state.currentJobId,
        taskTrackingId: state.taskTrackingId,
        lastResetTimestamp: state.lastResetTimestamp,
        lastGenerationTimestamp: state.lastGenerationTimestamp,
        lastTaskStartTimestamp: state.lastTaskStartTimestamp,
        lastSuccessTimestamp: state.lastSuccessTimestamp,
        lastNotificationTimestamp: state.lastNotificationTimestamp,
        notificationSource: state.notificationSource
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
};

// Helper functions to migrate from direct localStorage access to Zustand
// These maintain backward compatibility with existing code
export const mealStoreHelpers = {
  // Get meal state from localStorage - always prefer Zustand, fallback to localStorage
  getMealState: (key) => {
    // First try Zustand
    const state = useMealStore.getState();
    
    switch (key) {
      case 'isGenerating':
        return state.isGenerating;
      case 'mealGenerationComplete':
        return state.mealGenerationComplete;
      case 'currentMealPlanId':
        return state.currentMealPlanId;
      case 'hasViewedGeneratedMeals':
        return state.hasViewedGeneratedMeals;
      case 'mealPlan':
        return state.mealPlan;
      case 'displayedMealType':
        return state.displayedMealType;
      case 'mealType':
        return state.mealType;
      case 'backgroundTaskId':
        return state.backgroundTaskId;
      case 'mealGenerationState':
        // Return a serialized version of the relevant state for compatibility
        return JSON.stringify({
          isGenerating: state.isGenerating,
          mealGenerationComplete: state.mealGenerationComplete,
          currentMealPlanId: state.currentMealPlanId,
          hasViewedGeneratedMeals: state.hasViewedGeneratedMeals,
          backgroundTaskId: state.backgroundTaskId
        });
      default:
        // Fall back to localStorage for any other keys
        if (typeof window !== 'undefined') {
          return localStorage.getItem(key);
        }
        return null;
    }
  },
  
  // Set meal state - update both Zustand and localStorage for backward compatibility
  setMealState: (key, value) => {
    // Update Zustand
    const state = useMealStore.getState();
    
    switch (key) {
      case 'isGenerating':
        state.setIsGenerating(value);
        break;
      case 'mealGenerationComplete':
        state.setMealGenerationComplete(value);
        break;
      case 'currentMealPlanId':
        state.setCurrentMealPlanId(value);
        break;
      case 'hasViewedGeneratedMeals':
        state.setHasViewedGeneratedMeals(value);
        break;
      case 'mealPlan':
        state.setMealPlan(value);
        break;
      case 'displayedMealType':
        state.setDisplayedMealType(value);
        break;
      case 'mealType':
        state.setMealType(value);
        break;
      case 'backgroundTaskId':
        state.setBackgroundTaskId(value);
        break;
      case 'mealGenerationState':
        // Parse and update the relevant state
        try {
          const parsedState = JSON.parse(value);
          if (parsedState.isGenerating !== undefined) state.setIsGenerating(parsedState.isGenerating);
          if (parsedState.mealGenerationComplete !== undefined) state.setMealGenerationComplete(parsedState.mealGenerationComplete);
          if (parsedState.currentMealPlanId !== undefined) state.setCurrentMealPlanId(parsedState.currentMealPlanId);
          if (parsedState.hasViewedGeneratedMeals !== undefined) state.setHasViewedGeneratedMeals(parsedState.hasViewedGeneratedMeals);
          if (parsedState.backgroundTaskId !== undefined) state.setBackgroundTaskId(parsedState.backgroundTaskId);
        } catch (e) {
          console.error('Error parsing mealGenerationState:', e);
        }
        break;
      default:
        // For any other keys, just use localStorage directly
        if (typeof window !== 'undefined') {
          if (value === null) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, value);
          }
        }
    }
    
    // Also update localStorage for backward compatibility
    if (typeof window !== 'undefined') {
      // Update the specific key
      if (key !== 'mealGenerationState') {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          // Special handling for boolean values
          if (typeof value === 'boolean') {
            localStorage.setItem(key, value.toString());
          } else {
            localStorage.setItem(key, value);
          }
        }
      }
    }
  },
  
  // Remove meal state
  removeMealState: (key) => {
    // Update Zustand
    const state = useMealStore.getState();
    
    switch (key) {
      case 'isGenerating':
        state.setIsGenerating(false);
        break;
      case 'mealGenerationComplete':
        state.setMealGenerationComplete(false);
        break;
      case 'currentMealPlanId':
        state.setCurrentMealPlanId(null);
        break;
      case 'hasViewedGeneratedMeals':
        state.setHasViewedGeneratedMeals(false);
        break;
      case 'mealPlan':
        state.setMealPlan([]);
        break;
      case 'mealGenerationState':
        // Reset all state
        state.resetMealGeneration();
        break;
      default:
        // For any other keys, just use localStorage directly
        if (typeof window !== 'undefined') {
          localStorage.removeItem(key);
        }
    }
    
    // Also update localStorage for backward compatibility
    if (typeof window !== 'undefined') {
      localStorage.removeItem(key);
    }
  }
};