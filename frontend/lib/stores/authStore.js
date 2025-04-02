"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect } from "react";

/**
 * Token validation utility to check if a JWT is still valid
 * @param {string} token The JWT token to validate
 * @returns {boolean} Whether the token is valid
 */
const isTokenValid = (token) => {
  if (!token) return false;
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;
    
    const expiryTime = payload.exp * 1000;
    return expiryTime > (Date.now() + 300000); // Valid if expires in more than 5 min
  } catch (e) {
    console.error("Error validating token:", e);
    return false;
  }
};

/**
 * Main auth store using Zustand with persistence
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      // State slice
      user: null,
      userId: null,
      accessToken: null,
      isPro: false,
      isAuthenticated: false,
      isInitialized: false,
      
      // Actions
      setUser: (user) => {
        if (!user) {
          // Handle logout
          set({
            user: null,
            userId: null,
            isAuthenticated: false
          });
          
          // Clear browser state for compatibility
          if (typeof window !== 'undefined') {
            window.userId = null;
          }
          return;
        }
        
        // Handle login
        set({
          user,
          userId: user.sub,
          isAuthenticated: true,
          isInitialized: true
        });
        
        // Set global state for compatibility
        if (typeof window !== 'undefined') {
          window.userId = user.sub;
        }
        
        // Check for special user (always pro)
        if (user.sub === "auth0|67b82eb657e61f81cdfdd503" || 
            user.sub === "google-oauth2|100398622971971910131") {
          set({ isPro: true });
          
          if (typeof window !== 'undefined') {
            localStorage.setItem('userIsPro', 'true');
            window.specialProUser = true;
          }
        }
      },
      
      setToken: (token) => {
        if (!token) return;
        
        // Update store
        set({ accessToken: token });
        
        // Update storage for compatibility
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('accessToken', token);
            localStorage.setItem('accessToken', token);
            window.__auth0_token = token;
            window.latestAuthToken = token;
          } catch (err) {
            console.warn("Error saving token to storage:", err);
          }
        }
        
        // Check for subscription in token
        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          const userSubscription = payload?.["https://dev-rw8ff6vxgb7t0i4c.us.auth0.com/app_metadata"]?.subscription;
          
          if (userSubscription === "pro") {
            set({ isPro: true });
            
            if (typeof window !== 'undefined') {
              localStorage.setItem('userIsPro', 'true');
            }
          }
        } catch (error) {
          console.error('Error parsing token:', error);
        }
      },
      
      getToken: () => {
        // First try token from state
        if (get().accessToken && isTokenValid(get().accessToken)) {
          return get().accessToken;
        }
        
        // Then try sessionStorage (faster)
        if (typeof window !== 'undefined') {
          const sessionToken = sessionStorage.getItem('accessToken');
          if (sessionToken && isTokenValid(sessionToken)) {
            get().setToken(sessionToken);
            return sessionToken;
          }
          
          // Then try localStorage
          const localToken = localStorage.getItem('accessToken');
          if (localToken && isTokenValid(localToken)) {
            get().setToken(localToken);
            return localToken;
          }
        }
        
        // Fall back to potentially expired token
        return get().accessToken;
      },
      
      getAuthHeaders: () => {
        const headers = {};
        
        if (get().userId) {
          headers['user-id'] = get().userId;
        }
        
        const token = get().getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
      },
      
      reset: () => {
        set({
          user: null,
          userId: null,
          accessToken: null,
          isPro: false,
          isAuthenticated: false,
        });
        
        // Clear storage for compatibility
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          sessionStorage.removeItem('accessToken');
          window.__auth0_token = null;
          window.latestAuthToken = null;
          window.userId = null;
        }
      }
    }),
    {
      name: "grovli-auth",
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? localStorage : null)),
      partialize: (state) => ({
        accessToken: state.accessToken,
        userId: state.userId,
        isPro: state.isPro,
      }),
      // SSR-specific config
      skipHydration: true,
    }
  )
);

/**
 * Function to manually synchronize with session storage
 * This runs client-side only
 */
const syncWithSessionStorage = () => {
  if (typeof window === 'undefined') return;
  
  try {
    const token = sessionStorage.getItem('accessToken');
    if (token) {
      useAuthStore.getState().setToken(token);
    }
  } catch (e) {
    console.error("Error syncing with session storage:", e);
  }
};

/**
 * For managing auth manually (login/signup pages can call this)
 * @param {Object} user The user object from Auth0
 * @param {string} token Optional token from Auth0
 */
export const updateAuthStore = (user, token) => {
  useAuthStore.getState().setUser(user);
  if (token) {
    useAuthStore.getState().setToken(token);
  }
};

/**
 * SSR-safe utility for direct state access when hooks can't be used
 * This is the recommended pattern for accessing Zustand in non-React contexts
 * @returns The auth state object with convenience methods
 */
export const getAuthState = () => {
  try {
    return {
      ...useAuthStore.getState(),
      getAuthToken: useAuthStore.getState().getToken,
      getAuthHeaders: useAuthStore.getState().getAuthHeaders
    };
  } catch (e) {
    // Return empty state for SSR
    return {
      user: null,
      userId: null,
      isPro: false,
      isAuthenticated: false,
      isLoading: false,
      getAuthToken: () => null,
      getAuthHeaders: () => ({})
    };
  }
};

/**
 * React hook for consuming auth state in components
 * Uses Zustand directly with no provider needed
 * @returns The auth state object with convenience methods
 */
export const useAuth = () => {
  // Use Zustand store directly - it handles subscriptions internally
  const state = useAuthStore();
  
  // Hydrate on mount (client-side only)
  useEffect(() => {
    // This is safe because useEffect only runs client-side
    useAuthStore.persist.rehydrate();
    // Also sync with session storage
    syncWithSessionStorage();
  }, []);
  
  // Add convenience methods/properties
  return {
    ...state,
    isLoading: false,
    getAuthToken: state.getToken,
    getAuthHeaders: state.getAuthHeaders
  };
};