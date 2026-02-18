"""Simple in-memory metrics for tile request profiling.

Tracks slowest requests, concurrent load, and resource usage.
Access via GET /metrics endpoint.
"""

import os
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import psutil


@dataclass
class RequestMetrics:
    """Metrics for a single request."""

    request_id: str
    layer_id: str
    z: int
    x: int
    y: int
    start_time: float
    end_time: float = 0.0
    duration_ms: float = 0.0
    tile_size: int = 0
    source: str = ""  # pmtiles, pmtiles-overzoom, dynamic
    concurrent_requests: int = 0
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    overzoom_from: Optional[str] = None  # e.g., "6/33/21"
    error: Optional[str] = None


@dataclass
class TileMetricsCollector:
    """Collects and analyzes tile request metrics."""

    # Ring buffer for recent requests (last 1000)
    recent_requests: deque = field(default_factory=lambda: deque(maxlen=1000))
    # Track slowest requests (top 50)
    slowest_requests: list = field(default_factory=list)
    max_slowest: int = 50
    # Concurrent request tracking
    active_requests: int = 0
    peak_concurrent: int = 0
    # Lock for thread safety
    _lock: threading.Lock = field(default_factory=threading.Lock)
    # Total stats
    total_requests: int = 0
    total_errors: int = 0
    # Per-layer stats
    layer_stats: dict = field(default_factory=dict)
    # Process for CPU/memory tracking
    _process: psutil.Process = field(
        default_factory=lambda: psutil.Process(os.getpid())
    )

    def start_request(
        self, request_id: str, layer_id: str, z: int, x: int, y: int
    ) -> RequestMetrics:
        """Start tracking a request."""
        with self._lock:
            self.active_requests += 1
            self.peak_concurrent = max(self.peak_concurrent, self.active_requests)

        metrics = RequestMetrics(
            request_id=request_id,
            layer_id=layer_id,
            z=z,
            x=x,
            y=y,
            start_time=time.monotonic(),
            concurrent_requests=self.active_requests,
            cpu_percent=self._process.cpu_percent(),
            memory_mb=self._process.memory_info().rss / 1024 / 1024,
        )
        return metrics

    def end_request(
        self,
        metrics: RequestMetrics,
        tile_size: int = 0,
        source: str = "",
        overzoom_from: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        """End tracking a request and record stats."""
        metrics.end_time = time.monotonic()
        metrics.duration_ms = (metrics.end_time - metrics.start_time) * 1000
        metrics.tile_size = tile_size
        metrics.source = source
        metrics.overzoom_from = overzoom_from
        metrics.error = error

        with self._lock:
            self.active_requests = max(0, self.active_requests - 1)
            self.total_requests += 1
            if error:
                self.total_errors += 1

            # Add to recent requests
            self.recent_requests.append(metrics)

            # Update slowest requests
            self.slowest_requests.append(metrics)
            self.slowest_requests.sort(key=lambda m: -m.duration_ms)
            self.slowest_requests = self.slowest_requests[: self.max_slowest]

            # Update per-layer stats
            layer_id = metrics.layer_id[:8]  # Short ID
            if layer_id not in self.layer_stats:
                self.layer_stats[layer_id] = {
                    "count": 0,
                    "total_ms": 0.0,
                    "max_ms": 0.0,
                    "total_bytes": 0,
                    "errors": 0,
                }
            stats = self.layer_stats[layer_id]
            stats["count"] += 1
            stats["total_ms"] += metrics.duration_ms
            stats["max_ms"] = max(stats["max_ms"], metrics.duration_ms)
            stats["total_bytes"] += tile_size
            if error:
                stats["errors"] += 1

    def get_stats(self) -> dict:
        """Get current metrics summary."""
        with self._lock:
            # Current resource usage
            cpu = self._process.cpu_percent()
            mem = self._process.memory_info()

            # Calculate percentiles from recent requests
            durations = [r.duration_ms for r in self.recent_requests]
            durations_sorted = sorted(durations) if durations else [0]

            def percentile(p: int) -> float:
                if not durations_sorted:
                    return 0.0
                idx = int(len(durations_sorted) * p / 100)
                return durations_sorted[min(idx, len(durations_sorted) - 1)]

            # Layer stats sorted by max time
            layer_summary = []
            for layer_id, stats in self.layer_stats.items():
                layer_summary.append(
                    {
                        "layer": layer_id,
                        "requests": stats["count"],
                        "avg_ms": stats["total_ms"] / stats["count"]
                        if stats["count"] > 0
                        else 0,
                        "max_ms": stats["max_ms"],
                        "total_mb": stats["total_bytes"] / 1024 / 1024,
                        "errors": stats["errors"],
                    }
                )
            layer_summary.sort(key=lambda x: -x["max_ms"])

            return {
                "current": {
                    "active_requests": self.active_requests,
                    "cpu_percent": cpu,
                    "memory_mb": mem.rss / 1024 / 1024,
                    "memory_percent": mem.rss / psutil.virtual_memory().total * 100,
                },
                "totals": {
                    "total_requests": self.total_requests,
                    "total_errors": self.total_errors,
                    "peak_concurrent": self.peak_concurrent,
                },
                "latency_ms": {
                    "p50": percentile(50),
                    "p90": percentile(90),
                    "p95": percentile(95),
                    "p99": percentile(99),
                    "max": percentile(100),
                },
                "slowest_requests": [
                    {
                        "id": r.request_id,
                        "layer": r.layer_id[:8],
                        "tile": f"{r.z}/{r.x}/{r.y}",
                        "duration_ms": round(r.duration_ms, 1),
                        "size_kb": round(r.tile_size / 1024, 1),
                        "source": r.source,
                        "overzoom": r.overzoom_from,
                        "concurrent": r.concurrent_requests,
                        "cpu": round(r.cpu_percent, 1),
                        "mem_mb": round(r.memory_mb, 1),
                    }
                    for r in self.slowest_requests[:20]
                ],
                "by_layer": layer_summary[:10],
            }

    def get_cache_stats(self) -> dict:
        """Get tile cache statistics (Redis + PMTiles reader cache)."""
        try:
            from geoapi.services.tile_service import _pmtiles_reader_cache
            from geoapi.tile_cache import get_cache_stats as get_redis_stats

            redis_stats = get_redis_stats()
            return {
                "redis": redis_stats,
                "reader_cache_entries": len(_pmtiles_reader_cache),
            }
        except Exception:
            return {}

    def reset(self) -> None:
        """Reset all metrics."""
        with self._lock:
            self.recent_requests.clear()
            self.slowest_requests.clear()
            self.total_requests = 0
            self.total_errors = 0
            self.peak_concurrent = 0
            self.layer_stats.clear()


# Global metrics instance
tile_metrics = TileMetricsCollector()
