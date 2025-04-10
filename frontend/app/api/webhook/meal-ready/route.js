import { NextResponse } from 'next/server';
import Redis from 'ioredis';

// Create Redis client using Railway connection URI
const redis = new Redis(process.env.REDIS_URL + "?family=0", {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // When redis is being failed over, we need to reconnect
      return true;
    }
    return false;
  }
});

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
    
    const timestamp = new Date().toISOString();
    
    // 1. Store in Redis for reliable cross-instance access
    const cacheKey = `meal_ready:${user_id}`;
    await redis.set(cacheKey, JSON.stringify({
      user_id,
      meal_plan_id,
      session_id,
      timestamp
    }), 'EX', 3600 ); // Expire after 1 hour
    
    // 2. Also store in a separate key for tracking all ready meal plans
    const readyPlansKey = `ready_meal_plans:${user_id}`;
    await redis.hset(readyPlansKey, meal_plan_id, JSON.stringify({
      user_id,
      meal_plan_id,
      session_id,
      timestamp,
      handled: false
    }));
    // Set expiration for the hash 
    await redis.expire(readyPlansKey, 86400); // Expire after 24 hours
    
    // 3. For backward compatibility, keep in-memory cache too
    global.mealReadyCache = global.mealReadyCache || {};
    global.mealReadyCache[cacheKey] = {
      user_id,
      meal_plan_id,
      session_id,
      timestamp
    };
    
    // Store notification source for analytics
    await redis.hset('notification_sources', `${meal_plan_id}:${timestamp}`, 'webhook');
    
    console.log(`📊 Stored notification in Redis and server cache for polling: ${meal_plan_id}`);
    
    // Log a clear message in the server logs for debugging
    console.log(`
==================================================
[WEBHOOK] MEAL PLAN READY NOTIFICATION RECEIVED
- meal_plan_id: ${meal_plan_id}
- user_id: ${user_id}
- time: ${timestamp}
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
    
    // Initialize global objects for backward compatibility
    global.mealReadyCache = global.mealReadyCache || {};
    global.lastMealReadyCheck = global.lastMealReadyCheck || {};
    global.readyMealPlans = global.readyMealPlans || {};
    
    // Track when this endpoint was last queried to prevent rapid polling
    const now = Date.now();
    const lastCheck = global.lastMealReadyCheck[user_id] || 0;
    
    // Only throttle if this is not the special test user ID
    // This prevents excessive polling while allowing our test user to have responsive UI
    if (now - lastCheck < 15000 && user_id !== "auth0|67b82eb657e61f81cdfdd503" && 
        user_id !== "google-oauth2|100398622971971910131") { // Special user for immediate checking
      console.log(`Throttling notification check for user ${user_id} - checked too recently`);
      return NextResponse.json({
        has_notification: false,
        throttled: true
      });
    }
    
    // Update the last check time
    global.lastMealReadyCheck[user_id] = now;
    await redis.set(`last_check:${user_id}`, now, 'EX', 3600 );
    
    // First check the Redis ready plans hash - this is the most reliable source
    // This contains all unacknowledged ready meal plans
    if (checkReadyPlans) {
      try {
        const readyPlansKey = `ready_meal_plans:${user_id}`;
        const redisReadyPlans = await redis.hgetall(readyPlansKey);
        
        // Process any ready plans from Redis
        if (redisReadyPlans && Object.keys(redisReadyPlans).length > 0) {
          const readyPlans = Object.entries(redisReadyPlans)
            .map(([planId, dataStr]) => {
              try {
                const data = JSON.parse(dataStr);
                return {
                  meal_plan_id: planId,
                  user_id: data.user_id,
                  timestamp: data.timestamp,
                  handled: data.handled,
                  session_id: data.session_id,
                  notification_source: 'redis'
                };
              } catch (e) {
                console.error(`Error parsing plan data for ${planId}:`, e);
                return null;
              }
            })
            .filter(plan => plan && !plan.handled); // Filter out null or handled plans
          
          if (readyPlans.length > 0) {
            console.log(`Found ${readyPlans.length} ready meal plans for user ${user_id} in Redis`);
            
            // Mark the first plan as handled in Redis
            const readyPlan = readyPlans[0];
            const updatedPlanData = JSON.stringify({
              ...JSON.parse(redisReadyPlans[readyPlan.meal_plan_id]),
              handled: true
            });
            
            await redis.hset(readyPlansKey, readyPlan.meal_plan_id, updatedPlanData);
            
            // Also check if we have this in the global cache and mark it as handled
            if (global.readyMealPlans[readyPlan.meal_plan_id]) {
              global.readyMealPlans[readyPlan.meal_plan_id].handled = true;
            }
            
            // Track notification delivery in Redis
            await redis.hset('notification_deliveries', `${readyPlan.meal_plan_id}:${now}`, 'redis');
            
            console.log(`
==================================================
[WEBHOOK] MEAL PLAN READY NOTIFICATION SENT FROM REDIS
- meal_plan_id: ${readyPlan.meal_plan_id}
- user_id: ${user_id}
- time: ${new Date().toISOString()}
==================================================
            `);
            
            return NextResponse.json({
              has_notification: true,
              notification: {
                user_id: user_id,
                meal_plan_id: readyPlan.meal_plan_id,
                timestamp: readyPlan.timestamp || now,
                from_redis_cache: true
              }
            });
          }
        }
      } catch (redisError) {
        console.error('Error checking Redis for ready plans:', redisError);
        // Continue with memory cache as fallback
      }
      
      // Fallback to memory cache
      const readyPlans = Object.entries(global.readyMealPlans)
        .filter(([_, data]) => data.user_id === user_id && !data.handled)
        .map(([planId, data]) => ({ 
          meal_plan_id: planId,
          timestamp: data.timestamp,
          notification_source: 'memory'
        }));
      
      if (readyPlans.length > 0) {
        // Mark these plans as handled so we don't send duplicate notifications
        readyPlans.forEach(plan => {
          if (global.readyMealPlans[plan.meal_plan_id]) {
            global.readyMealPlans[plan.meal_plan_id].handled = true;
          }
        });
        
        console.log(`Found ${readyPlans.length} ready meal plans for user ${user_id} via memory cache`);
        
        // Track notification delivery
        await redis.hset('notification_deliveries', `${readyPlans[0].meal_plan_id}:${now}`, 'memory');
        
        // Return the first ready meal plan (usually there should only be one anyway)
        const readyPlan = readyPlans[0];
        return NextResponse.json({
          has_notification: true,
          notification: {
            user_id: user_id,
            meal_plan_id: readyPlan.meal_plan_id,
            timestamp: readyPlan.timestamp,
            from_memory_cache: true
          }
        });
      }
    }
    
    // Check the Redis notification cache
    const cacheKey = `meal_ready:${user_id}`;
    let cachedNotification = null;
    
    // First try Redis
    try {
      const redisData = await redis.get(cacheKey);
      if (redisData) {
        cachedNotification = JSON.parse(redisData);
      }
    } catch (redisError) {
      console.error('Error getting notification from Redis:', redisError);
      // Fall back to memory cache
    }
    
    // Fall back to memory cache if Redis failed
    if (!cachedNotification) {
      cachedNotification = global.mealReadyCache[cacheKey];
    }
    
    if (cachedNotification) {
      // To prevent duplicate notifications for the same meal plan, we'll check Redis first
      const notifKey = `notified:${user_id}:${cachedNotification.meal_plan_id}`;
      let alreadyNotified = false;
      
      try {
        // Check if we already notified about this meal plan recently
        alreadyNotified = await redis.exists(notifKey);
      } catch (redisError) {
        console.error('Error checking notification status in Redis:', redisError);
        // Fall back to memory tracking
        global.notifiedMealPlans = global.notifiedMealPlans || {};
        const memoryKey = `${user_id}:${cachedNotification.meal_plan_id}`;
        const lastNotified = global.notifiedMealPlans[memoryKey] || 0;
        alreadyNotified = (now - lastNotified < 120000); // 2 minutes
      }
      
      if (alreadyNotified) {
        console.log(`Skipping duplicate notification for meal plan ${cachedNotification.meal_plan_id}`);
        return NextResponse.json({
          has_notification: false,
          duplicate: true
        });
      }
      
      // Mark as notified in Redis (expires after 2 minutes)
      try {
        await redis.set(notifKey, 'true', 'EX',  120 );
      } catch (redisError) {
        console.error('Error setting notification status in Redis:', redisError);
        // Fall back to memory tracking
        global.notifiedMealPlans = global.notifiedMealPlans || {};
        const memoryKey = `${user_id}:${cachedNotification.meal_plan_id}`;
        global.notifiedMealPlans[memoryKey] = now;
      }
      
      // Clear Redis notification cache to prevent duplicate notifications
      try {
        await redis.del(cacheKey);
      } catch (redisError) {
        console.error('Error deleting notification from Redis:', redisError);
      }
      
      // Also clear memory cache
      delete global.mealReadyCache[cacheKey];
      
      // Track notification delivery
      await redis.hset('notification_deliveries', `${cachedNotification.meal_plan_id}:${now}`, 'direct');
      
      // Add detailed logging for debugging and tracking
      console.log(`
==================================================
[WEBHOOK] MEAL PLAN READY NOTIFICATION SENT FROM DIRECT CACHE
- meal_plan_id: ${cachedNotification.meal_plan_id}
- user_id: ${user_id}
- time: ${new Date().toISOString()}
==================================================
      `);
      
      // For backward compatibility, also add to the in-memory ready plans cache
      global.readyMealPlans = global.readyMealPlans || {};
      global.readyMealPlans[cachedNotification.meal_plan_id] = {
        timestamp: now,
        user_id: user_id,
        handled: false  // This flag helps prevent duplicate handling
      };
      
      // Add a timestamp to help with debugging
      return NextResponse.json({
        has_notification: true,
        notification: {
          ...cachedNotification,
          timestamp: now
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