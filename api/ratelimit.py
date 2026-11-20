"""In-process rate limiting for the LLM-backed endpoints.

The /chat endpoint spends real money on every call, so it needs a cost ceiling
that does not depend on the caller behaving well. Two independent limits apply:

  * a per-client sliding window, so one visitor cannot monopolise the demo, and
  * a global daily cap, so the total spend is bounded no matter how many
    distinct clients show up.

This is deliberately dependency-free and per-process. The service runs as a
single instance, so a shared store (Redis) would add moving parts without
changing the threat model. With multiple replicas each would enforce its own
share of the limit — swap the backing store at that point; the call sites
stay the same.
"""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque
from datetime import date

from fastapi import Request

# Per-client: requests allowed per rolling window.
CHAT_RATE_LIMIT = int(os.environ.get("CHAT_RATE_LIMIT", "10"))
CHAT_RATE_WINDOW_SECONDS = int(os.environ.get("CHAT_RATE_WINDOW_SECONDS", "60"))

# Global: hard ceiling on total model calls per calendar day (UTC).
CHAT_DAILY_BUDGET = int(os.environ.get("CHAT_DAILY_BUDGET", "500"))

# Only honour X-Forwarded-For when a trusted proxy terminates the connection.
# Left off, the header is ignored — it is trivially spoofable, and trusting it
# blindly would let a single caller mint unlimited identities.
TRUST_PROXY_HEADERS = os.environ.get("TRUST_PROXY_HEADERS", "").lower() in {"1", "true", "yes"}

# Stop the per-client table growing without bound under churn or spoofing.
_MAX_TRACKED_CLIENTS = 10_000


class SlidingWindowLimiter:
    """Fixed-memory sliding window keyed by client identity."""

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, int]:
        """Record an attempt. Returns (allowed, retry_after_seconds)."""
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            if len(self._hits) > _MAX_TRACKED_CLIENTS:
                self._evict(cutoff)
            hits = self._hits[key]
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                return False, max(1, int(hits[0] + self.window - now) + 1)
            hits.append(now)
            return True, 0

    def _evict(self, cutoff: float) -> None:
        """Drop clients whose windows have fully expired. Caller holds the lock."""
        for key in [k for k, v in self._hits.items() if not v or v[-1] <= cutoff]:
            del self._hits[key]


class DailyBudget:
    """Counts model calls per UTC day against a hard ceiling."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self._day = date.today()
        self._count = 0
        self._lock = threading.Lock()

    def check(self) -> bool:
        with self._lock:
            today = date.today()
            if today != self._day:
                self._day, self._count = today, 0
            if self._count >= self.limit:
                return False
            self._count += 1
            return True

    @property
    def remaining(self) -> int:
        with self._lock:
            return max(0, self.limit - self._count) if date.today() == self._day else self.limit


chat_limiter = SlidingWindowLimiter(CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_SECONDS)
chat_budget = DailyBudget(CHAT_DAILY_BUDGET)


def client_key(request: Request) -> str:
    """Best-effort stable identity for the caller."""
    if TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Left-most entry is the originating client as seen by the first proxy.
            return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else "unknown"
