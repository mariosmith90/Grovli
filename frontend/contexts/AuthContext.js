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
        localStorage.removeItem('grovli_auth');
        window.userId = null;
      }
      
      return;
    }
    
    // User is logged in
    setUserId(user.sub);
    
    // Cache token if available
    if (userToken) {
      setAccessToken(userToken);
      
      if (typeof window !== 'undefined') {
        window.__auth0_token = userToken;
      }
      
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
    }
    
    // Set user id in window
    if (typeof window !== 'undefined') {
      window.userId = user.sub;
    }
    
    setIsInitialized(true);
  }, [user, isLoading, userToken]);
  
  // Function to get the current token
  const getAuthToken = async () => {
    // If we already have a token, return it
    if (accessToken) {
      return accessToken;
    }
    
    // If we have a token in the window, use that
    if (typeof window !== 'undefined' && window.__auth0_token) {
      setAccessToken(window.__auth0_token);
      return window.__auth0_token;
    }
    
    // No token available
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