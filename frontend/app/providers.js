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
  const { user, error, isLoading } = useUser();
  
  // Sync Auth0 user to Zustand store
  useEffect(() => {
    if (user && !isLoading) {
      // When Auth0 provides a user, update our store
      updateAuthStore(user, null);
      console.log("Auth0 user synced to Zustand store:", user.sub);
      
      // Set global user ID for backward compatibility
      if (typeof window !== 'undefined') {
        window.userId = user.sub;
      }
    }
  }, [user, isLoading]);
  
  // Log Auth0 errors
  useEffect(() => {
    if (error) {
      console.error("Auth0 error:", error);
    }
  }, [error]);
  
  // This component doesn't render anything
  return null;
}