"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import useSWR, { useSWRConfig, mutate } from 'swr';
import { getAuthState } from './stores/authStore';

/**
 * A simple cache manager that works with SWR while allowing for persistence
 * to localStorage to maintain cache between page loads
 */
export const swrLocalCache = {
  CACHE_PREFIX: 'grovli_swr_cache_',
  MAX_AGE: 10 * 60 * 1000, // 10 minutes in milliseconds
  
  get: (key) => {
    if (typeof window === 'undefined') return null;
    
    try {
      const cacheKey = swrLocalCache.CACHE_PREFIX + key;
      const cachedItem = localStorage.getItem(cacheKey);
      
      if (!cachedItem) return null;
      
      const item = JSON.parse(cachedItem);
      
      // Check if cache entry is still valid
      if (Date.now() > item.expires) {
        localStorage.removeItem(cacheKey);
        return null;
      }
      
      return item.data;
    } catch (error) {
      console.warn(`[SWRCache] Error retrieving cached data for ${key}:`, error);
      return null;
    }
  },
  
  set: (key, data) => {
    if (typeof window === 'undefined') return;
    
    try {
      const cacheKey = swrLocalCache.CACHE_PREFIX + key;
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        expires: Date.now() + swrLocalCache.MAX_AGE
      };
      
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      
      // Keep track of cache keys for cleanup
      const cacheKeys = JSON.parse(localStorage.getItem(`${swrLocalCache.CACHE_PREFIX}keys`) || '[]');
      if (!cacheKeys.includes(key)) {
        cacheKeys.push(key);
        localStorage.setItem(`${swrLocalCache.CACHE_PREFIX}keys`, JSON.stringify(cacheKeys));
      }
    } catch (error) {
      console.warn(`[SWRCache] Failed to cache data for ${key}:`, error);
    }
  },
  
  clear: (key) => {
    if (typeof window === 'undefined') return;
    
    try {
      if (key) {
        // Clear specific key
        const cacheKey = swrLocalCache.CACHE_PREFIX + key;
        localStorage.removeItem(cacheKey);
        
        // Update keys list
        const cacheKeys = JSON.parse(localStorage.getItem(`${swrLocalCache.CACHE_PREFIX}keys`) || '[]');
        const updatedKeys = cacheKeys.filter(k => k !== key);
        localStorage.setItem(`${swrLocalCache.CACHE_PREFIX}keys`, JSON.stringify(updatedKeys));
      } else {
        // Clear all cache
        const cacheKeys = JSON.parse(localStorage.getItem(`${swrLocalCache.CACHE_PREFIX}keys`) || '[]');
        cacheKeys.forEach(k => {
          localStorage.removeItem(swrLocalCache.CACHE_PREFIX + k);
        });
        localStorage.setItem(`${swrLocalCache.CACHE_PREFIX}keys`, '[]');
      }
    } catch (error) {
      console.warn(`[SWRCache] Error clearing cache:`, error);
    }
  }
};

/**
 * SWR fetcher function with authentication
 * This serves as the core fetcher for all SWR requests
 */
