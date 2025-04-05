"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../stores/authStore';
import { useSWRConfig, mutate } from 'swr';
import { useApiGet } from '../swr-client';

/**
 * Enhanced SWR-based custom hook for preloading assets, routes, and API data.
 * This provides a simple interface to preload content from any component using SWR.
 * 
 * Usage:
 * const { profileData, pantryData, mealsData } = usePreload();
 * 
 * // Preload profile data
 * profileData().then(() => console.log('Profile data preloaded'));
 * 
 * // Preload pantry data
 * pantryData().then(() => console.log('Pantry data preloaded'));
 */

export function usePreload() {
  const pathname = usePathname();
  const store = useAuthStore();
  const { mutate: globalMutate } = useSWRConfig();
  
  // Define common API endpoints for use with SWR
  const userId = store?.userId;
  const userPlansKey = userId ? `/api/user-plans/user/${userId}` : null;
  const userProfileKey = userId ? `/user-profile/${userId}` : null;
  
  // SWR-optimized preloading methods
  
  // Preload assets for the current route on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Get route-specific assets to preload
    const routeAssets = getAssetsForRoute(pathname);
    if (routeAssets.length > 0) {
      console.log(`[usePreload] Preloading ${routeAssets.length} assets for route ${pathname}`);
      
      // Preload assets using the store's preloadAsset method
      routeAssets.forEach(asset => {
        store.preloadAsset(asset);
      });
    }
    
    // Get routes to preload based on current route
    const relatedRoutes = getRelatedRoutes(pathname);
    if (relatedRoutes.length > 0) {
      console.log(`[usePreload] Preloading ${relatedRoutes.length} related routes for ${pathname}`);
      // Routes are handled by Next.js router now
    }
  }, [pathname, store]);
  
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
    
    // Preload multiple assets - keeping SWR in sync
    assets: async (assetUrls) => {
      if (!Array.isArray(assetUrls) || assetUrls.length === 0) return;
      
      console.log(`[usePreload] Preloading ${assetUrls.length} assets`);
      
      try {
        // Use store's preloadAsset for each asset
        assetUrls.forEach(asset => store.preloadAsset(asset));
        
        // For assets that might affect data, also prime the SWR cache with the 
        // corresponding API endpoints for images
        // This is a pattern unique to our application, not from SWR docs
        const imageAssets = assetUrls.filter(url => 
          url.match(/\.(jpg|jpeg|png|webp|svg)$/i) && 
          url.includes('/images/')
        );
        
        // If we have meal images, prime the SWR cache for meal data
        if (imageAssets.length > 0 && imageAssets.some(img => img.includes('meals/'))) {
          // Use the proper prefetching pattern from SWR docs
          globalMutate('/api/user-plans', undefined, false);
        }
      } catch (error) {
        console.warn(`[usePreload] Error preloading assets:`, error);
      }
    },
    
    // Streamlined API data preload - directly using SWR's pattern
    api: async (key, endpoint, options = {}) => {
      if (!key) return;
      
      try {
        // Import fetcher to ensure consistency with other SWR calls
        const { fetcher } = await import('../swr-client');
        
        // Use SWR's recommended pattern directly
        return globalMutate(
          key, 
          fetcher(endpoint),
          false
        );
      } catch (error) {
        console.warn(`[usePreload] Error setting up prefetch for ${key}:`, error);
      }
    },
    
    // Streamlined profileData preload - using SWR's recommended pattern with better error handling
    profileData: async () => {
      if (!userId) return false;
      
      try {
        // Get auth token directly from the store to ensure it's available
        const token = store.getToken?.() || (typeof window !== 'undefined' ? 
          localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') : null);
        
        if (!token) {
          console.warn('[usePreload] Authentication token not available for profile data preload');
          return false;
        }
        
        // Define today's date for meal completions
        const today = new Date().toISOString().split('T')[0];
        
        // Define the keys we want to preload using the same keys that components will use
        const keysToPreload = [
          userProfileKey,
          userPlansKey,
          `/user-profile/meal-completion/${userId}/${today}`,
          `/user-settings/${userId}`
        ].filter(Boolean); // Remove any null/undefined keys
        
        // Log that we're starting preload with token
        console.log(`[usePreload] Starting profile preload for user ${userId} with token available: ${!!token}`);
        
        // Use a more resilient approach, handling each key independently
        const results = await Promise.allSettled(
          keysToPreload.map(key => {
            try {
              // Use a custom fetcher with explicit token to ensure authentication
              const customFetch = async () => {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
                const fullUrl = `${apiUrl}${key}`;
                
                const response = await fetch(fullUrl, {
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Source': 'preload'
                  }
                });
                
                if (!response.ok) {
                  throw new Error(`API request failed with status ${response.status}`);
                }
                
                return response.json();
              };
              
              // Use SWR's mutate to prime the cache
              return globalMutate(key, customFetch().catch(err => {
                console.error(`[usePreload] Failed to preload ${key}:`, err);
                return undefined;
              }), false);
            } catch (e) {
              console.error(`[usePreload] Error setting up mutation for ${key}:`, e);
              return Promise.resolve(); // Keep going
            }
          })
        );
        
        // Log overall success/failure
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        console.log(`[usePreload] Profile data preloaded: ${successCount}/${keysToPreload.length} successful`);
        
        // Return true if at least some preloads succeeded
        return successCount > 0;
      } catch (error) {
        console.error('[usePreload] Profile data prefetch failed:', error);
        return false;
      }
    },
    
    // Streamlined pantry data preload - using SWR's recommended pattern with better error handling
    pantryData: async () => {
      if (!userId) return false;
      
      try {
        // Get auth token directly from the store to ensure it's available
        const token = store.getToken?.() || (typeof window !== 'undefined' ? 
          localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') : null);
        
        if (!token) {
          console.warn('[usePreload] Authentication token not available for pantry data preload');
          return false;
        }
        
        // Import fetcher from swr-client but we'll use our own authentication
        const { fetcher } = await import('../swr-client');
        
        // Define the pantry-related keys to preload
        // Note: Only "items" endpoint exists in the backend API
        const keysToPreload = [
          '/api/user-pantry/items'
        ];
        
        // Log that we're starting preload with token
        console.log(`[usePreload] Starting pantry preload for user ${userId} with token available: ${!!token}`);
        
        // Use a more resilient approach, handling each key independently
        const results = await Promise.allSettled(
          keysToPreload.map(key => {
            try {
              // Use a custom fetcher with explicit token to ensure authentication
              const customFetch = async () => {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
                const fullUrl = `${apiUrl}${key}`;
                
                const response = await fetch(fullUrl, {
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Source': 'preload'
                  }
                });
                
                if (!response.ok) {
                  throw new Error(`API request failed with status ${response.status}`);
                }
                
                return response.json();
              };
              
              // Use SWR's mutate to prime the cache
              return globalMutate(key, customFetch().catch(err => {
                console.error(`[usePreload] Failed to preload ${key}:`, err);
                return undefined;
              }), false);
            } catch (e) {
              console.error(`[usePreload] Error setting up mutation for ${key}:`, e);
              return Promise.resolve(); // Keep going
            }
          })
        );
        
        // Log overall success/failure
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        console.log(`[usePreload] Pantry data preloaded: ${successCount}/${keysToPreload.length} successful`);
        
        // Return true if at least some preloads succeeded
        return successCount > 0;
      } catch (error) {
        console.error('[usePreload] Pantry data prefetch failed:', error);
        return false;
      }
    },
    
    // Streamlined initialization for critical paths with better error handling
    initialize: async () => {
      if (!userId) return false;
      
      try {
        // Get auth token directly from the store to ensure it's available
        const token = store.getToken?.() || (typeof window !== 'undefined' ? 
          localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') : null);
        
        if (!token) {
          console.warn('[usePreload] Authentication token not available for preload initialization');
          return false;
        }
        
        // Define the critical paths to preload
        const criticalPaths = [
          userProfileKey,
          userPlansKey,
          `/api/user-pantry/items`,
          `/api/user-recipes/saved-recipes/`,
          `/user-settings/${userId}`
        ].filter(Boolean); // Filter out null values
        
        // Log that we're starting preload with token
        console.log(`[usePreload] Starting initialization for user ${userId} with token available: ${!!token}`);
        
        // Use a more resilient approach, handling each path independently
        const results = await Promise.allSettled(
          criticalPaths.map(path => {
            try {
              // Use a custom fetcher with explicit token to ensure authentication
              const customFetch = async () => {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
                const fullUrl = `${apiUrl}${path}`;
                
                const response = await fetch(fullUrl, {
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Source': 'preload-init'
                  }
                });
                
                if (!response.ok) {
                  throw new Error(`API request failed with status ${response.status}`);
                }
                
                return response.json();
              };
              
              // Use SWR's mutate to prime the cache
              return globalMutate(path, customFetch().catch(err => {
                console.error(`[usePreload] Failed to initialize ${path}:`, err);
                return undefined;
              }), false);
            } catch (e) {
              console.error(`[usePreload] Error setting up mutation for ${path}:`, e);
              return Promise.resolve(); // Keep going
            }
          })
        );
        
        // Log overall success/failure
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        console.log(`[usePreload] SWR cache initialization: ${successCount}/${criticalPaths.length} successful`);
        
        // Return true if at least some initializations succeeded
        return successCount > 0;
      } catch (error) {
        console.error("[usePreload] Error initializing SWR caches:", error);
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