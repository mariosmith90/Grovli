"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../stores/authStore';

/**
 * Custom hook for preloading assets, routes, and API data.
 * This provides a simple interface to preload content from any component.
 * 
 * Usage:
 * const preload = usePreload();
 * 
 * // Preload a route
 * preload.route('/some-path');
 * 
 * // Preload multiple assets
 * preload.assets(['/image1.jpg', '/image2.jpg']);
 * 
 * // Preload API data
 * preload.api('userData', '/api/user/123');
 */
export function usePreload() {
  const pathname = usePathname();
  const store = useAuthStore();
  
  // Preload assets for the current route on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Get route-specific assets to preload
    const routeAssets = getAssetsForRoute(pathname);
    if (routeAssets.length > 0) {
      console.log(`[usePreload] Preloading ${routeAssets.length} assets for route ${pathname}`);
      routeAssets.forEach(asset => {
        store.preloadAsset(asset);
      });
    }
    
    // Get routes to preload based on current route
    const relatedRoutes = getRelatedRoutes(pathname);
    if (relatedRoutes.length > 0) {
      console.log(`[usePreload] Preloading ${relatedRoutes.length} related routes for ${pathname}`);
      relatedRoutes.forEach(route => {
        store.preloadRoute(route);
      });
    }
  }, [pathname]);
  
  return {
    // Preload a specific route
    route: (route) => {
      store.preloadRoute(route);
    },
    
    // Preload multiple routes
    routes: (routes) => {
      if (Array.isArray(routes)) {
        routes.forEach(route => store.preloadRoute(route));
      }
    },
    
    // Preload a single asset
    asset: (assetUrl) => {
      store.preloadAsset(assetUrl);
    },
    
    // Preload multiple assets
    assets: (assetUrls) => {
      if (Array.isArray(assetUrls)) {
        assetUrls.forEach(asset => store.preloadAsset(asset));
      }
    },
    
    // Preload API data
    api: (dataKey, apiEndpoint, options) => {
      store.preloadApiData(dataKey, apiEndpoint, options);
    },
    
    // Enhanced profileData preload - using optimized browser-side caching
    profileData: async () => {
      const userId = store.userId;
      const token = store.getToken();
      
      if (!userId || !token) return;
      
      console.log("[usePreload] Preloading profile page data with browser-side caching");
      
      // Check if we already have a valid cached version first
      if (typeof window !== 'undefined') {
        const preloadTimestamp = localStorage.getItem('grovli_profile_preload_timestamp');
        const pageLoadTimestamp = sessionStorage.getItem('grovli_page_load_timestamp');
        const now = Date.now();
        
        // Detect page reload by comparing sessionStorage timestamp with current time
        // SessionStorage is cleared on page reload, so if it's missing or recent, it's a fresh page load
        const isPageReload = !pageLoadTimestamp || (now - parseInt(pageLoadTimestamp, 10) < 2000);
        
        // Update page load timestamp for future reference
        sessionStorage.setItem('grovli_page_load_timestamp', now.toString());
        
        // If page was reloaded, force a fresh preload regardless of timestamp
        if (isPageReload) {
          console.log("[usePreload] Page reload detected, forcing fresh preload");
        }
        // If it wasn't a reload and we've preloaded within the last 5 minutes, use cached data
        else if (preloadTimestamp && (now - parseInt(preloadTimestamp, 10)) < 5 * 60 * 1000) {
          console.log("[usePreload] Using recently preloaded profile data (< 5 minutes ago)");
          return;
        }
        
        // Set timestamp to indicate we're preloading now
        localStorage.setItem('grovli_profile_preload_timestamp', now.toString());
      }
      
      try {
        // Import the API service
        let apiService;
        try {
          // Dynamic import to avoid circular dependency
          const { useApiService } = await import('../api-service');
          apiService = useApiService();
        } catch (importError) {
          console.error('[usePreload] Failed to import API service:', importError);
          return;
        }
        
        // We'll use parallel requests instead of server-side prefetching
        console.log('[usePreload] Starting parallel client-side preloading');
        
        // Trigger multiple client-side preloads in parallel to populate browser caches
        const preloadPromises = [
          // Preload the user profile
          store.preloadApiData('userProfile', `/api/user-profile/${userId}`),
          
          // Preload user's meal plans
          store.preloadApiData('userMealPlans', '/api/user-plans'),
          
          // Preload user's meal completions for today
          (async () => {
            const today = new Date().toISOString().split('T')[0];
            return store.preloadApiData(
              'mealCompletions', 
              `/user-profile/meal-completion/${userId}/${today}`
            );
          })(),
          
          // Preload user settings
          store.preloadApiData('userSettings', `/user-settings/${userId}`)
        ];
        
        // Wait for all preloads to complete
        await Promise.allSettled(preloadPromises);
        
        console.log('[usePreload] Client-side preloading completed');
        return true;
      } catch (error) {
        console.warn('[usePreload] Profile data prefetch failed:', error);
        return false;
      }
    },
    
    // Pantry data preload - using optimized browser-side caching
    pantryData: async () => {
      const userId = store.userId;
      const token = store.getToken();
      
      if (!userId || !token) return;
      
      console.log("[usePreload] Preloading pantry page data with browser-side caching");
      
      // Check if we already have a valid cached version first
      if (typeof window !== 'undefined') {
        const preloadTimestamp = localStorage.getItem('grovli_pantry_preload_timestamp');
        const pageLoadTimestamp = sessionStorage.getItem('grovli_page_load_timestamp');
        const now = Date.now();
        
        // Detect page reload by comparing sessionStorage timestamp with current time
        const isPageReload = !pageLoadTimestamp || (now - parseInt(pageLoadTimestamp, 10) < 2000);
        
        // Update page load timestamp for future reference
        sessionStorage.setItem('grovli_page_load_timestamp', now.toString());
        
        // If page was reloaded, force a fresh preload regardless of timestamp
        if (isPageReload) {
          console.log("[usePreload] Page reload detected, forcing fresh pantry preload");
        }
        // If it wasn't a reload and we've preloaded within the last 5 minutes, use cached data
        else if (preloadTimestamp && (now - parseInt(preloadTimestamp, 10)) < 5 * 60 * 1000) {
          console.log("[usePreload] Using recently preloaded pantry data (< 5 minutes ago)");
          return;
        }
        
        // Set timestamp to indicate we're preloading now
        localStorage.setItem('grovli_pantry_preload_timestamp', now.toString());
      }
      
      try {
        // We'll use parallel requests instead of server-side prefetching
        console.log('[usePreload] Starting parallel client-side pantry preloading');
        
        // Try to import pantry store
        let pantryStore;
        try {
          const { getPantryState } = await import('../stores/pantryStore');
          pantryStore = getPantryState();
        } catch (importError) {
          console.error('[usePreload] Failed to import pantry store:', importError);
        }
        
        // Trigger preload using the API endpoint
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        
        // First, direct API preload
        await store.preloadApiData('userPantry', `${apiUrl}/api/user-pantry/items`);
        
        // Then try to update the pantry store data if available
        if (pantryStore && typeof pantryStore.fetchPantryItems === 'function') {
          console.log('[usePreload] Using pantry store to preload data');
          try {
            await pantryStore.fetchPantryItems();
            console.log('[usePreload] Pantry store data successfully preloaded');
          } catch (pantryError) {
            console.warn('[usePreload] Failed to update pantry store:', pantryError);
          }
        }
        
        console.log('[usePreload] Pantry data preloading completed');
        return true;
      } catch (error) {
        console.warn('[usePreload] Pantry data prefetch failed:', error);
        return false;
      }
    },
    
    // Get the current preloading state
    get state() {
      return {
        preloadedRoutes: store.preloadingState.preloadedRoutes || [],
        preloadedAssets: store.preloadingState.preloadedAssets || [],
        preloadedData: store.preloadingState.preloadedData || [],
        isPreloading: store.preloadingState.isPreloading || false,
      };
    }
  };
}

