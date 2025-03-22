# app/utils/redis_client.py
import os
import json
import redis
import logging
from typing import Any, Optional, Dict, List, Union
import pickle

# Configure logging
logger = logging.getLogger(__name__)

# Redis connection
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "redis"),
    port=int(os.getenv("REDIS_PORT", "6379")),
    db=int(os.getenv("REDIS_DB", "0")),
    password=os.getenv("REDIS_PASSWORD", None),
    decode_responses=False  # Set to False to allow storing binary data
)

# Default TTLs in seconds
DEFAULT_CACHE_TTL = 3600  # 1 hour
MEAL_CACHE_TTL = 86400  # 24 hours
PROFILE_CACHE_TTL = 3600 * 24 * 7  # 1 week
USDA_CACHE_TTL = 3600 * 24 * 30  # 30 days
AUTH_CACHE_TTL = 300  # 5 minutes

def get_cache(key: str) -> Optional[Any]:
    """Get a value from Redis cache, handling serialization."""
    try:
        data = redis_client.get(key)
        if data:
            return pickle.loads(data)
        return None
    except Exception as e:
        logger.error(f"Redis get error for key {key}: {str(e)}")
        return None

def set_cache(key: str, value: Any, ttl: int = DEFAULT_CACHE_TTL) -> bool:
    """Set a value in Redis cache with TTL, handling serialization."""
    try:
        serialized = pickle.dumps(value)
        return redis_client.setex(key, ttl, serialized)
    except Exception as e:
        logger.error(f"Redis set error for key {key}: {str(e)}")
        return False

def delete_cache(key: str) -> bool:
    """Delete a key from Redis cache."""
    try:
        return redis_client.delete(key) > 0
    except Exception as e:
        logger.error(f"Redis delete error for key {key}: {str(e)}")
        return False

def flush_pattern(pattern: str) -> int:
    """Delete all keys matching a pattern."""
    try:
        keys = redis_client.keys(pattern)
        if keys:
            return redis_client.delete(*keys)
        return 0
    except Exception as e:
        logger.error(f"Redis flush error for pattern {pattern}: {str(e)}")
        return 0

def health_check() -> bool:
    """Check if Redis is responsive."""
    try:
        return redis_client.ping()
    except Exception as e:
        logger.error(f"Redis health check failed: {str(e)}")
        return False