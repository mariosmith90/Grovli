"use client";

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect } from 'react';

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

// Create the preload store
export const usePreloadStore = create(
  persist(
    (set, get) => ({
      // Core state
      isInitialized: false,
      preloadedRoutes: [],
      preloadedAssets: [],
      preloadedData: [],
      loadingStartTime: null,
      
      // Status tracking
      status: {
        lastUpdated: null,
        lastAction: null,
        isPreloading: false
      },
      
      // Utility actions
      actions: {
        // Log an action (useful for debugging)
        logAction: (actionName, data) => {
          const now = new Date().toISOString();
          console.log(`[PreloadStore] ${actionName}${data ? `: ${JSON.stringify(data)}` : ''} at ${now}`);
          
          set({ 
            status: {
              ...get().status,
              lastUpdated: now,
              lastAction: actionName
            }
          });
        },
        
        // Check if a route has been preloaded
        isRoutePreloaded: (route) => {
          return get().preloadedRoutes.includes(route);
        },
        
        // Check if an asset has been preloaded
        isAssetPreloaded: (assetUrl) => {
          return get().preloadedAssets.includes(assetUrl);
        },
        
        // Check if API data has been preloaded
        isDataPreloaded: (dataKey) => {
          return get().preloadedData.includes(dataKey);
        }
      },
      
      // Initialize the preloader
      initializePreloader: () => {
        if (get().isInitialized || !isClient) return;
        
        get().actions.logAction('initializePreloader');
        
        set({ 
          isInitialized: true,
          status: {
            ...get().status,
            lastUpdated: new Date().toISOString(),
          }
        });
      },
      
      // Core preloading functions
      
      // Preload a specific route using Next.js router
      preloadRoute: async (route) => {
        if (!isClient || get().actions.isRoutePreloaded(route)) return;
        
        get().actions.logAction('preloadRoute', { route });
        
        try {
          // Dynamically import the router to avoid SSR issues
          const router = await import('next/router').then(mod => mod.default);
          router.prefetch(route);
          
          // Mark as preloaded
          set({ 
            preloadedRoutes: [...get().preloadedRoutes, route],
            status: {
              ...get().status,
              lastUpdated: new Date().toISOString(),
            }
          });
          
          return true;
        } catch (error) {
          console.error(`Error preloading route ${route}:`, error);
          return false;
        }
      },
      
      // Preload an image or other asset
      preloadAsset: (assetUrl) => {
        if (!isClient || get().actions.isAssetPreloaded(assetUrl)) return;
        
        get().actions.logAction('preloadAsset', { assetUrl });
        
        try {
          // For images
          if (assetUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
            const img = new Image();
            img.src = assetUrl;
          } 
          // For other assets, could use fetch with no-store
          else {
            fetch(assetUrl, { cache: 'no-store' })
              .catch(err => console.warn(`Preload fetch for ${assetUrl} failed silently`, err));
          }
          
          // Mark as preloaded immediately (don't wait for completion)
          set({ 
            preloadedAssets: [...get().preloadedAssets, assetUrl],
            status: {
              ...get().status,
              lastUpdated: new Date().toISOString(),
            }
          });
          
          return true;
        } catch (error) {
          console.error(`Error preloading asset ${assetUrl}:`, error);
          return false;
        }
      },
      
      // Preload API data (similar to React Query prefetching)
      preloadApiData: async (dataKey, apiEndpoint, options = {}) => {
        if (!isClient || get().actions.isDataPreloaded(dataKey)) return;
        
        get().actions.logAction('preloadApiData', { dataKey, apiEndpoint });
        
        try {
          // Start the fetch but don't await it - we just want it in flight
          fetch(apiEndpoint, {
            ...options,
            headers: {
              ...options.headers,
              'Purpose': 'prefetch'
            }
          })
          .then(response => {
            // Store in a cache if needed (could add a caching layer here)
            if (response.ok) {
              // You could store the response data in the store if needed
              console.log(`Preloaded API data for ${dataKey}`);
            }
          })
          .catch(err => console.warn(`Preload API fetch for ${dataKey} failed silently`, err));
          
          // Mark as preloaded immediately (don't wait for completion)
          set({ 
            preloadedData: [...get().preloadedData, dataKey],
            status: {
              ...get().status,
              lastUpdated: new Date().toISOString(),
            }
          });
          
          return true;
        } catch (error) {
          console.error(`Error preloading API data ${dataKey}:`, error);
          return false;
        }
      },
      
      // Composite actions
      
      // Start preloading all essential content
      startPreloading: async (userId, authToken) => {
        if (!isClient) return;
        
        get().actions.logAction('startPreloading', { userId });
        
        set({
          loadingStartTime: new Date().toISOString(),
          status: {
            ...get().status,
            isPreloading: true,
            lastUpdated: new Date().toISOString(),
          }
        });
        
        // 1. Preload all essential routes in parallel
        ESSENTIAL_ROUTES.forEach(route => {
          get().preloadRoute(route);
        });
        
        // 2. Preload assets in parallel
        ESSENTIAL_ASSETS.forEach(asset => {
          get().preloadAsset(asset);
        });
        
        // 3. Preload API data if we have auth info
        if (userId && authToken) {
          // Common data needed across pages
          get().preloadApiData('userProfile', `/api/user_profile/${userId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          
          get().preloadApiData('savedRecipes', '/api/user_recipes', {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          
          get().preloadApiData('userPantry', '/api/user_pantry', {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          
          // Import the usePreload hook to access the enhanced profile data preloading
          // This special import is needed to avoid circular dependencies
          import('../../hooks/usePreload').then(module => {
            const { usePreload } = module;
            const preloadHook = usePreload();
            
            // Trigger enhanced profile data preloading which includes meal details
            console.log("[preloadStore] Triggering enhanced profile data preload");
            preloadHook.profileData().catch(err => 
              console.warn("[preloadStore] Error in enhanced profile preloading:", err)
            );
          }).catch(err => 
            console.warn("[preloadStore] Could not import usePreload:", err)
          );
        }
        
        // Mark preloading as complete
        setTimeout(() => {
          set({
            status: {
              ...get().status,
              isPreloading: false,
              lastUpdated: new Date().toISOString(),
              lastAction: 'preloadingComplete'
            }
          });
        }, 2000); // Add a small delay to ensure preloading requests have time to start
        
        return true;
      },
      
      // Preload assets needed during login (call this as early as possible)
      preloadLoginAssets: () => {
        if (!isClient) return;
        
        get().actions.logAction('preloadLoginAssets');
        
        // Preload assets needed right after login
        ['/logo.png', '/images/homepage.jpeg'].forEach(asset => {
          get().preloadAsset(asset);
        });
        
        return true;
      },
      
      // Reset preload state
      resetPreloadState: () => {
        get().actions.logAction('resetPreloadState');
        
        set({
          preloadedRoutes: [],
          preloadedAssets: [],
          preloadedData: [],
          loadingStartTime: null,
          status: {
            lastUpdated: new Date().toISOString(),
            lastAction: 'reset',
            isPreloading: false
          }
        });
      }
    }),
    {
      name: 'grovli-preload',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? localStorage : null)),
      skipHydration: true,
      partialize: (state) => ({
        isInitialized: state.isInitialized,
        preloadedRoutes: state.preloadedRoutes,
        preloadedAssets: state.preloadedAssets,
        preloadedData: state.preloadedData,
      }),
      version: 1
    }
  )
);

// Hook for components to access preload state
export const usePreloader = () => {
  const preloadStore = usePreloadStore();
  
  // Hydrate on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      usePreloadStore.persist.rehydrate();
    }
  }, []);
  
  return {
    isInitialized: preloadStore.isInitialized,
    isPreloading: preloadStore.status.isPreloading,
    preloadRoute: preloadStore.preloadRoute,
    preloadAsset: preloadStore.preloadAsset,
    preloadApiData: preloadStore.preloadApiData,
    startPreloading: preloadStore.startPreloading,
    preloadLoginAssets: preloadStore.preloadLoginAssets,
    resetPreloadState: preloadStore.resetPreloadState,
  };
};

// Direct state access (for non-React contexts)
export const getPreloadState = () => {
  if (typeof window === 'undefined') {
    return {
      isInitialized: false,
      isPreloading: false,
      preloadedRoutes: [],
      preloadedAssets: [],
      preloadedData: [],
    };
  }
  
  return usePreloadStore.getState();
};