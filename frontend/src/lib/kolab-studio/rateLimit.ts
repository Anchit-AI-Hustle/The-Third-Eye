// web/lib/rateLimit.ts
// Fixed-window rate limiter (SECURITY.md §6, §8). In-memory by default so the foundation
// works with zero infra; swap `store` for Redis/Upstash in production (multi-instance) —
// the interface stays the same. Critical for OTP/SMS-pumping and auth abuse.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
}

interface Counter {
  count: number;
  resetAt: number;
}

const store = new Map<string, Counter>();

/**
 * @param key      identity for the bucket, e.g. `otp:send:${ip}:${phone}`
 * @param limit    max requests per window
 * @param windowMs window length in ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count++;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

// Opportunistic cleanup so the map can't grow unbounded in a long-lived process.
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
  }, 60_000);
  // Don't keep the event loop alive just for cleanup.
  (timer as unknown as { unref?: () => void }).unref?.();
}
