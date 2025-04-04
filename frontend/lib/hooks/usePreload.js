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
    
    // Enhanced profileData preload - now uses server-side Redis caching
    profileData: async () => {
      const userId = store.userId;
      const token = store.getToken();
      
      if (!userId || !token) return;
      
      console.log("[usePreload] Preloading profile page data with Redis cache");
      
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
        
        // Call the prefetch endpoint - this will trigger server-side Redis caching
        console.log('[usePreload] Calling server-side prefetch endpoint');
        const prefetchResponse = await apiService.prefetchProfileData({
          include_meals: true,
          include_saved_meals: true,
          include_meal_completions: true,
          include_settings: true,
          include_pantry: false
        });
        
        console.log(`[usePreload] Server prefetch initiated with status: ${prefetchResponse.status}`);
        
        // Also trigger client-side preloads in parallel to populate browser-side caches
        store.preloadApiData('userProfile', `/api/user-profile/${userId}`);
        store.preloadApiData('userMealPlans', '/api/user-plans');
        
        // Wait a short time and check if the prefetch is complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          const statusResponse = await apiService.checkPrefetchStatus();
          console.log(`[usePreload] Prefetch status check: ${statusResponse.status}`);
          
          if (statusResponse.status === "complete") {
            console.log('[usePreload] Prefetch completed successfully');
            return true;
          } else if (statusResponse.status === "processing") {
            console.log('[usePreload] Prefetch still processing, will be ready soon');
            return true;
          } else {
            console.warn(`[usePreload] Prefetch status issue: ${statusResponse.message}`);
          }
        } catch (statusError) {
          console.warn('[usePreload] Error checking prefetch status:', statusError);
        }
        
        return true;
      } catch (error) {
        console.warn('[usePreload] Profile data prefetch failed:', error);
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