export const fetcher = async (url) => {
  // Skip auth requirement for Next.js API routes (webhook endpoints)
  const isNextJsApiRoute = url.startsWith('/api/webhook/');
  
  // Get auth state from Zustand 
  const authState = getAuthState();
  const token = authState.getAuthToken?.();
  
  // DEBUG - log URLs being called for diagnosis
  console.log(`[SWR] Fetching ${url} with auth token: ${!!token}`);
  
  // Either throw authentication error or skip auth for webhook routes
  if (!token && !isNextJsApiRoute) {
    // Special check for onboarding status since this is a common failing point
    if (url.includes('/user-profile/check-onboarding/')) {
      console.warn(`[SWR] Onboarding check without auth token: ${url}`);
      // Let the request proceed - the backend will handle access
    } else {
      throw new Error('Authentication required');
    }
  }
  
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  
  let fullUrl;
  if (isNextJsApiRoute) {
    // For Next.js API routes, use the window origin as base URL
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    fullUrl = `${baseUrl}${url}`;
  } else {
    // For backend API routes, use the NEXT_PUBLIC_API_URL env variable
    fullUrl = url.startsWith('http') ? url : `${apiUrl}${url}`;
  }
  
  // For cached GET requests, try cache first
  if (url.startsWith('/user-profile/') || 
      url.startsWith('/api/user-plans') || 
      url.startsWith('/api/user-recipes') ||
      url.startsWith('/api/user-pantry') ||
      url.startsWith('/user-settings') ||
      url.startsWith('/api/webhook/')) {
    const cachedData = swrLocalCache.get(url);
    if (cachedData) {
      console.log(`[SWR] Using cached data for: ${url}`);
      return cachedData;
    }
  }
  
  // Prepare headers based on URL type
  const headers = {
    'Content-Type': 'application/json',
    'Origin': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  };
  
  // Add Authorization header for non-webhook routes only if we have a token
  if (token && !isNextJsApiRoute) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(fullUrl, {
    headers,
    credentials: 'include',
    mode: 'cors'
  });
  
  if (!response.ok) {
    const error = new Error('API request failed');
    error.status = response.status;
    try {
      error.info = await response.json();
    } catch (e) {
      error.info = await response.text();
    }
    throw error;
  }
  
  // Parse response
  const data = await response.json();
  
  // Cache specific endpoint data
  if (url.startsWith('/user-profile/') || 
      url.startsWith('/api/user-plans') || 
      url.startsWith('/api/user-recipes') ||
      url.startsWith('/api/user-pantry') ||
      url.startsWith('/user-settings') ||
      url.startsWith('/api/webhook/')) {
    swrLocalCache.set(url, data);
  }
  
  return data;
};

/**
 * Hook for GET requests using SWR
 */
export function useApiGet(url, options = {}) {
  // Allow empty URL for conditional fetching
  const shouldFetch = !!url;
  
  // Get cached data first if available
  const initialData = shouldFetch ? swrLocalCache.get(url) : undefined;
  
  // Merge options with defaults
  const mergedOptions = {
    ...options,
    ...(initialData ? { fallbackData: initialData } : {})
  };
  
  // Use SWR hook
  return useSWR(shouldFetch ? url : null, fetcher, mergedOptions);
}

/**
 * Hook for POST/PUT/DELETE requests with SWR cache invalidation
 */
