"use client";

/**
 * DEPRECATED: This file is maintained for backward compatibility only.
 * All new code should use the SWR client directly from lib/swr-client.js
 * 
 * This file will redirect all calls to the new SWR client implementation
 * for a smooth transition without breaking existing code.
 */

import { useApiGet, useApiMutation, fetcher, swrLocalCache, useProfilePreloader } from './swr-client';

console.warn(
  '[DEPRECATED] api-service.js is deprecated and will be removed in a future version. ' +
  'Please import from lib/swr-client.js directly.'
);

// Legacy API response cache - now just a wrapper around swrLocalCache
export const apiResponseCache = {
  set: (key, data, options = {}) => swrLocalCache.set(key, data),
  get: (key) => swrLocalCache.get(key),
  clear: (key) => swrLocalCache.clear(key),
  init: () => {
    console.warn('[DEPRECATED] apiResponseCache.init() is deprecated. SWR cache is automatically initialized.');
  }
};

/**
 * Legacy hook for component contexts that need to make API requests
 * @returns {Object} API service methods that now use SWR under the hood
 */
export function useApiService() {
  // Get SWR mutation hook for implementing the legacy API
  const apiMutation = useApiMutation();
  
  /**
   * Makes an authenticated request to the API (now using SWR)
   */
  const makeAuthenticatedRequest = async (endpoint, options = {}) => {
    try {
      const method = options.method || 'GET';
      
      if (method === 'GET') {
        // For GET requests, use useApiGet's fetcher directly
        return await fetcher(endpoint);
      } else {
        // For non-GET requests, use the mutation hook
        const body = options.body ? JSON.parse(options.body) : undefined;
        
        return await apiMutation.trigger(endpoint, { 
          method, 
          body, 
          ...options 
        });
      }
    } catch (error) {
      console.error(`Legacy API Service error: ${error.message}`);
      throw error;
    }
  };

  /**
   * Special function for meal plan updates (now using SWR)
   */
  const updateMealPlan = async (data, options = {}) => {
    try {
      return await apiMutation.updateMealPlan(data, options);
    } catch (error) {
      console.error(`Legacy updateMealPlan error: ${error.message}`);
      throw error;
    }
  };

  /**
   * Legacy profile data preloading (now using SWR)
   */
  const preloadProfileData = async (options = {}) => {
    try {
      // Get the preloader hook's function
      const { preloadProfileData: newPreloader } = useProfilePreloader();
      
      // Call the new implementation
      return await newPreloader();
    } catch (error) {
      console.error(`Legacy preloadProfileData error: ${error.message}`);
      return { success: false, message: error.message };
    }
  };

  /**
   * Legacy preload status checker (now using SWR)
   */
  const checkPreloadStatus = () => {
    // Simply return a completed status since SWR handles caching now
    return {
      status: 'completed',
      message: 'Using SWR caching'
    };
  };

  return { 
    makeAuthenticatedRequest,
    updateMealPlan,
    preloadProfileData,
    checkPreloadStatus
  };
}

// Re-export everything from swr-client for compatibility
export { useApiGet, useApiMutation, fetcher, swrLocalCache, useProfilePreloader } from './swr-client';