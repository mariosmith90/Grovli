// app/layout.js
import '../styles/globals.css';
import Head from 'next/head';
import BottomNavbar from '../components/ui/navbar';
import Header from '../components/ui/header';
import { Providers } from './providers'; // Import the client-side providers wrapper

export const metadata = {
  title: 'Meal Plan App',
  description: 'Your AI-powered meal planning assistant',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Your AI-powered meal planning assistant" />
        <meta name="theme-color" content="#008080" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </Head>
      <body>
        <Providers>
          <Header />
          <BottomNavbar>
            {children}
          </BottomNavbar>
        </Providers>
        
        {/* Script to persist loading state across page navigations */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Ensure meal generation state persists across page navigations
              (function() {
                if (typeof window !== 'undefined') {
                  // Restore state from localStorage on page load
                  const loadingState = localStorage.getItem('mealGenerationState');
                  if (loadingState) {
                    try {
                      const state = JSON.parse(loadingState);
                      
                      // Set global window variables based on stored state
                      if (state.isGenerating !== undefined) {
                        window.mealLoading = state.isGenerating;
                      }
                      
                      if (state.mealGenerationComplete !== undefined) {
                        window.mealPlanReady = state.mealGenerationComplete;
                      }
                      
                      // Log restoration for debugging
                      console.log('[State Restoration] Restored meal generation state:', {
                        mealLoading: window.mealLoading,
                        mealPlanReady: window.mealPlanReady
                      });
                    } catch (e) {
                      console.error('Error parsing saved state:', e);
                    }
                  }
                  
                  // Listen for changes to mealLoading and save to localStorage
                  let lastMealLoading = window.mealLoading;
                  let lastMealPlanReady = window.mealPlanReady;
                  
                  // Use a periodic check to detect changes
                  setInterval(function() {
                    // Only update if values have changed
                    if (lastMealLoading !== window.mealLoading || 
                        lastMealPlanReady !== window.mealPlanReady) {
                      
                      // Get current state from localStorage
                      const currentState = JSON.parse(localStorage.getItem('mealGenerationState') || '{}');
                      
                      // Update with new values
                      const newState = {
                        ...currentState,
                        isGenerating: window.mealLoading,
                        mealGenerationComplete: window.mealPlanReady
                      };
                      
                      // Save back to localStorage
                      localStorage.setItem('mealGenerationState', JSON.stringify(newState));
                      
                      // Update last values
                      lastMealLoading = window.mealLoading;
                      lastMealPlanReady = window.mealPlanReady;
                      
                      console.log('[State Persistence] Updated meal generation state in localStorage');
                    }
                  }, 1000); // Check every second
                }
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}