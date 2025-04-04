"use client";

import { getAuthState } from './stores/authStore';

// Enhanced Browser-based API Response Cache - improves performance for profile page preloading
// with optimized caching for better client-side performance
export const apiResponseCache = {
  CACHE_PREFIX: 'grovli_api_cache_',
  MAX_AGE: 10 * 60 * 1000, // 10 minutes in milliseconds (extended from 5 minutes)
  PROFILE_CACHE_TTL: 15 * 60 * 1000, // 15 minutes for profile-related data
  
  // Try to use sessionStorage first and fall back to localStorage
  // SessionStorage is faster but cleared when the browser is closed
  set: (key, data, options = {}) => {
    if (typeof window === 'undefined') return; // Only run in browser
    
    try {
      // Determine if this is profile-related data for longer TTL
      const isProfileData = key.includes('/user-profile/') || 
                           key.includes('/user-plans') || 
                           key.includes('/user-settings/') || 
                           key.includes('/meal-completion/');
                           
      const ttl = isProfileData ? apiResponseCache.PROFILE_CACHE_TTL : apiResponseCache.MAX_AGE;
      const priority = options.priority || (isProfileData ? 'high' : 'normal');
      
      // Normalize API URL in key to prevent issues with production/staging environment differences
      let normalizedKey = key;
      
      // Check if key starts with an absolute URL, and normalize it to just the path
      if (key.startsWith('http://') || key.startsWith('https://')) {
        try {
          const url = new URL(key);
          normalizedKey = url.pathname + url.search + url.hash;
          console.log(`[BrowserCache] Normalized key from ${key} to ${normalizedKey}`);
        } catch (e) {
          // If parsing fails, use original key
          console.warn(`[BrowserCache] Failed to normalize URL key: ${key}`);
        }
      }
      
      const cacheKey = apiResponseCache.CACHE_PREFIX + normalizedKey;
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        expires: Date.now() + ttl,
        priority
      };
      
      // Try using sessionStorage first (faster) for normal priority items
      const storage = (priority === 'high') ? localStorage : sessionStorage;
      const backupStorage = (priority === 'high') ? sessionStorage : localStorage;
      
      try {
        // Store in primary storage
        storage.setItem(cacheKey, JSON.stringify(cacheEntry));
        
        // For high priority items, also store in backup storage
        if (priority === 'high') {
          backupStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
        }
        
        // Keep track of all cache keys for easy clearing - store in localStorage
        const cacheKeys = JSON.parse(localStorage.getItem(`${apiResponseCache.CACHE_PREFIX}keys`) || '[]');
        if (!cacheKeys.includes(normalizedKey)) {
          cacheKeys.push(normalizedKey);
          localStorage.setItem(`${apiResponseCache.CACHE_PREFIX}keys`, JSON.stringify(cacheKeys));
        }
        
        console.log(`[BrowserCache] Cached data for: ${normalizedKey} (${priority} priority)`);
      } catch (storageError) {
        // If primary storage fails (quota exceeded), try backup storage
        console.warn(`[BrowserCache] Primary storage failed, trying backup storage`);
        try {
          backupStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
        } catch (backupError) {
          // Both storages failed, log error
          throw new Error(`Both storage mechanisms failed: ${backupError.message}`);
        }
      }
    } catch (error) {
      // Handle quota exceeded or other storage errors
      console.warn(`[BrowserCache] Failed to cache data for ${key}:`, error);
    }
  },
  
  get: (key) => {
    if (typeof window === 'undefined') return null; // Only run in browser
    
    try {
      // Normalize API URL in key to prevent issues with production/staging environment differences
      let normalizedKey = key;
      
      // Check if key starts with an absolute URL, and normalize it to just the path
      if (key.startsWith('http://') || key.startsWith('https://')) {
        try {
          const url = new URL(key);
          normalizedKey = url.pathname + url.search + url.hash;
        } catch (e) {
          // If parsing fails, use original key
          console.warn(`[BrowserCache] Failed to normalize URL key: ${key}`);
        }
      }
      
      const cacheKey = apiResponseCache.CACHE_PREFIX + normalizedKey;
      
      // Try sessionStorage first (faster)
      let cachedItem = sessionStorage.getItem(cacheKey);
      let storageType = 'sessionStorage';
      
      // If not in sessionStorage, check localStorage
      if (!cachedItem) {
        cachedItem = localStorage.getItem(cacheKey);
        storageType = 'localStorage';
      }
      
      if (!cachedItem) return null;
      
      const item = JSON.parse(cachedItem);
      
      // Check if cache entry is still valid
      if (Date.now() > item.expires) {
        // Clear expired item from both storages
        sessionStorage.removeItem(cacheKey);
        localStorage.removeItem(cacheKey);
        
        // Update keys list
        const cacheKeys = JSON.parse(localStorage.getItem(`${apiResponseCache.CACHE_PREFIX}keys`) || '[]');
        const updatedKeys = cacheKeys.filter(k => k !== normalizedKey);
        localStorage.setItem(`${apiResponseCache.CACHE_PREFIX}keys`, JSON.stringify(updatedKeys));
        
        return null;
      }
      
      // For high priority items that were found in sessionStorage but not in localStorage,
      // update localStorage too for redundancy
      if (storageType === 'sessionStorage' && item.priority === 'high') {
        if (!localStorage.getItem(cacheKey)) {
          localStorage.setItem(cacheKey, cachedItem);
        }
      }
      
      console.log(`[BrowserCache] Using cached data for: ${normalizedKey} from ${storageType}`);
      return item.data;
    } catch (error) {
      console.warn(`[BrowserCache] Error retrieving cached data for ${key}:`, error);
      return null;
    }
  },
  
  // Clear specific item or the entire cache
  clear: (key) => {
    if (typeof window === 'undefined') return; // Only run in browser
    
    try {
      if (key) {
        // Normalize API URL in key to prevent issues with production/staging environment differences
        let normalizedKey = key;
        
        // Check if key starts with an absolute URL, and normalize it to just the path
        if (key.startsWith('http://') || key.startsWith('https://')) {
          try {
            const url = new URL(key);
            normalizedKey = url.pathname + url.search + url.hash;
          } catch (e) {
            // If parsing fails, use original key
            console.warn(`[BrowserCache] Failed to normalize URL key: ${key}`);
          }
        }
        
        // Clear specific item from both storage types
        const cacheKey = apiResponseCache.CACHE_PREFIX + normalizedKey;
        localStorage.removeItem(cacheKey);
        sessionStorage.removeItem(cacheKey);
        
        // Update keys list
        const cacheKeys = JSON.parse(localStorage.getItem(`${apiResponseCache.CACHE_PREFIX}keys`) || '[]');
        const updatedKeys = cacheKeys.filter(k => k !== normalizedKey);
        localStorage.setItem(`${apiResponseCache.CACHE_PREFIX}keys`, JSON.stringify(updatedKeys));
        
        console.log(`[BrowserCache] Cleared cache for: ${normalizedKey}`);
      } else {
        // Clear all cache items
        const cacheKeys = JSON.parse(localStorage.getItem(`${apiResponseCache.CACHE_PREFIX}keys`) || '[]');
        
        // Remove all cache entries from both storage types
        cacheKeys.forEach(k => {
          const cacheKey = apiResponseCache.CACHE_PREFIX + k;
          localStorage.removeItem(cacheKey);
          sessionStorage.removeItem(cacheKey);
        });
        
        // Clear keys list
        localStorage.setItem(`${apiResponseCache.CACHE_PREFIX}keys`, '[]');
        
        console.log(`[BrowserCache] Cleared entire cache (${cacheKeys.length} items)`);
      }
    } catch (error) {
      console.warn(`[BrowserCache] Error clearing cache:`, error);
    }
  },
  
  // Initialize cache and clean up expired items
  init: () => {
    if (typeof window === 'undefined') return; // Only run in browser
    
    try {
      // Get all cache keys
      const cacheKeys = JSON.parse(localStorage.getItem(`${apiResponseCache.CACHE_PREFIX}keys`) || '[]');
      const now = Date.now();
      const expiredKeys = [];
      
      // Check each cache item for expiration in both storage types
      cacheKeys.forEach(key => {
        const cacheKey = apiResponseCache.CACHE_PREFIX + key;
        let isValidInEither = false;
        
        // Check localStorage
        try {
          const localItem = localStorage.getItem(cacheKey);
          if (localItem) {
            const item = JSON.parse(localItem);
            if (now <= item.expires) {
              isValidInEither = true;
            } else {
              localStorage.removeItem(cacheKey);
            }
          }
        } catch (e) {
          localStorage.removeItem(cacheKey);
        }
        
        // Check sessionStorage
        try {
          const sessionItem = sessionStorage.getItem(cacheKey);
          if (sessionItem) {
            const item = JSON.parse(sessionItem);
            if (now <= item.expires) {
              isValidInEither = true;
            } else {
              sessionStorage.removeItem(cacheKey);
            }
          }
        } catch (e) {
          sessionStorage.removeItem(cacheKey);
        }
        
        // If not valid in either storage, mark for removal
        if (!isValidInEither) {
          expiredKeys.push(key);
        }
      });
      
      // Update keys list
      if (expiredKeys.length > 0) {
        const validKeys = cacheKeys.filter(k => !expiredKeys.includes(k));
        localStorage.setItem(`${apiResponseCache.CACHE_PREFIX}keys`, JSON.stringify(validKeys));
        console.log(`[BrowserCache] Cleared ${expiredKeys.length} expired items`);
      }
      
      console.log(`[BrowserCache] Initialized with ${cacheKeys.length - expiredKeys.length} valid items`);
    } catch (error) {
      console.warn(`[BrowserCache] Error initializing cache:`, error);
    }
  }
};

