"use client";

import { getAuthState } from './stores/authStore';

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
          throw new Error(`API error: ${response.status}`);
        }
        
        return await response.json();
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
      
      return await response.json();
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
  
  /**
   * Makes an authenticated request to the API
   * @param {string} endpoint - The API endpoint to call
   * @param {Object} options - Options to pass to fetch
   * @returns {Promise<Object>} The API response
   */
  const makeAuthenticatedRequest = async (endpoint, options = {}) => {
    try {
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
      
      // Enhanced logic for CORS handling
      const isUpdateEndpoint = endpoint.includes('update');
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
        return await response.json();
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
   * @param {Object} data - The data to send to the API
   * @returns {Promise<Object>} - The API response
   */
  const updateMealPlan = async (data) => {
    try {
      // Get token and API URL
      const token = authState.getAuthToken();
      if (!token) {
        console.warn("API Service: No access token available for updateMealPlan");
        return null;
      }
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const endpoint = '/api/user-plans/update';
      
      console.log("Using special updateMealPlan function with PUT method");
      console.log(`Sending data to ${apiUrl}${endpoint}`);
      
      // Store update in localStorage in case of network failure
      if (typeof window !== 'undefined') {
        const pendingUpdates = JSON.parse(localStorage.getItem('pendingMealPlanUpdates') || '[]');
        pendingUpdates.push({
          timestamp: new Date().toISOString(),
          data: data
        });
        localStorage.setItem('pendingMealPlanUpdates', JSON.stringify(pendingUpdates));
        console.log("Saved update request to localStorage as backup");
      }
      
      // Try using PUT method which might avoid some CORS issues
      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'PUT',  // Try PUT instead of POST
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        console.log("Update succeeded");
        
        // Clear this update from localStorage on success
        if (typeof window !== 'undefined') {
          const pendingUpdates = JSON.parse(localStorage.getItem('pendingMealPlanUpdates') || '[]');
          // Remove the most recent update (which just succeeded)
          if (pendingUpdates.length > 0) {
            pendingUpdates.pop();
            localStorage.setItem('pendingMealPlanUpdates', JSON.stringify(pendingUpdates));
          }
        }
        
        try {
          return await response.json();
        } catch (jsonError) {
          console.log("Response was not JSON, returning empty object");
          return {};
        }
      } else {
        const errorText = await response.text();
        console.error(`Request failed with status ${response.status}: ${errorText}`);
        throw new Error(`Request failed with status ${response.status}`);
      }
    } catch (error) {
      console.error(`updateMealPlan failed: ${error.message}`);
      // Don't remove from localStorage on failure - it will be retried later
      throw error;
    }
  };
  
  return { 
    makeAuthenticatedRequest,
    updateMealPlan
  };
}