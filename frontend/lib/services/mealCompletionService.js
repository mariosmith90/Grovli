"use client";

import { create } from 'zustand';
import { useSWRConfig } from 'swr';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useApiMutation } from '../swr-client';

// Helper function to format date as YYYY-MM-DD
export function formatDateString(date) {
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
}

// Local store for meal completion state
const useMealCompletionStore = create(
  persist(
    (set, get) => ({
      completions: {},
      pendingUpdates: {},
      
      // Actions
      setCompletions: (completions) => set({ completions }),
      
      toggleCompletion: (mealType, date) => {
        const { completions } = get();
        const dateKey = formatDateString(date);
        const key = `${dateKey}-${mealType}`;
        
        const newStatus = !(completions[key] || false);
        
        set(state => ({
          completions: {
            ...state.completions,
            [key]: newStatus
          },
          pendingUpdates: {
            ...state.pendingUpdates,
            [key]: { status: 'pending', value: newStatus, timestamp: Date.now() }
          }
        }));
        
        return newStatus;
      },
      
      // Track API status
      setPendingStatus: (key, status) => set(state => ({
        pendingUpdates: {
          ...state.pendingUpdates,
          [key]: { 
            ...state.pendingUpdates[key], 
            status,
            lastUpdated: Date.now()
          }
        }
      })),
      
      // Get completions for a specific date - improved for reliability
      getCompletionsForDate: (date) => {
        const { completions } = get();
        const dateKey = formatDateString(date);
        const result = {};
        
        // Standard meal types that should always be present
        const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
        
        // Initialize all meal types to false first
        mealTypes.forEach(type => {
          result[type] = false;
        });
        
        // Then apply any actual completion data we have
        Object.entries(completions)
          .filter(([key]) => key.startsWith(dateKey))
          .forEach(([key, value]) => {
            // Extract meal type from key (format: YYYY-MM-DD-mealtype)
            const parts = key.split('-');
            // Only use the last part as mealType in case date has hyphens
            const mealType = parts[parts.length - 1].toLowerCase();
            
            if (mealTypes.includes(mealType)) {
              result[mealType] = !!value; // Ensure boolean value
            }
          });
          
        return result;
      },
      
      // Import completions from another format - enhanced for reliability
      importCompletions: (completionsData, date) => {
        const dateKey = formatDateString(date);
        const newCompletions = { ...get().completions };
        
        // Standard meal types that should always be present
        const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
        
        // Make sure all meal types have an explicit value
        mealTypes.forEach(type => {
          const key = `${dateKey}-${type}`;
          // Default to false unless explicitly set
          newCompletions[key] = false;
        });
        
        // Then apply any provided completion data
        if (completionsData && typeof completionsData === 'object') {
          Object.entries(completionsData).forEach(([mealType, value]) => {
            // Only use recognized meal types
            if (mealTypes.includes(mealType.toLowerCase())) {
              const key = `${dateKey}-${mealType.toLowerCase()}`;
              newCompletions[key] = !!value; // Ensure boolean value
            }
          });
        }
        
        // Update the state
        set({ completions: newCompletions });
        
        // Return the processed completions for this date
        return mealTypes.reduce((result, type) => {
          result[type] = newCompletions[`${dateKey}-${type}`] || false;
          return result;
        }, {});
      },
      
      // Clear pending updates
      clearPendingUpdates: () => set({ pendingUpdates: {} })
    }),
    {
      name: 'grovli-meal-completion-store',
      storage: createJSONStorage(() => localStorage),
      // Only persist completions, not pending updates
      partialize: (state) => ({ completions: state.completions })
    }
  )
);

// Hook to use meal completion service
export function useMealCompletionService() {
  const { mutate } = useSWRConfig();
  const store = useMealCompletionStore();
  const apiMutation = useApiMutation();
  
  // Sync a single meal completion with backend using SWR's official patterns
  // https://swr.vercel.app/docs/mutation
  const syncWithBackend = async (userId, mealType, completed, date) => {
    if (!userId) return { success: false, message: 'No user ID provided' };
    
    const dateKey = formatDateString(date);
    const key = `${dateKey}-${mealType}`;
    
    try {
      store.setPendingStatus(key, 'syncing');
      
      // Full SWR key path for proper cache management
      const completionsKey = `/user-profile/meal-completion/${userId}/${dateKey}`;
      
      // Create the API request payload
      const payload = {
        user_id: userId,
        date: dateKey,
        meal_type: mealType,
        completed
      };
      
      // Use SWR's documented mutation pattern with optimistic updates
      const updateResult = await mutate(
        completionsKey,
        // Function that returns a promise of the updated data
        async (currentData) => {
          try {
            // Make the actual API request
            const result = await apiMutation.post('/user-profile/meal-completion', payload);
            
            // Return final data structure to update the cache
            return {
              ...(currentData || {}), // Preserve other meal types
              [mealType]: completed    // Update the changed meal type
            };
          } catch (error) {
            // Let SWR handle the error and rollback
            console.error('API error in meal completion:', error);
            throw error; // Important: propagate error for SWR to handle rollback
          }
        },
        {
          // Optimistic data to show immediately
          optimisticData: (currentData) => ({
            ...(currentData || {}),
            [mealType]: completed
          }),
          // Keep the optimistic data but still revalidate in background
          revalidate: false,
          // Use API response to update cache
          populateCache: true,
          // Revert to previous value on error
          rollbackOnError: true
        }
      );
      
      // Update local status
      store.setPendingStatus(key, 'synced');
      return { success: true };
    } catch (error) {
      // Handle errors with proper status
      store.setPendingStatus(key, 'error');
      console.error('Error syncing meal completion:', error);
      
      // Return standardized error response
      return { 
        success: false, 
        error: error.message || 'Unknown error during meal completion',
        status: error.status || 500
      };
    }
  };
  
  // Import completions from SWR cache or API using standard SWR fetching
  // Enhanced with better error handling and standardization
  const importFromSWR = async (userId, date) => {
    if (!userId) return { success: false, message: 'No user ID provided' };
    
    const dateKey = formatDateString(date);
    const completionsKey = `/user-profile/meal-completion/${userId}/${dateKey}`;
    
    try {
      // Use SWR's standard revalidation pattern
      // This will either get from cache or trigger a fetch if needed
      const data = await mutate(completionsKey);
      
      // Process data whether we got it from SWR or not - importCompletions now handles undefined/empty data
      // This ensures we always have standardized completion state for all meal types
      const processedData = store.importCompletions(data || {}, date);
      
      // Log the processed completions for debugging
      console.log('[MealCompletionService] Imported completions for date:', dateKey, processedData);
      
      return { 
        success: true, 
        data: processedData,
        fromSWR: !!data
      };
    } catch (error) {
      console.error('Error importing from SWR:', error);
      
      // Even on error, make sure we have standardized completion state
      // This ensures the UI always shows consistent state
      store.importCompletions({}, date);
      
      return { 
        success: false, 
        message: error.message || 'An error occurred importing completion data',
        error 
      };
    }
  };
  
  return {
    // Expose store state and actions
    completions: store.completions,
    pendingUpdates: store.pendingUpdates,
    
    // Re-export store methods
    toggleCompletion: store.toggleCompletion,
    setCompletions: store.setCompletions,
    getCompletionsForDate: store.getCompletionsForDate,
    importCompletions: store.importCompletions,
    
    // Add our API integration methods
    syncWithBackend,
    importFromSWR
  };
}