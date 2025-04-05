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
      fetcher,
      provider: () => new Map(), // Use a custom Map instance for the cache
      revalidateOnFocus: false, // Disable auto revalidation on window focus
      revalidateIfStale: true,  // Revalidate if data is stale
      dedupingInterval: 5000,   // Dedupe requests within 5 seconds
      errorRetryCount: 2,       // Only retry failed requests twice
      shouldRetryOnError: (err) => !err.status || err.status >= 500,  // Only retry on server errors
      onError: (error, key) => {
        if (error.status !== 403 && error.status !== 404) {
          console.error(`SWR Error for ${key}:`, error);
        }
      },
      onLoadingSlow: (key) => {
        console.warn(`SWR slow loading for ${key}`);
      },
      onSuccess: (data, key) => {
        // Backup successful responses to localStorage via our custom cache
        if (typeof window !== 'undefined' && key && data) {
          if (key.startsWith('/api/user-profile/') || 
              key.startsWith('/api/user-plans') || 
              key.startsWith('/user-profile/meal-completion')) {
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
            const { useProfilePreloader } = require('../lib/swr-client');
            const preloader = useProfilePreloader();
            
            // Use our SWR preloader to prefetch all necessary data
            const result = await preloader.preloadProfileData(user.sub);
            console.log("Profile data preload result:", result);
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