export function useApiMutation() {
  const { mutate: globalMutate } = useSWRConfig();
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    data: null
  });
  
  // Generic mutation function that handles all non-GET methods
  const trigger = async (url, { method = 'POST', body, invalidateUrls = [], signal } = {}) => {
    setState({ isLoading: true, error: null, data: null });
    
    try {
      // Skip auth requirement for certain routes
      const isNextJsApiRoute = url.startsWith('/api/webhook/');
      
      // Get auth state from Zustand
      const authState = getAuthState();
      const token = authState.getAuthToken();
      
      // DEBUG - log URLs being called for diagnosis
      console.log(`[SWR API] Calling ${url} with auth token: ${!!token}`);
      
      // Either throw authentication error or skip auth for webhook routes
      if (!token && !isNextJsApiRoute) {
        // Special check for onboarding status since this is a common failing point
        if (url.includes('/user-profile/check-onboarding/')) {
          console.warn(`[SWR] Onboarding check without auth token: ${url}`);
          // Let the request proceed - the backend will handle access
        } else {
          throw new Error('Authentication required');
        }
      }
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      
      let fullUrl;
      if (isNextJsApiRoute) {
        // For Next.js API routes, use the window origin as base URL
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        fullUrl = `${baseUrl}${url}`;
      } else {
        // For backend API routes, use the NEXT_PUBLIC_API_URL env variable
        fullUrl = url.startsWith('http') ? url : `${apiUrl}${url}`;
      }
      
      // Prepare headers based on URL type
      const headers = {
        'Content-Type': 'application/json',
        'Origin': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      };
      
      // Add Authorization header for non-webhook routes only if we have a token
      if (token && !isNextJsApiRoute) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Prepare fetch options with AbortController signal if provided
      const fetchOptions = {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
        credentials: 'include',
        mode: 'cors'
      };
      
      // Add signal if provided
      if (signal) {
        fetchOptions.signal = signal;
      }
      
      // Start a timeout to abort the request if it takes too long
      let abortController;
      let timeoutId;
      
      if (!signal) {
        abortController = new AbortController();
        fetchOptions.signal = abortController.signal;
        
        // Set a 10 second timeout for all API requests
        timeoutId = setTimeout(() => {
          console.log(`[SWR] Request to ${url} timed out after 10s`);
          abortController.abort();
        }, 10000);
      }
      
      // Make the request
      const response = await fetch(fullUrl, fetchOptions);
      
      // Clear the timeout if we set one
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      if (!response.ok) {
        const error = new Error('API request failed');
        error.status = response.status;
        try {
          error.info = await response.json();
        } catch (e) {
          error.info = await response.text();
        }
        throw error;
      }
      
      // Parse response
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
      
      // Invalidate SWR cache for affected URLs
      if (invalidateUrls.length > 0) {
        for (const invalidateUrl of invalidateUrls) {
          // Clear both SWR cache and local storage cache
          globalMutate(invalidateUrl);
          swrLocalCache.clear(invalidateUrl);
        }
      }
      
      // Update state with success
      setState({ isLoading: false, error: null, data });
      return data;
    } catch (error) {
      // Special handling for AbortError to provide a better message
      if (error.name === 'AbortError') {
        console.warn(`[SWR] Request to ${url} was aborted`);
        
        // Check if the document is still visible
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          console.log('[SWR] Page is not visible, ignoring aborted request');
          setState({ isLoading: false, error: null, data: null });
          return { aborted: true };
        }
      }
      
      setState({ isLoading: false, error, data: null });
      throw error;
    }
  };
  
  // Helper methods for common HTTP verbs
  const post = (url, body, options) => trigger(url, { method: 'POST', body, ...options });
  const put = (url, body, options) => trigger(url, { method: 'PUT', body, ...options });
  const del = (url, options) => trigger(url, { method: 'DELETE', ...options });
  
  // Special function for updating meal plans
  const updateMealPlan = async (data, options = {}) => {
    try {
      // The meal plan update endpoint requires special handling
      const endpoint = '/api/user-plans/update';
      
      // Clean data to ensure it matches backend schema
      let cleanData = {...data};
      
      if (cleanData.meals && Array.isArray(cleanData.meals)) {
        // Clean meals - create new objects with only fields the backend expects
        cleanData.meals = cleanData.meals.map(meal => {
          // Only include fields that match the Pydantic model
          const cleanMeal = {
            date: meal.date,
            mealType: meal.mealType,
            mealId: meal.mealId
          };
          
          // Only add current_day if it exists
          if (meal.current_day !== undefined) {
            cleanMeal.current_day = meal.current_day;
          }
          
          // Optional fields from the model
          if (meal.macros) cleanMeal.macros = meal.macros;
          if (meal.ingredients) cleanMeal.ingredients = meal.ingredients;
          if (meal.instructions) cleanMeal.instructions = meal.instructions;
          if (meal.imageUrl) cleanMeal.imageUrl = meal.imageUrl;
          if (meal.calories) cleanMeal.calories = meal.calories;
          
          return cleanMeal;
        });
      }
      
      // Invalidate all related URLs
      const invalidateUrls = [
        '/api/user-plans',
        `/api/user-plans/${data.planId}`,
        '/api/user-plans/user',
        '/user-profile/meal-completion'
      ];
      
      // If we have user ID, add more specific URLs
      if (options.userId) {
        invalidateUrls.push(`/api/user-plans/user/${options.userId}`);
        invalidateUrls.push(`/user-profile/meal-completion/${options.userId}`);
      }
      
      // Use PUT to avoid CORS issues with this endpoint
      return await put(endpoint, cleanData, {
        invalidateUrls,
        ...options
      });
    } catch (error) {
      console.error('Failed to update meal plan:', error);
      throw error;
    }
  };
  
  // Save meal completion status (fixed endpoint)
  const saveMealCompletion = async (userId, mealType, completed, date) => {
    if (!userId) {
      console.error('[SWR] Cannot save meal completion: Missing user ID');
      throw new Error('User ID is required');
    }
    
    // Skip API calls when the page is not visible
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      console.log('[SWR] Page not visible, skipping meal completion API call');
      
      // Store in localStorage for retry when the page becomes visible again
      try {
        const pendingSaves = JSON.parse(localStorage.getItem('pendingMealCompletions') || '[]');
        const today = date || new Date().toISOString().split('T')[0];
        
        pendingSaves.push({
          userId,
          date: today,
          meals: [{ mealType, completed }],
          timestamp: Date.now()
        });
        
        localStorage.setItem('pendingMealCompletions', JSON.stringify(pendingSaves));
        console.log(`[SWR] Queued meal completion for ${mealType} for later processing`);
        return { queued: true };
      } catch (err) {
        console.error('[SWR] Error queueing meal completion:', err);
      }
      
      return null;
    }
    
    // If the page is visible, make the API call
    try {
      const today = date || new Date().toISOString().split('T')[0];
      console.log(`[SWR] Saving meal completion for ${mealType} (${completed ? 'completed' : 'not completed'})`);
      
      // Set a timeout to abort the request if it takes too long
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      // Use the correct endpoint (NOT the batch endpoint which causes 404 errors)
      const result = await post('/user-profile/meal-completion', {
        user_id: userId,
        date: today,
        meal_type: mealType,
        completed
      }, {
        invalidateUrls: [
          `/user-profile/meal-completion/${userId}/${today}`
        ],
        signal: controller.signal
      });
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      return result;
    } catch (error) {
      console.error('[SWR] Failed to save meal completion:', error);
      
      // If the request was aborted or the page is no longer visible, queue for retry
      if (error.name === 'AbortError' || 
          (typeof document !== 'undefined' && document.visibilityState !== 'visible')) {
        console.log('[SWR] Request aborted or page not visible, queueing for retry');
        
        // Save to localStorage for retry later
        try {
          const pendingSaves = JSON.parse(localStorage.getItem('pendingMealCompletions') || '[]');
          const today = date || new Date().toISOString().split('T')[0];
          
          pendingSaves.push({
            userId,
            date: today,
            meals: [{ mealType, completed }],
            timestamp: Date.now()
          });
          
          localStorage.setItem('pendingMealCompletions', JSON.stringify(pendingSaves));
          return { queued: true };
        } catch (err) {
          console.error('[SWR] Error queueing failed meal completion:', err);
        }
        
        return null;
      }
      
      // For other errors, throw them
      throw error;
    }
  };
  
  return {
    ...state,
    trigger,
    post,
    put,
    del,
    updateMealPlan,
    saveMealCompletion
  };
}

