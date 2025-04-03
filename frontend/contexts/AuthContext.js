"use client";
// This file is now a forwarder to the Zustand store for backward compatibility
// Components should import from lib/stores/authStore.js directly instead

import { useAuth as useZustandAuth } from '../lib/stores/authStore';

// Re-export the useAuth hook from Zustand store for backward compatibility
export const useAuth = () => {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[Deprecation] You are importing useAuth from contexts/AuthContext.js. ' +
      'Please update your import to use lib/stores/authStore.js instead. ' +
      'The context version will be removed in a future update.'
    );
  }
  
  return useZustandAuth();
};

// Re-export AuthProvider as an empty component for backward compatibility
export const AuthProvider = ({ children }) => {
  return children;
};