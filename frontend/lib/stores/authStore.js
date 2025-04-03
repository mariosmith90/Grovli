"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
// Default routes that should be preloaded
const ESSENTIAL_ROUTES = ['/profile', '/meals', '/planner', '/pantry', '/saved-meals', '/settings'];

// Assets that should be preloaded
const ESSENTIAL_ASSETS = [
  '/logo.png', 
  '/images/meals/breakfast.jpg',
  '/images/meals/lunch.jpg',
  '/images/meals/dinner.jpg',
  '/images/cuisines/american.jpg',
  '/images/cuisines/mediterranean.jpg'
];

// Utility to check if we're on the client
const isClient = typeof window !== 'undefined';

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
      
      // Preloading state
      preloadingState: {
        preloadedRoutes: [],
        preloadedAssets: [],
        preloadedData: [],
        isPreloading: false,
        lastPreloadTime: null,
      },
      
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
          if (isClient) {
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
        if (isClient) {
          window.userId = user.sub;
        }
        
        // Start preloading as soon as user is set
        get().startPreloading();
        
        // Check for special user (always pro)
        if (user.sub === "auth0|67b82eb657e61f81cdfdd503" || 
            user.sub === "google-oauth2|100398622971971910131") {
          set({ isPro: true });
          
          if (isClient) {
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
        if (isClient) {
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
            
            if (isClient) {
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
        if (isClient) {
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
        if (isClient) {
          localStorage.removeItem('accessToken');
          sessionStorage.removeItem('accessToken');
          window.__auth0_token = null;
          window.latestAuthToken = null;
          window.userId = null;
        }
      },
      
      // Preloading functions
      preloadRoute: (route) => {
        if (!isClient || get().preloadingState.preloadedRoutes.includes(route)) return;
        
        console.log(`[AuthStore] Preloading route: ${route}`);
        
        // Dynamic import to avoid SSR issues
        import('next/router').then(({ default: router }) => {
          router.prefetch(route);
        }).catch(err => {
          console.warn(`Failed to preload route ${route}:`, err);
        });
        
        set({
          preloadingState: {
            ...get().preloadingState,
            preloadedRoutes: [...get().preloadingState.preloadedRoutes, route]
          }
        });
      },
      
      preloadAsset: (assetUrl) => {
        if (!isClient || get().preloadingState.preloadedAssets.includes(assetUrl)) return;
        
        console.log(`[AuthStore] Preloading asset: ${assetUrl}`);
        
        try {
          // For images
          if (assetUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
            const img = new Image();
            img.src = assetUrl;
          } 
          // For other assets
          else {
            fetch(assetUrl, { cache: 'no-store' })
              .catch(err => console.warn(`Preload fetch for ${assetUrl} failed silently`, err));
          }
          
          set({
            preloadingState: {
              ...get().preloadingState,
              preloadedAssets: [...get().preloadingState.preloadedAssets, assetUrl]
            }
          });
        } catch (error) {
          console.warn(`Error preloading asset ${assetUrl}:`, error);
        }
      },
      
      preloadApiData: async (dataKey, apiEndpoint, options = {}) => {
        if (!isClient || get().preloadingState.preloadedData.includes(dataKey)) return;
        
        console.log(`[AuthStore] Preloading API data: ${dataKey}`);
        
        try {
          // Get auth headers if none provided
          if (!options.headers) {
            options.headers = get().getAuthHeaders();
          }
          
          // Start fetch but don't await - we just want it in flight
          fetch(apiEndpoint, {
            ...options,
            headers: {
              ...options.headers,
              'Purpose': 'prefetch'
            }
          }).catch(err => console.warn(`Preload API fetch for ${dataKey} failed:`, err));
          
          set({
            preloadingState: {
              ...get().preloadingState,
              preloadedData: [...get().preloadingState.preloadedData, dataKey]
            }
          });
        } catch (error) {
          console.warn(`Error preloading API data ${dataKey}:`, error);
        }
      },
      
      startPreloading: () => {
        if (!isClient || get().preloadingState.isPreloading) return;
        
        const userId = get().userId;
        const token = get().getToken();
        
        console.log(`[AuthStore] Starting preloading for user: ${userId}`);
        
        set({
          preloadingState: {
            ...get().preloadingState,
            isPreloading: true,
            lastPreloadTime: new Date().toISOString()
          }
        });
        
        // Preload routes
        ESSENTIAL_ROUTES.forEach(route => {
          get().preloadRoute(route);
        });
        
        // Preload assets
        ESSENTIAL_ASSETS.forEach(asset => {
          get().preloadAsset(asset);
        });
        
        // Preload API data if authenticated - prioritizing profile data
        if (userId && token) {
          // Preload profile data first - this is needed for the profile page
          get().preloadApiData('userProfile', `/api/user_profile/${userId}`);
          
          // Preload meal plans specifically to eliminate the 2-second wait
          get().preloadApiData('userMealPlans', '/api/user_plans');
          
          // Preload additional user data needed for various pages
          get().preloadApiData('savedRecipes', '/api/user_recipes');
          get().preloadApiData('userPantry', '/api/user_pantry');
          get().preloadApiData('savedMeals', '/api/user_saved_meals');
          
          // Fetch any active meal plans - this is what causes the 2-second wait on profile page
          fetch(`/api/user_plans/active`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'user-id': userId,
              'Purpose': 'prefetch'
            }
          }).catch(err => console.warn('Prefetch of active meal plans failed silently', err));
          
          console.log("[AuthStore] Preloading profile data and meal plans for immediate access");
        }
        
        // Mark preloading as complete after a short delay
        setTimeout(() => {
          set({
            preloadingState: {
              ...get().preloadingState,
              isPreloading: false
            }
          });
          console.log(`[AuthStore] Preloading completed`);
        }, 2000);
      }
    }),
    {
      name: "grovli-auth",
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? localStorage : null)),
      partialize: (state) => ({
        accessToken: state.accessToken,
        userId: state.userId,
        isPro: state.isPro,
        // Include our preloading state
        preloadingState: {
          preloadedRoutes: state.preloadingState.preloadedRoutes,
          preloadedAssets: state.preloadingState.preloadedAssets,
          preloadedData: state.preloadingState.preloadedData,
        }
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
  const router = useRouter();
  
  // Hydrate on mount (client-side only)
  useEffect(() => {
    // This is safe because useEffect only runs client-side
    useAuthStore.persist.rehydrate();
    // Also sync with session storage
    syncWithSessionStorage();
    
    // Start preloading critical assets before authentication
    if (typeof window !== 'undefined' && !state.isAuthenticated) {
      // Preload login-related assets while user is typing credentials
      state.preloadAsset('/logo.png');
      state.preloadAsset('/images/homepage.jpeg');
    }
  }, []);
  
  // Effect to initiate preloading when auth state changes
  useEffect(() => {
    if (state.isAuthenticated && state.userId && !state.preloadingState.isPreloading) {
      state.startPreloading();
    }
  }, [state.isAuthenticated, state.userId]);
  
  // Add convenience methods/properties
  return {
    ...state,
    isLoading: false,
    getAuthToken: state.getToken,
    getAuthHeaders: state.getAuthHeaders,
    // Preloading-specific methods
    preload: {
      routes: state.preloadRoute,
      assets: state.preloadAsset,
      api: state.preloadApiData,
      start: state.startPreloading,
      isActive: state.preloadingState.isPreloading,
      preloadedRoutes: state.preloadingState.preloadedRoutes,
      preloadedAssets: state.preloadingState.preloadedAssets,
      preloadedData: state.preloadingState.preloadedData,
    }
  };
};