/**
 * Function for preloading profile data
 * This is NOT a hook anymore - it's a regular function that can be called anywhere
 */
export async function preloadProfileData(userId) {
  if (!userId) return { success: false, message: "No user ID provided" };
  
  try {
    // URLs to preload
    const today = new Date().toISOString().split('T')[0];
    const urls = [
      `/user-profile/${userId}`,
      `/api/user-plans/user/${userId}`,
      `/user-profile/meal-completion/${userId}/${today}`,
      `/user-settings/${userId}`,
      `/api/user-recipes/saved-recipes/`
    ];
    
    // Load all in parallel with Promise.allSettled
    const results = await Promise.allSettled(
      urls.map(url => {
        try {
          return fetcher(url).catch(err => {
            console.error(`Error preloading ${url}:`, err);
            return undefined;
          });
        } catch (e) {
          console.error(`Error setting up fetch for ${url}:`, e);
          return Promise.resolve(undefined);
        }
      })
    );
    
    // Process results
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== undefined).length;
    const success = successCount > 0;
    
    // Warm up the SWR cache with our results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value !== undefined) {
        // Prime the SWR cache using a more direct approach
        try {
          if (typeof window !== 'undefined') {
            // Store in our custom cache
            swrLocalCache.set(urls[index], result.value);
            
            // Also trigger SWR's cache
            mutate(urls[index], result.value, false);
          }
        } catch (e) {
          console.error(`Failed to cache ${urls[index]}:`, e);
        }
      }
    });
    
    console.log(`[SWR] Preloaded profile data: ${successCount}/${urls.length} endpoints successful`);
    
    return { 
      success,
      items_loaded: successCount,
      items_failed: results.length - successCount
    };
  } catch (error) {
    console.error('[SWR] Profile data prefetch failed:', error);
    return { 
      success: false, 
      message: error.message 
    };
  }
}

