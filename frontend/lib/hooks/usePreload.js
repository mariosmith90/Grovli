"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../stores/authStore';
import { useSWRConfig, mutate } from 'swr';
import { useApiGet, useProfilePreloader } from '../swr-client';

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
  const { preloadProfileData } = useProfilePreloader();
  
  // Define common API endpoints for use with SWR
  const userId = store?.userId;
  const userPlansKey = userId ? `/api/user-plans/user/${userId}` : null;
  const userProfileKey = userId ? `/api/user-profile/${userId}` : null;
  
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
    
    // Preload API data - following SWR docs
    api: (key, endpoint, options = {}) => {
      if (!key) return;
      
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const fullUrl = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint}`;
        
        // Get headers - either from options or from auth store
        const headers = options.headers || store.getAuthHeaders();
        
        // Use the exact pattern from SWR docs
        globalMutate(
          key,
          fetch(fullUrl, {
            headers,
            credentials: 'include',
            ...options
          })
          .then(res => res.ok ? res.json() : null)
          .catch(err => {
            console.warn(`[usePreload] Error prefetching ${key}:`, err);
            return null;
          }),
          false // Skip revalidation as recommended in the docs
        );
      } catch (error) {
        console.warn(`[usePreload] Error setting up prefetch for ${key}:`, error);
      }
    },
    
    // Enhanced profileData preload - following SWR docs exactly
    profileData: async () => {
      if (!userId) return false;
      
      console.log("[usePreload] Preloading profile data using SWR docs patterns");
      
      try {
        // Define the profile-related endpoints to preload
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const headers = store.getAuthHeaders();
        const today = new Date().toISOString().split('T')[0];
        
        // Define all the keys we want to preload
        const preloadKeys = [
          // User profile
          { key: userProfileKey, endpoint: userProfileKey },
          
          // User meal plans
          { key: userPlansKey, endpoint: userPlansKey },
          
          // Today's meal completions
          { 
            key: `/user-profile/meal-completion/${userId}/${today}`,
            endpoint: `/user-profile/meal-completion/${userId}/${today}`
          },
          
          // User settings
          { 
            key: `/user-settings/${userId}`,
            endpoint: `/user-settings/${userId}`
          }
        ];
        
        // Following the SWR docs exactly, use mutate with fetch promises for prefetching
        // https://swr.vercel.app/docs/prefetching
        await Promise.all(
          preloadKeys
            .filter(item => item.key && item.endpoint)
            .map(({ key, endpoint }) => 
              globalMutate(
                key,
                fetch(`${apiUrl}${endpoint}`, { headers, credentials: 'include' })
                  .then(res => res.ok ? res.json() : null)
                  .catch(() => null),
                false // Skip revalidation as recommended in the docs
              )
            )
        );
        
        if (typeof window !== 'undefined') {
          localStorage.setItem('grovli_profile_preload_timestamp', Date.now().toString());
        }
        
        console.log('[usePreload] Profile data preloaded with SWR');
        return true;
      } catch (error) {
        console.warn('[usePreload] Profile data prefetch failed:', error);
        return false;
      }
    },
    
    // Pantry data preload - following SWR docs precisely
    pantryData: async () => {
      if (!userId) return false;
      
      console.log("[usePreload] Preloading pantry data using SWR docs pattern");
      
      // Define the pantry endpoint for SWR
      const pantryKey = userId ? `/api/user-pantry/items` : null;
      if (!pantryKey) return false;
      
      try {
        // Following the SWR prefetching docs exactly:
        // https://swr.vercel.app/docs/prefetching
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const headers = store.getAuthHeaders();
        
        // Preload the main pantry items data
        globalMutate(
          pantryKey,
          fetch(`${apiUrl}${pantryKey}`, { headers, credentials: 'include' })
            .then(res => res.ok ? res.json() : null),
          false // Skip revalidation
        );
        
        // Preload related pantry data in parallel
        const relatedKeys = [
          '/api/user-pantry/categories',
          '/api/user-pantry/recent'
        ];
        
        // Preload each related key
        relatedKeys.forEach(key => {
          globalMutate(
            key,
            fetch(`${apiUrl}${key}`, { headers, credentials: 'include' })
              .then(res => res.ok ? res.json() : null)
              .catch(() => null), // Silent catch
            false // Skip revalidation
          );
        });
        
        console.log('[usePreload] Pantry data preloaded with SWR');
        return true;
      } catch (error) {
        console.warn('[usePreload] Pantry data prefetch failed:', error);
        return false;
      }
    },
    
    // Initialize SWR caches for critical paths - following SWR docs
    initialize: async () => {
      if (!userId) return false;
      
      console.log("[usePreload] Initializing SWR caches for critical paths");
      
      try {
        // Define the critical paths to preload
        const criticalPaths = [
          userProfileKey,
          userPlansKey,
          `/api/user-pantry/items`,
          `/api/user-recipes/saved-recipes/`,
          `/user-settings/${userId}`
        ].filter(Boolean); // Filter out null values
        
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const headers = store.getAuthHeaders();
        
        // Following SWR docs: https://swr.vercel.app/docs/prefetching
        // Preload all critical paths in parallel
        await Promise.all(
          criticalPaths.map(path => 
            // Use mutate with a fetch promise and skip revalidation flag (false)
            globalMutate(
              path, 
              fetch(`${apiUrl}${path}`, {
                headers,
                credentials: 'include'
              })
              .then(res => {
                if (!res.ok) throw new Error(`Failed to fetch ${path}`);
                return res.json();
              })
              .catch(err => {
                console.warn(`[usePreload] Failed to preload ${path}:`, err);
                // Return undefined instead of rejecting to avoid breaking Promise.all
                return undefined;
              }),
              false // Skip revalidation as per SWR docs
            )
          )
        );
        
        console.log("[usePreload] SWR cache initialization complete");
        return true;
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