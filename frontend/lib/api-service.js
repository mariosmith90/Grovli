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
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
          ...(options.headers || {})
        }
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
      const response = await fetch(`${apiUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...(options.headers || {})
        }
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
      
      const response = await fetch(`${apiUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...(options.headers || {})
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error ${response.status}: ${errorText}`);
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
  
  return { makeAuthenticatedRequest };
}