/**
 * A hook to use cached data from SWR in a synchronous way
 * Useful for components that rely on Zustand and need immediate data access
 */
export function useSWRCache(key) {
  const { data } = useApiGet(key, { 
    revalidateOnFocus: false, 
    revalidateOnMount: true 
  });
  
  return {
    data,
    getFromCache: () => swrLocalCache.get(key),
    clearCache: () => {
      swrLocalCache.clear(key);
      mutate(key);
    }
  };
}

/**
 * SWR configuration provider for global options
 */
/**
 * Hook for generating meal plans using SWR
 */
export function useMealPlanGenerator() {
  const apiMutation = useApiMutation();
  
  const generateMealPlan = async ({
    preferences,
    mealType,
    numDays,
    globalSettings = {},
    isPro = false,
    onError,
    onProcessingStarted,
    getAuthHeaders
  }) => {
    // Check Pro restrictions
    if (!isPro && (mealType === "Full Day" || numDays > 1)) {
      if (onError) onError("Pro subscription required for this feature");
      return { error: "Pro subscription required for this feature" };
    }
    
    try {
      // Call processing started callback if provided
      if (onProcessingStarted) {
        onProcessingStarted();
      }
      
      // Get pantry ingredients if using pantry algorithm
      let pantryIngredients = [];
      const algorithm = globalSettings.mealAlgorithm || 'experimental';
      
      if (algorithm === 'pantry') {
        try {
          // Use auth context to get token
          const headers = await getAuthHeaders();
          
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
          const pantryResponse = await fetch(`${apiUrl}/api/user-pantry/items`, { headers });
          
          if (pantryResponse.ok) {
            const pantryData = await pantryResponse.json();
            pantryIngredients = pantryData.items.map(item => item.name);
          }
        } catch (error) {
          console.error("Error fetching pantry ingredients:", error);
        }
      }
      
      // Use our SWR mutation function for the API call
      const data = await apiMutation.post('/mealplan/', {
        dietary_preferences: preferences,
        meal_type: mealType,
        num_days: numDays,
        carbs: globalSettings.carbs,
        calories: globalSettings.calories,
        protein: globalSettings.protein,
        sugar: globalSettings.sugar,
        fat: globalSettings.fat,
        fiber: globalSettings.fiber,
        meal_algorithm: algorithm,
        pantry_ingredients: pantryIngredients
      });
      
      console.log("[SWR] Meal plan API response:", data);
      
      // Case 1: Immediate meal plan data
      if (data.meal_plan && Array.isArray(data.meal_plan)) {
        console.log("[SWR] Received immediate meal plan");
        return {
          immediate: true,
          mealPlan: data.meal_plan,
          mealPlanId: data.meal_plan_id || `${mealType}_${Date.now()}`
        };
      }
      
      // Case 2: Background processing response
      if (data.status === "processing" && data.meal_plan_id) {
        console.log("[SWR] Meal plan processing in background");
        
        // Return the task tracking info
        return {
          immediate: false,
          mealPlanId: data.meal_plan_id,
          taskId: data.request_hash || data.meal_plan_id
        };
      }
      
      // Case 3: Unexpected response format
      throw new Error("Invalid API response format");
      
    } catch (error) {
      console.error('[SWR] Error generating meal plan:', error);
      if (onError) onError(`Error: ${error.message}`);
      return { error: error.message };
    }
  };
  
  // Check meal plan status
  const checkMealPlanStatus = async (mealPlanId, userId) => {
    if (!mealPlanId || !userId) {
      return { error: "Missing required parameters" };
    }
    
    try {
      // Use proper method for Next.js API routes
      const data = await apiMutation.trigger(`/api/webhook/meal-ready?user_id=${userId}&checkReadyPlans=true&mealPlanId=${mealPlanId}`, {
        method: 'GET'
      });
      return data;
    } catch (error) {
      console.error('[SWR] Error checking meal plan status:', error);
      return { error: error.message };
    }
  };
  
  return {
    generateMealPlan,
    checkMealPlanStatus,
    ...apiMutation
  };
}

