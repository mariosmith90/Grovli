"use client";

import { useEffect } from 'react';
import { useUser } from '@auth0/nextjs-auth0';
import { updateAuthStore } from '../lib/stores/authStore';
import { SWRConfig } from 'swr';
import { fetcher, swrLocalCache, SWRProvider } from '../lib/swr-client';

/**
 * Providers component for our application
 * Includes Auth0 and SWR configuration
 */
export function Providers({ children }) {
  return (
    <SWRConfig value={{
      // Core configuration
      fetcher,                  // Global fetcher function for all SWR hooks
      provider: () => new Map(), // Use a custom Map instance for the cache
      
      // Revalidation strategy
      revalidateOnFocus: true,  // Enable SWR's built-in focus revalidation (recommended)
      revalidateOnReconnect: true, // Revalidate when network reconnects
      revalidateIfStale: true,  // Always revalidate stale data in the background
      
      // Performance tuning
      dedupingInterval: 3000,   // Dedupe identical requests within 3 seconds
      focusThrottleInterval: 10000, // Throttle focus events every 10 seconds
      loadingTimeout: 4000,     // Consider slow after 4 seconds
      
      // Error handling
      errorRetryCount: 3,       // Retry failed requests 3 times
      errorRetryInterval: 5000, // Start with 5-second retry delay (with backoff)
      shouldRetryOnError: (err) => {
        // Don't retry on client errors (except 408 Request Timeout)
        if (err.status && err.status !== 408 && err.status < 500) return false;
        return true;
      },
      
      // Lifecycle events
      onError: (error, key) => {
        // Only log server errors and unexpected errors, not common client errors
        if (!error.status || error.status >= 500) {
          console.error(`[SWR] Error for ${key}:`, error);
        } else if (error.status !== 404) {
          // Log client errors except 404s (which are common)
          console.warn(`[SWR] API client error for ${key}: ${error.status}`);
        }
      },
      onLoadingSlow: (key) => {
        console.warn(`[SWR] Slow loading for ${key} (>4s)`);
      },
      onSuccess: (data, key) => {
        // Persist successful responses to localStorage via our custom cache
        if (typeof window !== 'undefined' && key && data) {
          // Cache user-specific data that changes infrequently
          if (key.startsWith('/api/user-profile/') || 
              key.startsWith('/api/user-plans') || 
              key.startsWith('/user-profile/meal-completion') ||
              key.startsWith('/api/user-recipes/saved-recipes')) {
            swrLocalCache.set(key, data);
          }
        }
      }
    }}>
      <SWRProvider>
        <Auth0Sync />
        {children}
      </SWRProvider>
    </SWRConfig>
  );
}

/**
 * Component to sync Auth0 user data to Zustand store
 */
function Auth0Sync() {
  // Get auth state from Auth0's useUser hook
  const { user, error, isLoading, accessToken } = useUser();
  
  // Sync Auth0 user to Zustand store
  useEffect(() => {
    if (user && !isLoading) {
      // When Auth0 provides a user, update our store with user and token
      updateAuthStore(user, accessToken);
      console.log("Auth0 user synced to Zustand store:", user.sub);
      
      // Set global user ID for backward compatibility
      if (typeof window !== 'undefined') {
        window.userId = user.sub;
        
        // Store token in window properties for backward compatibility
        if (accessToken) {
          window.__auth0_token = accessToken;
          window.auth0_access_token = accessToken;
          window.latestAuthToken = accessToken;
        }
        
        // IMPORTANT: Immediately preload profile data to eliminate the 2-second wait
        // This ensures the profile page loads instantly when user navigates there
        setTimeout(async () => {
          try {
            // Import the fetcher function to directly preload data without using hooks
            const { fetcher, mutate } = await import('../lib/swr-client');
            
            // Define the keys we want to preload
            const today = new Date().toISOString().split('T')[0];
            const keysToPreload = [
              `/api/user-profile/${user.sub}`,
              `/api/user-plans/user/${user.sub}`,
              `/user-profile/meal-completion/${user.sub}/${today}`,
              `/user-settings/${user.sub}`
            ];
            
            // Use Promise.allSettled to preload all data
            await Promise.allSettled(
              keysToPreload.map(key => 
                mutate(key, fetcher(key), false)
              )
            );
            
            console.log("Successfully preloaded profile data for:", user.sub);
          } catch (err) {
            console.warn('Prefetch of profile data failed silently', err);
          }
          
          console.log("Immediately preloaded profile data after login to eliminate wait time");
        }, 500); // Small delay to ensure auth is properly set up
      }
    }
  }, [user, isLoading, accessToken]);
  
  // Preload assets during authentication
  useEffect(() => {
    if (!isLoading && typeof window !== 'undefined') {
      if (!user) {
        // User is not logged in - preload login-related assets
        const store = require('../lib/stores/authStore').useAuthStore.getState();
        store.preloadAsset('/logo.png');
        store.preloadAsset('/images/homepage.jpeg');
        console.log("Preloading auth assets before login");
      }
    }
  }, [isLoading, user]);
  
  // Log Auth0 errors
  useEffect(() => {
    if (error) {
      console.error("Auth0 error:", error);
    }
  }, [error]);
  
  // This component doesn't render anything
  return null;
}