"use client";

/**
 * A utility for creating SSR-safe Zustand-powered components
 * This solves the "Cannot access 'eh' before initialization" error
 */

import { useEffect, useState } from 'react';

/**
 * Middleware for Zustand that makes stores SSR-safe
 * @param {Function} config - Store creation function
 * @returns {Function} - SSR-safe store function
 */
export function ssr(config) {
  return (set, get, api) => {
    // Check if we're running in a browser environment
    const isBrowser = typeof window !== 'undefined';
    
    // Return the config with SSR safeguards
    return config(
      (...args) => {
        if (!isBrowser) {
          // During SSR, we don't update the store to avoid errors
          console.log("[SSR-Safe Zustand] Skipping store update during SSR");
          return;
        }
        set(...args);
      },
      () => {
        if (!isBrowser) {
          // During SSR, return an empty object to avoid errors
          console.log("[SSR-Safe Zustand] Returning empty state during SSR");
          return {};
        }
        return get();
      },
      api
    );
  };
}

/**
 * Higher-order component function to make Zustand components SSR-safe
 * @param {React.ComponentType} Component - The component to wrap
 * @returns {React.ComponentType} - The wrapped component
 */
export function withSSRSafeZustand(Component) {
  return function SSRSafeComponent(props) {
    const [isMounted, setIsMounted] = useState(false);
    
    useEffect(() => {
      setIsMounted(true);
    }, []);
    
    if (!isMounted) {
      // Render a placeholder during SSR or before hydration
      return <div className="loading-placeholder"></div>;
    }
    
    // Once mounted client-side, render the actual component
    return <Component {...props} />;
  };
}

/**
 * Custom hook to safely use Zustand stores in components
 * @param {Function} storeHook - The Zustand hook
 * @param {Function} selector - Optional selector function
 * @param {Object} defaultValue - Default value to use during SSR
 * @returns {Object} The selected store state
 */
export function useSSRSafeStore(storeHook, selector = state => state, defaultValue = {}) {
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // During SSR or before hydration, return the default value
  if (!isMounted) {
    return defaultValue;
  }
  
  // Once mounted on client, use the actual store
  return selector(storeHook());
}