"use client";
import { createContext, useContext, useState, useEffect } from 'react';
import { useUser } from '@auth0/nextjs-auth0';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Get user from Auth0 SDK
  const { user, error, isLoading, accessToken: userToken } = useUser();
  const isAuthenticated = !!user;
  
  // Basic auth state
  const [userId, setUserId] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Initialize auth state
  useEffect(() => {
    if (isLoading) return;
    
    // Clear state if user is not logged in
    if (!user) {
      setUserId(null);
      setAccessToken(null);
      setIsPro(false);
      setIsInitialized(true);
      
      if (typeof window !== 'undefined') {
        // Clean up all auth-related storage
        localStorage.removeItem('accessToken');
        localStorage.removeItem('grovli_auth');
        window.__auth0_token = null;
        window.latestAuthToken = null;
        window.userId = null;
      }
      
      return;
    }
    
    // User is logged in
    setUserId(user.sub);
    console.log("User logged in:", user.sub);
    
    // Cache token if available and use our centralized token storage
    if (userToken) {
      console.log("AuthContext init: User token available from Auth0");
      // Use our helper to store token in all locations
      saveTokenEverywhere(userToken);
      
      try {
        // Parse token for user info
        const tokenPayload = JSON.parse(atob(userToken.split(".")[1]));
        
        // Check for pro subscription
        const userSubscription = tokenPayload?.["https://dev-rw8ff6vxgb7t0i4c.us.auth0.com/app_metadata"]?.subscription;
        const proStatus = userSubscription === "pro";
        
        // Special user check (always pro)
        const isSpecialUser = user.sub === "auth0|67b82eb657e61f81cdfdd503";
        
        // Set pro status
        if (proStatus || isSpecialUser) {
          setIsPro(true);
          
          if (typeof window !== 'undefined') {
            localStorage.setItem('userIsPro', 'true');
            
            if (isSpecialUser) {
              window.specialProUser = true;
            }
          }
        }
      } catch (error) {
        console.error('Error parsing token:', error);
      }
    } else {
      console.log("AuthContext init: No user token available from Auth0");
    }
    
    // Set user id in window
    if (typeof window !== 'undefined') {
      window.userId = user.sub;
    }
    
    setIsInitialized(true);
  }, [user, isLoading, userToken]);
  
  // This is a utility function to validate and check expiration of JWT tokens
  const isTokenValid = (token) => {
    if (!token) return false;
    
    try {
      // Parse the token payload
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      const payload = JSON.parse(atob(parts[1]));
      
      // Check if token has an expiration claim
      if (!payload.exp) return false;
      
      // Check if token has expired or will expire soon (within 5 minutes)
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
    
    // Update state
    setAccessToken(token);
    
    // Update browser storage
    if (typeof window !== 'undefined') {
      window.__auth0_token = token;
      localStorage.setItem('accessToken', token);
      
      // This helps other components access the token before context is ready
      window.latestAuthToken = token;
    }
    
    // Log for debugging
    console.log("Token saved to all storage locations");
  };
  
  // Function to get the current token with refresh attempt
  const getAuthToken = async () => {
    console.log("AuthContext.getAuthToken called");
    
    // STRATEGY 1: First try the token from Auth0 SDK
    if (userToken && isTokenValid(userToken)) {
      console.log("Using fresh token from Auth0 SDK");
      saveTokenEverywhere(userToken);
      return userToken;
    }
    
    // STRATEGY 2: Check our current state token
    if (accessToken && isTokenValid(accessToken)) {
      console.log("Using valid token from AuthContext state");
      return accessToken;
    }
    
    // STRATEGY 3: Try browser-level storage
    if (typeof window !== 'undefined') {
      // Try window.__auth0_token
      if (window.__auth0_token && isTokenValid(window.__auth0_token)) {
        console.log("Using valid token from window.__auth0_token");
        saveTokenEverywhere(window.__auth0_token);
        return window.__auth0_token;
      }
      
      // Try localStorage
      const storedToken = localStorage.getItem('accessToken');
      if (storedToken && isTokenValid(storedToken)) {
        console.log("Using valid token from localStorage");
        saveTokenEverywhere(storedToken);
        return storedToken;
      }
    }
    
    // STRATEGY 4: Since no valid token was found, return whatever token we have
    // (even if expired) and let the API service handle refresh
    if (userToken) {
      console.log("Using potentially expired token from Auth0 SDK");
      saveTokenEverywhere(userToken);
      return userToken;
    }
    
    if (accessToken) {
      console.log("Using potentially expired token from context state");
      return accessToken;
    }
    
    if (typeof window !== 'undefined') {
      if (window.__auth0_token) {
        console.log("Using potentially expired token from window.__auth0_token");
        return window.__auth0_token;
      }
      
      const storedToken = localStorage.getItem('accessToken');
      if (storedToken) {
        console.log("Using potentially expired token from localStorage");
        return storedToken;
      }
    }
    
    console.log("No token available from any source");
    return null;
  };
  
  // Helper to create auth headers
  const getAuthHeaders = async () => {
    const headers = {};
    
    if (userId) {
      headers['user-id'] = userId;
    }
    
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  };
  
  // Value to be provided by the context
  const value = {
    userId,
    accessToken,
    isPro,
    isInitialized,
    isLoading,
    isAuthenticated,
    user,
    error,
    getAuthToken,
    getAuthHeaders
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};