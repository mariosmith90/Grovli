"use client";

import { useEffect } from 'react';
import { useUser } from '@auth0/nextjs-auth0';
import { updateAuthStore } from '../lib/stores/authStore';

/**
 * Providers component for our application
 * Uses Auth0's hooks directly with Zustand
 */
export function Providers({ children }) {
  return (
    <>
      <Auth0Sync />
      {children}
    </>
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
        setTimeout(() => {
          const { useAuthStore } = require('../lib/stores/authStore');
          const store = useAuthStore.getState();
          
          // Directly fetch the active meal plans which cause the wait
          fetch(`/api/user_plans/active`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'user-id': user.sub,
              'Purpose': 'prefetch'
            }
          }).catch(err => console.warn('Prefetch of active meal plans failed silently', err));
          
          console.log("Immediately preloading profile data after login to eliminate wait time");
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