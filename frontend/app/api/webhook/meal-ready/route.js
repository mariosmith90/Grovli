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
 * 
 * SWR Enhanced: This endpoint is now optimized to work with our SWR implementation
 * alongside the existing Redis cache 
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
    }));
    await redis.expire(cacheKey, 3600); // Expire after 1 hour
    
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
    
    // 3. Keep in-memory cache for performance
    global.mealReadyCache = global.mealReadyCache || {};
    global.mealReadyCache[cacheKey] = {
      user_id,
      meal_plan_id,
      session_id,
      timestamp
    };
    
    // 4. For SWR integration - store additional metadata
    const swrCacheKey = `swr_meal_ready:${user_id}`;
    await redis.set(swrCacheKey, JSON.stringify({
      user_id,
      meal_plan_id,
      session_id,
      timestamp,
      has_notification: true,
      notification: {
        user_id,
        meal_plan_id,
        timestamp,
        from_webhook: true
      }
    }));
    await redis.expire(swrCacheKey, 3600); // Expire after 1 hour
    
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
 * SWR Enhanced: Optimized for working with SWR data fetching
 */
export async function GET(request) {
  try {
    // Extract user_id from search params
    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id');
    const checkReadyPlans = url.searchParams.get('checkReadyPlans') === 'true';
    const isThrottled = false; // Define this variable since it's used later
    
    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing required query parameter: user_id' },
        { status: 400 }
      );
    }
    
    // Initialize global objects for in-memory caching
    global.mealReadyCache = global.mealReadyCache || {};
    global.lastMealReadyCheck = global.lastMealReadyCheck || {};
    global.readyMealPlans = global.readyMealPlans || {};
    
    // With SWR, we only need to check if this is a special user that gets priority treatment
    const now = Date.now();
    
    // No need for throttling with SWR, but we'll keep track of frequency for monitoring
    const lastCheck = global.lastMealReadyCheck[user_id] || 0;
    const timeSinceLastCheck = now - lastCheck;
    
    // Mark special users for priority treatment
    const isPriorityUser = user_id === "auth0|67b82eb657e61f81cdfdd503" || 
                          user_id === "google-oauth2|100398622971971910131";
    
    if (timeSinceLastCheck < 5000) {
      console.log(`SWR check for user ${user_id} - last checked ${timeSinceLastCheck}ms ago${isPriorityUser ? ' (priority user)' : ''}`);
    }
    
    // Update the last check time
    global.lastMealReadyCheck[user_id] = now;
    
    // Update Redis tracking for monitoring
    await redis.set(`last_check:${user_id}`, now);
    await redis.expire(`last_check:${user_id}`, 3600);
    
    // First check SWR-specific Redis cache - this is optimized for SWR
    try {
      const swrCacheKey = `swr_meal_ready:${user_id}`;
      const swrCacheData = await redis.get(swrCacheKey);
      
      if (swrCacheData) {
        const swrNotification = JSON.parse(swrCacheData);
        
        // Return the formatted notification for SWR
        if (swrNotification.has_notification && swrNotification.notification?.meal_plan_id) {
          console.log(`[SWR] Found notification in SWR cache: ${swrNotification.notification.meal_plan_id}`);
          
          // Delete the SWR cache entry to prevent duplicates
          await redis.del(swrCacheKey);
          
          // For SWR, we need to follow its expected response format
          return NextResponse.json({
            has_notification: true,
            notification: {
              ...swrNotification.notification,
              timestamp: swrNotification.notification.timestamp || now,
              from_swr_cache: true
            }
          });
        }
      }
    } catch (redisError) {
      console.error('[SWR] Error checking SWR-specific Redis cache:', redisError);
      // Continue with other checks
    }
    
    // Then check the ready plans hash if requested
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
                console.error(`[SWR] Error parsing plan data for ${planId}:`, e);
                return null;
              }
            })
            .filter(plan => plan && !plan.handled); // Filter out null or handled plans
          
          if (readyPlans.length > 0) {
            console.log(`[SWR] Found ${readyPlans.length} ready meal plans for user ${user_id} in Redis`);
            
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
            
            // Track notification delivery for analytics
            await redis.hset('notification_deliveries', `${readyPlan.meal_plan_id}:${now}`, 'swr_redis');
            
            console.log(`
==================================================
[SWR] MEAL PLAN READY NOTIFICATION SENT FROM REDIS
- meal_plan_id: ${readyPlan.meal_plan_id}
- user_id: ${user_id}
- time: ${new Date().toISOString()}
- source: SWR API GET
==================================================
            `);
            
            // For SWR, we format the response consistently
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
        console.error('[SWR] Error checking Redis for ready plans:', redisError);
        // Continue with memory cache as fallback
      }
      
      // Fallback to memory cache (always safe even when throttled)
      const readyPlans = Object.entries(global.readyMealPlans)
        .filter(([_, data]) => data.user_id === user_id && !data.handled)
        .map(([planId, data]) => ({ 
          meal_plan_id: planId,
          timestamp: data.timestamp,
          notification_source: 'memory'
        }));
      
      if (readyPlans.length > 0) {
        // Mark these plans as handled to prevent double notifications
        readyPlans.forEach(plan => {
          if (global.readyMealPlans[plan.meal_plan_id]) {
            global.readyMealPlans[plan.meal_plan_id].handled = true;
          }
        });
        
        console.log(`[SWR] Found ${readyPlans.length} ready meal plans for user ${user_id} via memory cache`);
        
        // Track notification delivery
        await redis.hset('notification_deliveries', `${readyPlans[0].meal_plan_id}:${now}`, 'swr_memory');
        
        // Return the first ready meal plan
        const readyPlan = readyPlans[0];
        return NextResponse.json({
          has_notification: true,
          notification: {
            user_id: user_id,
            meal_plan_id: readyPlan.meal_plan_id,
            timestamp: readyPlan.timestamp || now,
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
      console.error('[SWR] Error getting notification from Redis:', redisError);
      // Fall back to memory cache
    }
      
    // Fall back to memory cache if Redis failed or was throttled
    if (!cachedNotification) {
      cachedNotification = global.mealReadyCache[cacheKey];
    }
      
    if (cachedNotification) {
      // Deduplicate notifications
      const notifKey = `notified:${user_id}:${cachedNotification.meal_plan_id}`;
      let alreadyNotified = false;
      
      try {
        // Check if already notified recently
        alreadyNotified = await redis.exists(notifKey);
      } catch (redisError) {
        console.error('[SWR] Error checking notification status in Redis:', redisError);
        // Fall back to memory tracking
        global.notifiedMealPlans = global.notifiedMealPlans || {};
        const memoryKey = `${user_id}:${cachedNotification.meal_plan_id}`;
        const lastNotified = global.notifiedMealPlans[memoryKey] || 0;
        alreadyNotified = (now - lastNotified < 120000); // 2 minutes
      }
      
      if (alreadyNotified) {
        console.log(`[SWR] Skipping duplicate notification for meal plan ${cachedNotification.meal_plan_id}`);
        return NextResponse.json({
          has_notification: false,
          duplicate: true
        });
      }
      
      // Mark as notified (expires after 2 minutes)
      try {
        await redis.set(notifKey, 'true');
        await redis.expire(notifKey, 120);
      } catch (redisError) {
        console.error('[SWR] Error setting notification status in Redis:', redisError);
        // Fall back to memory tracking
        global.notifiedMealPlans = global.notifiedMealPlans || {};
        const memoryKey = `${user_id}:${cachedNotification.meal_plan_id}`;
        global.notifiedMealPlans[memoryKey] = now;
      }
      
      // Clear notification cache to prevent duplicates
      try {
        await redis.del(cacheKey);
      } catch (redisError) {
        console.error('[SWR] Error deleting notification from Redis:', redisError);
      }
      
      // Also clear memory cache
      delete global.mealReadyCache[cacheKey];
      
      // Track notification delivery
      await redis.hset('notification_deliveries', `${cachedNotification.meal_plan_id}:${now}`, 'swr_direct');
      
      // Add to in-memory ready plans cache for backward compatibility
      global.readyMealPlans = global.readyMealPlans || {};
      global.readyMealPlans[cachedNotification.meal_plan_id] = {
        timestamp: now,
        user_id: user_id,
        handled: false  // This flag helps prevent duplicate handling
      };
      
      console.log(`
==================================================
[SWR] MEAL PLAN READY NOTIFICATION SENT FROM DIRECT CACHE
- meal_plan_id: ${cachedNotification.meal_plan_id}
- user_id: ${user_id}
- time: ${new Date().toISOString()}
==================================================
      `);
      
      return NextResponse.json({
        has_notification: true,
        notification: {
          ...cachedNotification,
          timestamp: now
        }
      });
    }
    
    // No notification found
    return NextResponse.json({
      has_notification: false,
      throttled: isThrottled
    });
  } catch (error) {
    console.error('[SWR] Error checking meal ready status:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}