/**
 * Hook for checking meal plan notifications
 * This replaces the old polling approach with a more efficient SWR-based solution
 */
export function useMealPlanNotifications(userId) {
  const [status, setStatus] = useState({
    isPolling: false,
    lastCheckedAt: null,
    mealPlanReady: false,
    readyMealPlanId: null
  });
  
  const { mutate: globalMutate } = useSWRConfig();
  
  // SWR key for the meal notification endpoint with correct URL
  const mealReadyKey = userId ? `/api/webhook/meal-ready?user_id=${userId}&checkReadyPlans=true` : null;
  
  // Use SWR with a customized fetcher to handle the meal plan notification endpoint
  const { 
    data, 
    error, 
    mutate,
    isValidating
  } = useApiGet(mealReadyKey, {
    // Don't automatically revalidate on focus - we'll control this ourselves
    revalidateOnFocus: false,
    // Use a shorter dedupe interval since this is polling
    dedupingInterval: 5000,
    // Refresh every 30 seconds if the window is visible
    refreshInterval: (data) => {
      // Don't keep polling if we already found a notification
      if (data?.has_notification) return 0;
      
      // Only poll when the page is visible
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return 0;
      }
      
      return 30000; // 30 seconds
    },
    // Handle successful polling 
    onSuccess: (data) => {
      setStatus(prev => ({
        ...prev,
        isPolling: true,
        lastCheckedAt: new Date(),
      }));
      
      // If we have a notification, update state
      if (data?.has_notification && data.notification?.meal_plan_id) {
        console.log(`[SWR] Meal plan notification detected: ${data.notification.meal_plan_id}`);
        setStatus(prev => ({
          ...prev,
          mealPlanReady: true,
          readyMealPlanId: data.notification.meal_plan_id
        }));
        
        // Dispatch an event for compatibility with existing code
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mealPlanReady', {
            detail: {
              mealPlanId: data.notification.meal_plan_id,
              timestamp: data.notification.timestamp,
              source: 'swr'
            }
          }));
        }
        
        // After notification is detected, stop polling
        return {
          ...data,
          stopPolling: true
        };
      }
      
      return data;
    },
    // Handle errors
    onError: (error) => {
      console.error(`[SWR] Error checking meal plan notification:`, error);
      setStatus(prev => ({
        ...prev,
        isPolling: false,
        lastCheckedAt: new Date()
      }));
    }
  });
  
  // Method to manually check for notifications
  const checkForNotifications = useCallback(async () => {
    setStatus(prev => ({ ...prev, isPolling: true }));
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      await mutate();
      return true;
    } catch (error) {
      console.error(`[SWR] Error checking for notifications:`, error);
      return false;
    } finally {
      setStatus(prev => ({ 
        ...prev, 
        isPolling: false,
        lastCheckedAt: new Date()
      }));
    }
  }, [mutate]);
  
  // When user ID changes, reset status
  useEffect(() => {
    setStatus({
      isPolling: false,
      lastCheckedAt: null,
      mealPlanReady: false,
      readyMealPlanId: null
    });
  }, [userId]);
  
  // Methods to handle the meal plan notification
  const acknowledgeMealPlan = useCallback(async () => {
    if (!status.mealPlanReady || !status.readyMealPlanId) {
      return false;
    }
    
    // Reset status
    setStatus(prev => ({
      ...prev,
      mealPlanReady: false,
      readyMealPlanId: null
    }));
    
    // Invalidate the cache key to force a fresh check next time
    globalMutate(mealReadyKey);
    
    return true;
  }, [status.mealPlanReady, status.readyMealPlanId, globalMutate, mealReadyKey]);
  
  return {
    ...status,
    isLoading: isValidating,
    error,
    notification: data?.has_notification ? data.notification : null,
    checkForNotifications,
    acknowledgeMealPlan
  };
}

