// A small in-memory limiter: at most `limit` calls per key in each window.
//
// It lives in one server process. That is real protection for a self-hosted
// copy, and on serverless hosting it slows a burst that lands on one warm
// instance, but each instance counts on its own and forgets on restart. A
// limit that holds across instances needs a shared store or the host's own
// firewall rule.

export type RateLimiter = {
  /** Counts one call for `key` and says whether it is within the limit. */
  allow(key: string): boolean;
};

const MAX_KEYS = 5000;

export function createRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): RateLimiter {
  const hits = new Map<string, { windowStart: number; count: number }>();
  return {
    allow(key) {
      const at = now();
      const entry = hits.get(key);
      if (!entry || at - entry.windowStart >= windowMs) {
        // Bounded: a flood of made-up keys pushes out the oldest, not memory.
        if (!entry && hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value as string);
        hits.delete(key);
        hits.set(key, { windowStart: at, count: 1 });
        return true;
      }
      entry.count += 1;
      return entry.count <= limit;
    },
  };
}

/** The caller's address as the host reports it, for use as a limiter key. */
export function clientKey(headers: { get(name: string): string | null }): string {
  // The first entry is the client. Later ones are proxies.
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
