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
    
    // Enhanced profileData preload - preloads profile page and all meal details
    profileData: async () => {
      const userId = store.userId;
      const token = store.getToken();
      
      if (!userId || !token) return;
      
      console.log("[usePreload] Preloading profile page data with enhanced meal details");
      
      // These APIs are needed for the profile page
      store.preloadApiData('userProfile', `/api/user-profile/${userId}`);
      store.preloadApiData('userMealPlans', '/api/user-plans');
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      
      try {
        // 1. Fetch user plans first - this is the API that causes the 2-second wait
        console.log("[usePreload] Fetching user meal plans");
        const userPlansResponse = await fetch(`${apiUrl}/api/user-plans/user/${userId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'user-id': userId,
            'Purpose': 'prefetch'
          },
          credentials: 'include'
        });
        
        if (!userPlansResponse.ok) {
          throw new Error(`Failed to prefetch user plans: ${userPlansResponse.status}`);
        }
        
        // 2. Extract plan data and process it
        const plans = await userPlansResponse.json();
        console.log(`[usePreload] Successfully prefetched ${plans.length} user plans`);
        
        // 3. Find the most recent plan to preload its meals
        if (Array.isArray(plans) && plans.length > 0) {
          // Sort plans by updated_at to get the latest one
          const sortedPlans = [...plans].sort((a, b) => 
            new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
          );
          
          const latestPlan = sortedPlans[0];
          console.log(`[usePreload] Found latest plan ID: ${latestPlan.id}`);
          
          // 4. Preload the individual meal details that would normally be fetched when navigating to profile
          if (latestPlan.meals && Array.isArray(latestPlan.meals)) {
            // Get today's date
            const today = new Date().toISOString().split('T')[0];
            
            // Filter to today's meals
            const todaysMeals = latestPlan.meals.filter(meal => 
              meal.date === today && meal.meal && (meal.meal.recipe_id || meal.meal.id)
            );
            
            console.log(`[usePreload] Preloading details for ${todaysMeals.length} meals for today`);
            
            // Prefetch meal details in parallel
            const mealDetailPromises = todaysMeals.map(mealItem => {
              const recipeId = mealItem.meal.recipe_id || mealItem.meal.id;
              
              if (!recipeId) {
                console.warn(`[usePreload] Missing recipe ID for meal type: ${mealItem.mealType}`);
                return Promise.resolve();
              }
              
              console.log(`[usePreload] Prefetching meal details for ${mealItem.mealType}, ID: ${recipeId}`);
              
              // This endpoint is called by loadPlanToCalendar in profileService.js
              return fetch(`${apiUrl}/mealplan/${recipeId}`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'user-id': userId,
                  'Purpose': 'prefetch'
                },
                credentials: 'include'
              })
              .then(response => {
                if (response.ok) {
                  console.log(`[usePreload] Successfully prefetched meal details for ${mealItem.mealType}`);
                } else {
                  console.warn(`[usePreload] Failed to prefetch meal details for ${mealItem.mealType}`);
                }
              })
              .catch(err => console.warn(`[usePreload] Prefetch of meal details failed for ${mealItem.mealType}`, err));
            });
            
            // Wait for all meal details to be prefetched
            await Promise.all(mealDetailPromises);
            console.log("[usePreload] Completed prefetching all meal details");
          }
        }
        
        // 5. Also prefetch saved meals which are shown on the profile page
        console.log("[usePreload] Prefetching saved meals");
        fetch(`${apiUrl}/api/user-saved-meals`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'user-id': userId,
            'Purpose': 'prefetch'
          },
          credentials: 'include'
        })
        .then(response => {
          if (response.ok) {
            console.log("[usePreload] Successfully prefetched saved meals");
            return response.json();
          }
          throw new Error(`Failed to prefetch saved meals: ${response.status}`);
        })
        .then(savedMeals => {
          if (Array.isArray(savedMeals) && savedMeals.length > 0) {
            console.log(`[usePreload] Prefetched ${savedMeals.length} saved meal plans`);
            
            // Prefetch details for each saved meal recipe
            const allRecipes = [];
            savedMeals.forEach(plan => {
              if (plan.recipes && Array.isArray(plan.recipes)) {
                plan.recipes.forEach(recipe => {
                  if (recipe.recipe_id) {
                    allRecipes.push(recipe.recipe_id);
                  }
                });
              }
            });
            
            // Limit to a reasonable number to avoid too many parallel requests
            const recipesToPreload = [...new Set(allRecipes)].slice(0, 10);
            console.log(`[usePreload] Prefetching details for ${recipesToPreload.length} saved meal recipes`);
            
            recipesToPreload.forEach(recipeId => {
              fetch(`${apiUrl}/mealplan/${recipeId}`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'user-id': userId,
                  'Purpose': 'prefetch'
                },
                credentials: 'include'
              }).catch(err => console.warn(`Prefetch of saved meal recipe ${recipeId} failed silently`, err));
            });
          }
        })
        .catch(err => console.warn('Prefetch of saved meals failed silently', err));
        
        // 6. Prefetch user meal completions for today
        console.log("[usePreload] Prefetching meal completions");
        const today = new Date().toISOString().split('T')[0];
        fetch(`${apiUrl}/user-profile/meal-completion/${userId}/${today}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'user-id': userId,
            'Purpose': 'prefetch'
          },
          credentials: 'include'
        }).catch(err => console.warn('Prefetch of meal completions failed silently', err));
        
        // 7. Prefetch user settings
        console.log("[usePreload] Prefetching user settings");
        fetch(`${apiUrl}/user-settings/${userId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'user-id': userId,
            'Purpose': 'prefetch'
          },
          credentials: 'include'
        }).catch(err => console.warn('Prefetch of user settings failed silently', err));
        
      } catch (error) {
        console.warn('Profile data prefetch failed:', error);
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