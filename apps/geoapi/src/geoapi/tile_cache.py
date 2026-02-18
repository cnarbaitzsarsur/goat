"""Redis-based tile cache for distributed deployments.

This module provides a Redis-backed cache for vector tiles, enabling
cache sharing across multiple GeoAPI pods in a Kubernetes deployment.

Features:
- Automatic connection pooling
- Graceful degradation (cache miss on Redis errors)
- Configurable TTL
- Optional gzip flag storage
- Cache stats for monitoring
"""

import logging
from typing import Optional

import redis

from geoapi.config import settings

logger = logging.getLogger(__name__)

# Redis connection pool (shared across all requests)
_redis_pool: Optional[redis.ConnectionPool] = None
_redis_client: Optional[redis.Redis] = None


def get_redis_client() -> Optional[redis.Redis]:
    """Get or create Redis client with connection pooling.

    Returns:
        Redis client or None if caching is disabled or connection fails
    """
    global _redis_pool, _redis_client

    if not settings.TILE_CACHE_ENABLED:
        return None

    if _redis_client is not None:
        return _redis_client

    try:
        _redis_pool = redis.ConnectionPool.from_url(
            settings.REDIS_URL,
            max_connections=20,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        _redis_client = redis.Redis(connection_pool=_redis_pool)
        # Test connection
        _redis_client.ping()
        logger.info("Redis tile cache connected: %s", settings.REDIS_URL)
        return _redis_client
    except Exception as e:
        logger.warning("Redis connection failed, tile caching disabled: %s", e)
        _redis_client = None
        return None


def _cache_key(layer_id: str, z: int, x: int, y: int) -> str:
    """Generate cache key for a tile.

    Format: tile:{layer_id}:{z}/{x}/{y}
    """
    # Normalize layer_id (remove hyphens for consistency)
    layer_id_normalized = layer_id.replace("-", "")
    return f"tile:{layer_id_normalized}:{z}/{x}/{y}"


def get_cached_tile(
    layer_id: str, z: int, x: int, y: int
) -> Optional[tuple[bytes, bool]]:
    """Get tile from Redis cache.

    Args:
        layer_id: Layer UUID
        z, x, y: Tile coordinates

    Returns:
        Tuple of (tile_data, is_gzip) or None if not cached
    """
    client = get_redis_client()
    if client is None:
        return None

    try:
        key = _cache_key(layer_id, z, x, y)
        # Use pipeline for atomic read of data + metadata
        pipe = client.pipeline()
        pipe.get(key)
        pipe.get(f"{key}:gzip")
        results = pipe.execute()

        tile_data = results[0]
        if tile_data is None:
            return None

        # Parse gzip flag (default True for backward compat)
        is_gzip = results[1] != b"0" if results[1] is not None else True

        return (tile_data, is_gzip)

    except Exception as e:
        logger.debug("Redis cache get error: %s", e)
        return None


def cache_tile(
    layer_id: str,
    z: int,
    x: int,
    y: int,
    tile_data: bytes,
    is_gzip: bool,
    ttl: Optional[int] = None,
) -> bool:
    """Store tile in Redis cache.

    Args:
        layer_id: Layer UUID
        z, x, y: Tile coordinates
        tile_data: Tile bytes
        is_gzip: Whether tile is gzip compressed
        ttl: Optional TTL override (uses settings.TILE_CACHE_TTL by default)

    Returns:
        True if cached successfully, False otherwise
    """
    # Don't cache empty tiles or very large tiles (>2MB)
    if not tile_data or len(tile_data) > 2 * 1024 * 1024:
        return False

    client = get_redis_client()
    if client is None:
        return False

    try:
        key = _cache_key(layer_id, z, x, y)
        cache_ttl = ttl if ttl is not None else settings.TILE_CACHE_TTL

        # Use pipeline for atomic write
        pipe = client.pipeline()
        pipe.setex(key, cache_ttl, tile_data)
        pipe.setex(f"{key}:gzip", cache_ttl, "1" if is_gzip else "0")
        pipe.execute()

        return True

    except Exception as e:
        logger.debug("Redis cache set error: %s", e)
        return False


def invalidate_layer_cache(layer_id: str) -> int:
    """Invalidate all cached tiles for a layer.

    Args:
        layer_id: Layer UUID

    Returns:
        Number of keys deleted
    """
    client = get_redis_client()
    if client is None:
        return 0

    try:
        layer_id_normalized = layer_id.replace("-", "")
        pattern = f"tile:{layer_id_normalized}:*"

        # Use SCAN to find keys (safe for large datasets)
        keys: list = []
        cursor = 0
        while True:
            cursor, batch = client.scan(cursor, match=pattern, count=1000)  # type: ignore
            keys.extend(batch)
            if cursor == 0:
                break

        if keys:
            return client.delete(*keys)  # type: ignore
        return 0

    except Exception as e:
        logger.warning("Redis cache invalidation error: %s", e)
        return 0


def get_cache_stats() -> dict:
    """Get Redis cache statistics.

    Returns:
        Dict with cache stats or empty dict if unavailable
    """
    client = get_redis_client()
    if client is None:
        return {"enabled": False, "connected": False}

    try:
        info: dict = client.info("memory")  # type: ignore

        # Count tile keys
        tile_keys = 0
        cursor = 0
        while True:
            cursor, batch = client.scan(cursor, match="tile:*", count=1000)  # type: ignore
            tile_keys += len([k for k in batch if not k.endswith(b":gzip")])
            if cursor == 0:
                break

        return {
            "enabled": True,
            "connected": True,
            "used_memory_mb": round(info.get("used_memory", 0) / 1024 / 1024, 2),
            "used_memory_peak_mb": round(
                info.get("used_memory_peak", 0) / 1024 / 1024, 2
            ),
            "tile_count": tile_keys,
            "ttl_seconds": settings.TILE_CACHE_TTL,
        }

    except Exception as e:
        logger.debug("Redis stats error: %s", e)
        return {"enabled": True, "connected": False, "error": str(e)}