// Debug flag to help trace auth issues
const DEBUG_AUTH = true;

/**
 * Class-based API service for non-hook contexts
 */
export class ApiService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  }

  async makeRequest(endpoint, options = {}) {
    if (!this.accessToken) {
      console.warn("API Service: No access token available");
      throw new Error("Access token not available");
    }
    
    try {
      console.log(`Making API request to: ${this.apiBaseUrl}${endpoint}`);
      
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
          'Origin': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
          ...(options.headers || {})
        },
        credentials: 'include', // Add credentials for CORS
        mode: 'cors' // Explicit CORS mode
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`API error ${response.status}: ${errorBody}`);
        throw new Error(`API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${error.message}`);
      throw error;
    }
  }
  
  // Static method that doesn't require instantiation
  static async makeAuthenticatedRequest(endpoint, options = {}) {
    // Check if we should use caching (GET requests only, non-update endpoints)
    const isGetRequest = !options.method || options.method === 'GET';
    const isUpdateEndpoint = endpoint.includes('update');
    const isPrefetch = options.headers?.Purpose === 'prefetch';
    const canUseCache = isGetRequest && !isUpdateEndpoint;
      
    // Create cache key based on endpoint and relevant options
    const cacheKey = canUseCache ? 
      `${endpoint}${options.body ? `-${JSON.stringify(options.body)}` : ''}` : null;
      
    // For GET requests that can be cached, check cache first
    if (canUseCache && cacheKey) {
      const cachedData = apiResponseCache.get(cacheKey);
      if (cachedData) {
        console.log(`[API Service Static] Using cached data for: ${endpoint}`);
        return cachedData;
      }
    }
    
    // Get auth state directly (works in both client and server contexts)
    const authState = getAuthState();
    const token = authState.getAuthToken();
    
    if (!token) {
      console.warn("API Service: No access token available from auth state");
      throw new Error("Access token not available");
    }
    
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    const headers = authState.getAuthHeaders();
    
    try {
      // Debug info for CORS issues
      console.log(`Making API request to: ${apiUrl}${endpoint}`);
      console.log(`With headers:`, JSON.stringify({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': window.location.origin,
        ...headers
      }, null, 2));
      console.log(`Request method: ${options.method || 'GET'}`);
      console.log(`Request body: ${options.body ? options.body.substring(0, 200) + '...' : 'none'}`);
      console.log(`Cache status: ${canUseCache ? 'Cacheable' : 'Not cacheable'}`);
      
      // Try different CORS approaches based on the endpoint and method
      // Some endpoints might work better with different CORS configs
      const isUpdateEndpoint = endpoint.includes('update');
      const requestInit = {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': window.location.origin,
          ...headers,
          ...(options.headers || {})
        }
      };
      
      // For update endpoints, try a different CORS approach
      if (isUpdateEndpoint) {
        console.log("Using special CORS configuration for update endpoint");
        
        // Try without credentials and with 'no-cors' mode as a fallback
        const fetchOptions = {
          ...requestInit,
          mode: 'cors',
          // Remove credentials for this specific case
          credentials: undefined
        };
        
        console.log(`CORS fallback config:`, JSON.stringify(fetchOptions, null, 2));
        
        const response = await fetch(`${apiUrl}${endpoint}`, fetchOptions);
        
        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`API error ${response.status}: ${errorBody}`);
          
          // Try to parse the error as JSON to get more details
          let errorDetail = '';
          try {
            const errorJson = JSON.parse(errorBody);
            errorDetail = errorJson.detail || '';
            console.error('Detailed API error:', errorJson);
          } catch (e) {
            // Not JSON, use the raw text
          }
          
          throw new Error(`API error: ${response.status}${errorDetail ? ` - ${errorDetail}` : ''}`);
        }
        
        const data = await response.json();
        return data;
      }
      
      // For non-update endpoints, use standard CORS config
      const response = await fetch(`${apiUrl}${endpoint}`, {
        ...requestInit,
        credentials: 'include',
        mode: 'cors'
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`API error ${response.status}: ${errorBody}`);
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache the response for GET requests if it's cacheable
      if (canUseCache && cacheKey && data) {
        console.log(`[API Service Static] Caching data for: ${endpoint}`);
        apiResponseCache.set(cacheKey, data);
      }
      
      return data;
    } catch (error) {
      console.error(`API request failed: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Hook for component contexts that need to make API requests
 * @returns {Object} API service methods
 */
export function useApiService() {
  // Use direct state access without hooks - this is SSR safe and avoids hook rules issues
  const authState = getAuthState();
  
  // For debugging - add this to window for easy access
  if (typeof window !== 'undefined') {
    window.__authState = authState;
  }
  
  /**
   * Makes an authenticated request to the API
   * @param {string} endpoint - The API endpoint to call
   * @param {Object} options - Options to pass to fetch
   * @returns {Promise<Object>} The API response
   */
  const makeAuthenticatedRequest = async (endpoint, options = {}) => {
    try {
      // Check if we should use caching (GET requests only, non-update endpoints)
      const isGetRequest = !options.method || options.method === 'GET';
      const isUpdateEndpoint = endpoint.includes('update');
      const isPrefetch = options.headers?.Purpose === 'prefetch';
      const canUseCache = isGetRequest && !isUpdateEndpoint;
      
      // Create cache key based on endpoint and relevant options
      const cacheKey = canUseCache ? 
        `${endpoint}${options.body ? `-${JSON.stringify(options.body)}` : ''}` : null;
      
      // For GET requests that can be cached, check cache first
      if (canUseCache && cacheKey) {
        const cachedData = apiResponseCache.get(cacheKey);
        if (cachedData) {
          console.log(`[API Service] Using cached data for: ${endpoint}`);
          return cachedData;
        }
      }
      
      // Get token from Zustand store
      const token = authState.getAuthToken();
      
      // If no token, can't proceed
      if (!token) {
        console.warn("API Service: No access token available");
        return null;
      }
      
      // Make the API request
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      
      // Get headers from Zustand store
      const headers = authState.getAuthHeaders();
      
      // Debug info for CORS issues
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      console.log(`Making API request from hook to: ${apiUrl}${endpoint}`);
      console.log(`With headers:`, JSON.stringify({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': origin,
        ...headers
      }, null, 2));
      console.log(`Request method: ${options.method || 'GET'}`);
      console.log(`Request body: ${options.body ? options.body.substring(0, 200) + '...' : 'none'}`);
      console.log(`Cache status: ${canUseCache ? 'Cacheable' : 'Not cacheable'}`);
      
      // Enhanced logic for CORS handling
      const requestInit = {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': origin,
          ...headers,
          ...(options.headers || {})
        }
      };
      
      let response;
      
      // For update endpoints, try a different CORS approach
      if (isUpdateEndpoint) {
        console.log("Using special CORS configuration for update endpoint");
        
        // Try with simplified CORS settings
        response = await fetch(`${apiUrl}${endpoint}`, {
          ...requestInit,
          mode: 'cors',
          // Don't include credentials for this specific case
          credentials: undefined
        });
      } else {
        // For non-update endpoints, use standard CORS config
        response = await fetch(`${apiUrl}${endpoint}`, {
          ...requestInit,
          credentials: 'include',
          mode: 'cors'
        });
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error ${response.status}: ${errorText}`);
        
        // If this is an update endpoint with a CORS error, try a final fallback approach
        if (isUpdateEndpoint && response.status === 0) {
          console.log("CORS error detected on update endpoint, trying fallback approach");
          
          // Final fallback - try without any CORS-specific options
          const fallbackResponse = await fetch(`${apiUrl}${endpoint}`, {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              ...headers,
              ...(options.headers || {})
            }
          });
          
          if (!fallbackResponse.ok) {
            const fallbackErrorText = await fallbackResponse.text();
            console.error(`Fallback API error ${fallbackResponse.status}: ${fallbackErrorText}`);
            throw new Error(`API error: ${fallbackResponse.status}`);
          }
          
          try {
            return await fallbackResponse.json();
          } catch (jsonError) {
            console.log("Fallback response was not JSON, returning empty object");
            return {};
          }
        }
        
        throw new Error(`API error: ${response.status}`);
      }
      
      try {
        const data = await response.json();
        
        // Cache the response for GET requests if it's cacheable
        if (canUseCache && cacheKey && data) {
          console.log(`[API Service] Caching data for: ${endpoint}`);
          apiResponseCache.set(cacheKey, data);
          
          // Special handling for profile-related data - cache with additional keys
          if (endpoint.includes('/user-plans/') || 
              endpoint.includes('/mealplan/') || 
              endpoint.includes('/user-profile/')) {
            console.log(`[API Service] Adding this data to preload cache`);
            
            // Mark this data as preloaded if it was a prefetch request
            if (isPrefetch) {
              // Store in sessionStorage that this was preloaded
              if (typeof window !== 'undefined') {
                const preloadedEndpoints = JSON.parse(sessionStorage.getItem('preloadedEndpoints') || '[]');
                if (!preloadedEndpoints.includes(endpoint)) {
                  preloadedEndpoints.push(endpoint);
                  sessionStorage.setItem('preloadedEndpoints', JSON.stringify(preloadedEndpoints));
                }
              }
            }
          }
        }
        
        return data;
      } catch (jsonError) {
        // Handle non-JSON responses
        console.log("API Service: Response was not JSON, returning empty object");
        return {};
      }
    } catch (error) {
      console.error(`API Service: Request failed: ${error.message}`);
      throw error;
    }
  };
  
  /**
   * Special function specifically for the meal plan update endpoint that has CORS issues
   * Uses PUT method instead of POST to bypass CORS errors on this specific endpoint
   * @param {Object} data - The data to send to the API
   * @param {Object} options - Optional configuration including auth token
   * @returns {Promise<Object>} - The API response
   */
  const updateMealPlan = async (data, options = {}) => {
    try {
      // Debug auth sources
      console.log("AUTH DEBUGGING:");
      
      // Direct Zustand method
      const authHeaders = authState.getAuthHeaders();
      console.log("1. authState.getAuthHeaders():", authHeaders.Authorization ? "✓ Has token" : "✗ No token");
      
      // Direct token getter
      const directToken = authState.getToken ? authState.getToken() : null;
      console.log("2. authState.getToken():", directToken ? "✓ Has token" : "✗ No token");
      
      // Direct property access
      const stateToken = authState.accessToken;
      console.log("3. authState.accessToken:", stateToken ? "✓ Has token" : "✗ No token");
      
      // Browser storage (client-side only)
      if (typeof window !== 'undefined') {
        console.log("4. window.latestAuthToken:", window.latestAuthToken ? "✓ Has token" : "✗ No token");
        console.log("5. window.__auth0_token:", window.__auth0_token ? "✓ Has token" : "✗ No token");
        console.log("6. localStorage token:", localStorage.getItem('accessToken') ? "✓ Has token" : "✗ No token");
        console.log("7. sessionStorage token:", sessionStorage.getItem('accessToken') ? "✓ Has token" : "✗ No token");
      }
      
      // Check for direct token in options
      let token;
      let headers = {};
      
      // Based on debugging, localStorage is the only source with a token
      if (typeof window !== 'undefined' && localStorage.getItem('accessToken')) {
        console.log("Using token from localStorage");
        token = localStorage.getItem('accessToken');
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        
        // Get user ID from storage or option
        if (options.userId) {
          headers['user-id'] = options.userId;
        } else if (typeof window !== 'undefined' && window.userId) {
          headers['user-id'] = window.userId;
        }
      }
      // Fallbacks if localStorage fails
      else if (options.token) {
        console.log("Using token directly passed to function");
        token = options.token;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        
        if (options.userId) {
          headers['user-id'] = options.userId;
        }
      } else if (authHeaders.Authorization) {
        console.log("Using authState.getAuthHeaders() for token");
        headers = authHeaders;
      } else if (directToken) {
        console.log("Using authState.getToken() for token");
        token = directToken;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
      } else {
        console.warn("API Service: No Authorization header available for updateMealPlan");
        throw new Error("No authorization token available");
      }
      
      // Add user ID if missing but we have it
      if (!headers['user-id'] && authState.userId) {
        headers['user-id'] = authState.userId;
      }
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const endpoint = '/api/user-plans/update';
      
      console.log("Using special updateMealPlan function with PUT method");
      console.log(`Sending data to ${apiUrl}${endpoint}`);
      
      // Clean the data to ensure it matches backend schema
      let cleanData = {...data};
      
      // Fix API data to ensure it matches backend schema
      if (cleanData.meals && Array.isArray(cleanData.meals)) {
        console.log("Original meals data:", JSON.stringify(cleanData.meals, null, 2));
        
        // Clean meals - create new objects with only fields the backend expects
        cleanData.meals = cleanData.meals.map(meal => {
          // Explicitly check for and log if meal_type exists
          if (meal.meal_type) {
            console.log("WARNING: meal_type found in data and will be removed:", meal.meal_type);
          }
          
          // Only include fields that match the Pydantic model - EXPLICITLY exclude meal_type
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
        
        console.log("Cleaned meals data:", JSON.stringify(cleanData.meals, null, 2));
      }
      
      console.log("Final request payload:", JSON.stringify(cleanData, null, 2));
      
      // Final safety check - ensure there are no meal_type fields anywhere in the data
      const serialized = JSON.stringify(cleanData);
      if (serialized.includes('"meal_type"')) {
        console.error("WARNING: meal_type still found in data after cleaning!");
        
        // Find the locations of meal_type in the serialized JSON
        let index = serialized.indexOf('"meal_type"');
        let locations = [];
        while (index !== -1) {
          // Get some context around the location
          const start = Math.max(0, index - 50);
          const end = Math.min(serialized.length, index + 50);
          locations.push(`Position ${index}: ...${serialized.substring(start, end)}...`);
          index = serialized.indexOf('"meal_type"', index + 1);
        }
        
        console.error("meal_type found at these locations:", locations);
        
        // Remove the offending field(s) one last time
        const fixed = serialized.replace(/"meal_type":[^,}]*,?/g, '').replace(/,}/g, '}');
        try {
          cleanData = JSON.parse(fixed);
          console.log("FORCIBLY CLEANED data:", JSON.stringify(cleanData, null, 2));
        } catch (parseError) {
          console.error("Error parsing cleaned JSON:", parseError);
          // If parsing fails, try a more conservative approach
          const safeFixed = serialized.replace(/"meal_type":[^,}]*(,|(?=}))/g, '');
          try {
            cleanData = JSON.parse(safeFixed);
            console.log("SAFELY CLEANED data with conservative approach:", JSON.stringify(cleanData, null, 2));
          } catch (safeParseError) {
            console.error("Safe parsing also failed:", safeParseError);
            // Last resort: remove individual meal_type properties manually
            if (cleanData.meals && Array.isArray(cleanData.meals)) {
              cleanData.meals.forEach(meal => delete meal.meal_type);
            }
          }
        }
      }
      
      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'PUT',  // Use PUT instead of POST
        headers,
        body: JSON.stringify(cleanData)
      });
      
      if (response.ok) {
        console.log("Update succeeded");
        
        try {
          return await response.json();
        } catch (jsonError) {
          console.log("Response was not JSON, returning empty object");
          return {};
        }
      } else {
        const errorText = await response.text();
        console.error(`Request failed with status ${response.status}: ${errorText}`);
        
        // Try to parse the error for more details
        let detailedError = '';
        try {
          const errorJson = JSON.parse(errorText);
          console.error("Parsed error:", errorJson);
          
          if (errorJson.detail) {
            detailedError = errorJson.detail;
            
            // Special handling for meal_type errors
            if (detailedError.includes('meal_type')) {
              console.error("DETECTED meal_type ERROR! This should have been caught by our cleaning process.");
              console.error("Original request data:", JSON.stringify(data, null, 2));
              console.error("Cleaned request data:", JSON.stringify(cleanData, null, 2));
            }
          }
        } catch (e) {
          // Not JSON, use the raw error text
          detailedError = errorText;
        }
        
        throw new Error(`Request failed with status ${response.status}${detailedError ? `: ${detailedError}` : ''}`);
      }
    } catch (error) {
      console.error(`updateMealPlan failed: ${error.message}`);
      throw error;
    }
  };
  
  /**
   * Enhanced profile data preloading that uses client-side approach with browser caching
   * 
   * @param {Object} options - Optional settings for what to preload
   * @returns {Promise<Object>} - Indicator of preload success
   */
  const preloadProfileData = async (options = {}) => {
    try {
      const userId = authState.userId;
      const token = authState.getAuthToken();
      
      if (!userId || !token) {
        console.warn("API Service: No user ID or token available for preload");
        return { success: false, message: "Authentication required" };
      }
      
      console.log(`[API Service] Starting client-side profile data preload for user ${userId}`);
      
      // Mark preload as in progress
      if (typeof window !== 'undefined') {
        localStorage.setItem('preload_last_attempt', Date.now().toString());
      }
      
      // Create an array of promises for parallel loading
      const preloadPromises = [
        // User profile
        makeAuthenticatedRequest(`/api/user-profile/${userId}`, {
          headers: { 'Purpose': 'prefetch' }
        }).catch(err => {
          console.warn(`[API Service] Error preloading profile: ${err.message}`);
          return null;
        }),
        
        // User meal plans
        makeAuthenticatedRequest(`/api/user-plans/user/${userId}`, {
          headers: { 'Purpose': 'prefetch' }
        }).catch(err => {
          console.warn(`[API Service] Error preloading meal plans: ${err.message}`);
          return null;
        }),
        
        // User meal completions
        (async () => {
          const today = new Date().toISOString().split('T')[0];
          return makeAuthenticatedRequest(`/user-profile/meal-completion/${userId}/${today}`, {
            headers: { 'Purpose': 'prefetch' }
          }).catch(err => {
            console.warn(`[API Service] Error preloading meal completions: ${err.message}`);
            return null;
          });
        })(),
        
        // User settings
        makeAuthenticatedRequest(`/user-settings/${userId}`, {
          headers: { 'Purpose': 'prefetch' }
        }).catch(err => {
          console.warn(`[API Service] Error preloading user settings: ${err.message}`);
          return null;
        })
      ];
      
      // If saved meals should be included
      if (options.include_saved_meals !== false) {
        preloadPromises.push(
          makeAuthenticatedRequest(`/api/user-recipes/saved-recipes/`, {
            headers: { 'Purpose': 'prefetch' }
          }).catch(err => {
            console.warn(`[API Service] Error preloading saved recipes: ${err.message}`);
            return null;
          })
        );
      }
      
      // Wait for all preloads to complete
      const results = await Promise.allSettled(preloadPromises);
      
      // Check if at least the critical requests succeeded
      const criticalSuccesses = results.slice(0, 2).filter(r => r.status === 'fulfilled' && r.value !== null);
      const success = criticalSuccesses.length >= 1; // Need at least profile or meal plans
      
      console.log(`[API Service] Client-side preload ${success ? 'succeeded' : 'partially failed'}`);
      
      // Mark preload as completed
      if (typeof window !== 'undefined') {
        localStorage.setItem('preload_status', success ? 'success' : 'partial');
        localStorage.setItem('preload_completed', Date.now().toString());
      }
      
      return { 
        success,
        items_loaded: results.filter(r => r.status === 'fulfilled' && r.value !== null).length,
        items_failed: results.filter(r => r.status !== 'fulfilled' || r.value === null).length
      };
    } catch (error) {
      console.error(`[API Service] Preload error: ${error.message}`);
      
      // Mark preload as failed
      if (typeof window !== 'undefined') {
        localStorage.setItem('preload_status', 'error');
        localStorage.setItem('preload_error', error.message);
      }
      
      return { 
        success: false, 
        message: `Error during preload: ${error.message}` 
      };
    }
  };
  
  /**
   * Check the preload status from client-side storage
   * @returns {Object} - Status information
   */
  const checkPreloadStatus = () => {
    if (typeof window === 'undefined') {
      return { status: 'unknown', message: 'Not in browser context' };
    }
    
    const status = localStorage.getItem('preload_status');
    const lastAttempt = localStorage.getItem('preload_last_attempt');
    const completed = localStorage.getItem('preload_completed');
    
    return {
      status: status || 'not_started',
      last_attempt: lastAttempt ? new Date(parseInt(lastAttempt, 10)).toISOString() : null,
      completed: completed ? new Date(parseInt(completed, 10)).toISOString() : null,
      error: localStorage.getItem('preload_error') || null
    };
  };

  return { 
    makeAuthenticatedRequest,
    updateMealPlan,
    prefetchProfileData: preloadProfileData,  // Maintain backward compatibility with new implementation
    checkPrefetchStatus: checkPreloadStatus,  // Maintain backward compatibility with new implementation
    preloadProfileData,
    checkPreloadStatus
  };
}