/**
 * Hook for fetching meal plan details
 */
export function useMealPlanDetails(mealPlanId, userId) {
  // SWR key for the meal plan details endpoint
  const mealPlanKey = userId && mealPlanId ? `/mealplan/by_id/${mealPlanId}` : null;
  
  // Use SWR to fetch meal plan details
  const {
    data,
    error,
    mutate,
    isValidating
  } = useApiGet(mealPlanKey, {
    revalidateOnFocus: false,
    dedupingInterval: 10000,
    onSuccess: (data) => {
      // Check if the meal plan data is valid
      if (data?.meal_plan && Array.isArray(data.meal_plan)) {
        console.log(`[SWR] Successfully loaded meal plan: ${mealPlanId}`);
        
        // Store in localStorage for persistence
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentMealPlanId', mealPlanId);
        }
      }
    }
  });
  
  // Ensure meal plan data is valid
  const isValidMealPlan = data?.meal_plan && Array.isArray(data.meal_plan);
  
  // Process the meal plan data for consistent field names
  const processedMealPlan = useMemo(() => {
    if (!isValidMealPlan) return null;
    
    // Process the meal plan to ensure consistent field names
    return data.meal_plan.map(meal => ({
      ...meal,
      id: meal.id || meal.recipe_id,
      recipe_id: meal.recipe_id || meal.id,
      name: meal.title || meal.name || "",
      title: meal.title || meal.name || "",
      meal_type: meal.meal_type || meal.type || "",
      type: meal.type || meal.meal_type || "",
      nutrition: meal.nutrition || {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0
      },
      image: meal.imageUrl || meal.image || "",
      imageUrl: meal.imageUrl || meal.image || "",
      completed: meal.completed || false
    }));
  }, [isValidMealPlan, data]);
  
  return {
    mealPlan: processedMealPlan,
    originalData: data,
    isLoading: isValidating,
    error,
    refreshMealPlan: mutate,
    isValidMealPlan
  };
}

export function SWRProvider({ children }) {
  // Sync cached data on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      // Clean up expired cache entries
      const cacheKeys = JSON.parse(localStorage.getItem(`${swrLocalCache.CACHE_PREFIX}keys`) || '[]');
      const now = Date.now();
      const expiredKeys = [];
      
      cacheKeys.forEach(key => {
        const cacheKey = swrLocalCache.CACHE_PREFIX + key;
        try {
          const cachedItem = localStorage.getItem(cacheKey);
          if (cachedItem) {
            const item = JSON.parse(cachedItem);
            if (now > item.expires) {
              localStorage.removeItem(cacheKey);
              expiredKeys.push(key);
            }
          }
        } catch (e) {
          localStorage.removeItem(cacheKey);
          expiredKeys.push(key);
        }
      });
      
      // Update keys list
      if (expiredKeys.length > 0) {
        const validKeys = cacheKeys.filter(k => !expiredKeys.includes(k));
        localStorage.setItem(`${swrLocalCache.CACHE_PREFIX}keys`, JSON.stringify(validKeys));
        console.log(`[SWR] Cleared ${expiredKeys.length} expired cache items`);
      }
      
      console.log(`[SWR] Initialized with ${cacheKeys.length - expiredKeys.length} valid cached items`);
    } catch (error) {
      console.warn(`[SWR] Error initializing cache:`, error);
    }
  }, []);
  
  // Provide SWR's global focus revalidation for the document
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Revalidate when the page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Access the SWR mutator to trigger revalidation events
        mutate();
      }
    };
    
    // Add event listeners for visibility and focus
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', () => mutate());
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', () => mutate());
    };
  }, []);
  
  return children;
}