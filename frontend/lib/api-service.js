"use client";
import { useAuth } from '../contexts/AuthContext';

// Class-based API service for non-hook contexts
export class ApiService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  }

  async makeRequest(endpoint, options = {}) {
    if (!this.accessToken) throw new Error("Access token not available");
    
    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
          ...(options.headers || {})
        }
      });
      
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${error.message}`);
      throw error;
    }
  }
}

// Import the Auth0 function to get a fresh token directly
import { getAccessToken } from "@auth0/nextjs-auth0";

// This is a synced copy of the token validation function from AuthContext
// to avoid circular dependencies
const isTokenValid = (token) => {
  if (!token) return false;
  
  try {
    // Parse the token payload
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const payload = JSON.parse(atob(parts[1]));
    
    // Check if token has an expiration claim
    if (!payload.exp) return false;
    
    // Check if token expires in more than 5 minutes
    const expiryTime = payload.exp * 1000; // Convert to milliseconds
    return expiryTime > (Date.now() + 300000); // Valid if expires in more than 5 minutes
  } catch (e) {
    console.error("Error validating token:", e);
    return false;
  }
};

// Centralized function to save a token to all storage mechanisms
const saveTokenEverywhere = (token) => {
  if (!token) return;
  
  // Update browser storage
  if (typeof window !== 'undefined') {
    window.__auth0_token = token;
    window.latestAuthToken = token;
    localStorage.setItem('accessToken', token);
  }
  
  console.log("API Service: Token saved to all storage locations");
};

// A last-resort function to get a fresh token from Auth0 directly
// Separate from the main flow to avoid recursion issues
const refreshTokenDirectly = async () => {
  try {
    console.log("API Service: Getting fresh token directly from Auth0");
    const auth0Token = await getAccessToken({
      authorizationParams: { audience: "https://grovli.citigrove.com/audience" }
    });
    
    if (auth0Token) {
      console.log("API Service: Got fresh token from Auth0");
      saveTokenEverywhere(auth0Token);
      return auth0Token;
    }
  } catch (error) {
    console.error("API Service: Failed to get fresh token from Auth0", error);
  }
  
  return null;
};

// Hook for component contexts
export function useApiService() {
  const auth = useAuth();
  const getAuthTokenFromContext = auth?.getAuthToken;
  
  // Try to get a token from any available source
  const getBestAvailableToken = async (forceRefresh = false) => {
    // If forceRefresh is true, go straight to Auth0
    if (forceRefresh) {
      const freshToken = await refreshTokenDirectly();
      if (freshToken) return freshToken;
    }
    
    // STRATEGY 1: Try auth context first (most reliable)
    if (getAuthTokenFromContext) {
      try {
        const contextToken = await getAuthTokenFromContext();
        if (contextToken) {
          console.log("API Service: Using token from auth context");
          return contextToken;
        }
      } catch (error) {
        console.error("API Service: Error getting token from context", error);
      }
    }
    
    // STRATEGY 2: Try window/localStorage as fallback
    if (typeof window !== 'undefined') {
      // First try the special latestAuthToken which is always up to date
      if (window.latestAuthToken) {
        console.log("API Service: Using latest token from window.latestAuthToken");
        return window.latestAuthToken;
      }
      
      // Then try window.__auth0_token
      if (window.__auth0_token) {
        console.log("API Service: Using token from window.__auth0_token");
        return window.__auth0_token;
      }
      
      // Finally try localStorage
      const localToken = localStorage.getItem('accessToken');
      if (localToken) {
        console.log("API Service: Using token from localStorage");
        return localToken;
      }
    }
    
    console.log("API Service: No token available from any source");
    return null;
  };
  
  const makeAuthenticatedRequest = async (endpoint, options = {}, retryCount = 0) => {
    // Limit retries to prevent infinite loops
    if (retryCount > 2) {
      throw new Error("API Service: Too many retry attempts");
    }
    
    try {
      // Get the best available token (force refresh on retry)
      const token = await getBestAvailableToken(retryCount > 0);
      
      if (!token) {
        console.error("API Service: No access token available");
        // If we still don't have a token after all attempts, redirect to login
        if (typeof window !== 'undefined') {
          console.log("API Service: No token available, redirecting to login");
          window.location.href = '/auth/login?returnTo=' + window.location.pathname;
          return null;
        }
        throw new Error("No access token available");
      }
      
      // Make the API request
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      console.log(`API Service: Making request to ${apiUrl}${endpoint}`);
      
      const response = await fetch(`${apiUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(options.headers || {})
        }
      });
      
      // Handle unauthorized errors by forcing a token refresh and retrying
      if (response.status === 401) {
        console.log(`API Service: Received 401 for ${endpoint}, retry attempt ${retryCount + 1}`);
        
        // Clear old tokens to force a refresh
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          window.__auth0_token = null;
          window.latestAuthToken = null;
        }
        
        // On first 401, try getting a fresh token from Auth0 directly
        if (retryCount === 0) {
          const freshToken = await refreshTokenDirectly();
          if (freshToken) {
            console.log("API Service: Successfully refreshed token, retrying request");
            return makeAuthenticatedRequest(endpoint, options, retryCount + 1);
          }
        }
        
        // Otherwise retry with whatever token we have
        return makeAuthenticatedRequest(endpoint, options, retryCount + 1);
      }
      
      if (!response.ok) {
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