/**
 * Helper function to get common assets for a specific route
 */
function getAssetsForRoute(route) {
  const routeAssets = {
    '/meals': [
      '/images/meals/breakfast.jpg',
      '/images/meals/lunch.jpg', 
      '/images/meals/dinner.jpg',
      '/images/cuisines/american.jpg',
      '/images/cuisines/mediterranean.jpg'
    ],
    '/profile': [
      '/images/meals/breakfast.jpg',
      '/images/meals/lunch.jpg',
      '/images/meals/dinner.jpg'
    ],
    '/pantry': [
      '/images/apple.jpg'
    ],
    '/planner': [
      '/images/meals/full-day.jpg'
    ],
    '/saved-meals': [
      '/images/chicken-salad.jpg',
      '/images/salmon.jpg'
    ]
  };
  
  // Check if we have predefined assets for this route
  return routeAssets[route] || [];
}

/**
 * Helper function to get related routes for the current route
 */
function getRelatedRoutes(route) {
  const relatedRoutes = {
    '/meals': ['/profile', '/planner', '/recipes'],
    '/profile': ['/meals', '/saved-meals', '/settings'],
    '/pantry': ['/meals', '/recipes'],
    '/planner': ['/meals', '/profile'],
    '/saved-meals': ['/meals', '/recipes']
  };
  
  // Return related routes or empty array
  return relatedRoutes[route] || [];
}