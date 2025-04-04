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
    
    // Preload profile page data specifically - eliminates the 2-second wait
    profileData: () => {
      const userId = store.userId;
      const token = store.getToken();
      
      if (!userId || !token) return;
      
      console.log("[usePreload] Preloading profile page data");
      
      // These APIs are needed for the profile page
      store.preloadApiData('userProfile', `/api/user-profile/${userId}`);
      store.preloadApiData('userMealPlans', '/api/user-plans');
      
      // This is the specific API that causes the 2-second wait
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      fetch(`${apiUrl}/api/user-plans/user/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'user-id': userId,
          'Purpose': 'prefetch'
        }
      }).catch(err => console.warn('Prefetch of user meal plans failed silently', err));
      
      // Also prefetch saved meals which are shown on the profile
      fetch(`${apiUrl}/api/user-saved-meals`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'user-id': userId,
          'Purpose': 'prefetch'
        }
      }).catch(err => console.warn('Prefetch of saved meals failed silently', err));
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