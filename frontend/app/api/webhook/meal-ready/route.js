import { NextResponse } from 'next/server';

/**
 * API route to receive webhook notifications from the backend when meal plans are ready
 * This endpoint will be called by the backend when a meal plan is complete with all images
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { user_id, meal_plan_id, session_id } = body;
    
    // Validate required fields
    if (!user_id || !meal_plan_id) {
      return NextResponse.json(
        { error: 'Missing required fields: user_id and meal_plan_id are required' },
        { status: 400 }
      );
    }
    
    console.log(`📣 Webhook received: Meal plan ${meal_plan_id} is ready for user ${user_id}`);
    
    // Store in a server-side cache that can be queried by the client
    // This is useful for when the client isn't actively listening or disconnects
    const cacheKey = `meal_ready:${user_id}`;
    global.mealReadyCache = global.mealReadyCache || {};
    global.mealReadyCache[cacheKey] = {
      user_id,
      meal_plan_id,
      session_id,
      timestamp: new Date().toISOString()
    };
    
    // Server-side API routes can't directly interact with client-side window
    // Instead, we store the notification in server-side cache that client can poll
    console.log(`📊 Stored notification in server cache for polling: ${meal_plan_id}`);
    
    // Log a clear message in the server logs for debugging
    console.log(`
==================================================
[WEBHOOK] MEAL PLAN READY NOTIFICATION RECEIVED
- meal_plan_id: ${meal_plan_id}
- user_id: ${user_id}
- time: ${new Date().toISOString()}
==================================================
    `);
    return NextResponse.json(
      { success: true, message: 'Notification received and cached' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error handling meal ready webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Check if a meal plan is ready for a specific user
 */
export async function GET(request) {
  try {
    // Extract user_id from search params
    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id');
    const checkReadyPlans = url.searchParams.get('checkReadyPlans') === 'true';
    
    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing required query parameter: user_id' },
        { status: 400 }
      );
    }
    
    // Initialize global objects if needed
    global.mealReadyCache = global.mealReadyCache || {};
    global.lastMealReadyCheck = global.lastMealReadyCheck || {};
    global.readyMealPlans = global.readyMealPlans || {};
    
    // First, check if we have a ready meal plan for this user in our special cache
    // This handles the case where a notification came in via webhook but the client
    // hasn't fetched it yet
    if (checkReadyPlans) {
      const readyPlans = Object.entries(global.readyMealPlans)
        .filter(([_, data]) => data.user_id === user_id && !data.handled)
        .map(([planId, data]) => ({ 
          meal_plan_id: planId,
          timestamp: data.timestamp,
          notification_source: 'webhook'
        }));
      
      if (readyPlans.length > 0) {
        // Mark these plans as handled so we don't send duplicate notifications
        readyPlans.forEach(plan => {
          if (global.readyMealPlans[plan.meal_plan_id]) {
            global.readyMealPlans[plan.meal_plan_id].handled = true;
          }
        });
        
        console.log(`Found ${readyPlans.length} ready meal plans for user ${user_id} via readyMealPlans cache`);
        
        // Return the first ready meal plan (usually there should only be one anyway)
        const readyPlan = readyPlans[0];
        return NextResponse.json({
          has_notification: true,
          notification: {
            user_id: user_id,
            meal_plan_id: readyPlan.meal_plan_id,
            timestamp: readyPlan.timestamp,
            from_ready_cache: true
          }
        });
      }
    }
    
    // Check the regular notification cache
    const cacheKey = `meal_ready:${user_id}`;
    const cachedNotification = global.mealReadyCache[cacheKey];
    
    // Track when this endpoint was last queried to prevent rapid polling
    const now = Date.now();
    const lastCheck = global.lastMealReadyCheck[user_id] || 0;
    
    // Only throttle if this is not the special test user ID
    // This prevents excessive polling while allowing our test user to have responsive UI
    if (now - lastCheck < 30000 && user_id !== "auth0|67b82eb657e61f81cdfdd503") {
      console.log(`Throttling notification check for user ${user_id} - checked too recently`);
      return NextResponse.json({
        has_notification: false,
        throttled: true
      });
    }
    
    // Special user handling
    if (now - lastCheck < 10000 && user_id === "auth0|67b82eb657e61f81cdfdd503") {
      console.log(`Special user ${user_id} checking notifications - allowing without throttle`);
    }
    
    // Update the last check time
    global.lastMealReadyCheck[user_id] = now;
    
    if (cachedNotification) {
      // To prevent duplicate notifications for the same meal plan, we'll
      // keep track of which meal plans we've already notified about
      global.notifiedMealPlans = global.notifiedMealPlans || {};
      
      // If we've already notified about this meal plan in the last 2 minutes, don't notify again
      // Increased from 30 seconds to 2 minutes to prevent duplicate notifications
      const planKey = `${user_id}:${cachedNotification.meal_plan_id}`;
      const lastNotified = global.notifiedMealPlans[planKey] || 0;
      
      if (now - lastNotified < 120000) { // 2 minutes
        console.log(`Skipping duplicate notification for meal plan ${cachedNotification.meal_plan_id}`);
        return NextResponse.json({
          has_notification: false,
          duplicate: true
        });
      }
      
      // Clear cache after sending (one-time notification)
      delete global.mealReadyCache[cacheKey];
      
      // Mark this meal plan as notified
      global.notifiedMealPlans[planKey] = now;
      
      // Automatic cleanup of old notified meal plans after 1 minute
      setTimeout(() => {
        if (global.notifiedMealPlans && global.notifiedMealPlans[planKey]) {
          delete global.notifiedMealPlans[planKey];
        }
      }, 60000);
      
      // Add detailed logging for debugging and tracking
      console.log(`
==================================================
[WEBHOOK] MEAL PLAN READY NOTIFICATION SENT
- meal_plan_id: ${cachedNotification.meal_plan_id}
- user_id: ${user_id}
- time: ${new Date().toISOString()}
==================================================
      `);
      
      // Since this is a server-side API route, we can't directly update window variables
      // However, we can create a special cache entry to indicate this meal plan is ready
      // This will be read by client-side code during polling
      global.readyMealPlans = global.readyMealPlans || {};
      global.readyMealPlans[cachedNotification.meal_plan_id] = {
        timestamp: Date.now(),
        user_id: user_id,
        handled: false  // This flag helps prevent duplicate handling
      };
      
      // Keeping this special ready cache entry for a while to ensure it's picked up
      // even if the client takes some time to poll
      setTimeout(() => {
        if (global.readyMealPlans && global.readyMealPlans[cachedNotification.meal_plan_id]) {
          delete global.readyMealPlans[cachedNotification.meal_plan_id];
        }
      }, 300000); // 5 minutes
      
      // Add a timestamp to help with debugging
      return NextResponse.json({
        has_notification: true,
        notification: {
          ...cachedNotification,
          timestamp: Date.now()
        }
      });
    }
    
    return NextResponse.json({
      has_notification: false
    });
  } catch (error) {
    console.error('Error checking meal ready status:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}