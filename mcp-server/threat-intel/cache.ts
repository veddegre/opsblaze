const cache = new Map<string, { expires: number; value: string }>();

const MAX_ENTRIES = 5_000;

function ttlMs(): number {
  const hours = Number(process.env.THREAT_INTEL_CACHE_HOURS ?? "24");
  if (!Number.isFinite(hours) || hours <= 0) return 24 * 60 * 60 * 1000;
  return Math.min(168, hours) * 60 * 60 * 1000;
}

export function getCached(key: string): string | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCached(key: string, value: string): void {
  // Bound memory: drop expired entries first, then evict oldest (insertion order) if still full.
  if (cache.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, entry] of cache) {
      if (now > entry.expires) cache.delete(k);
    }
    while (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
  cache.set(key, { expires: Date.now() + ttlMs(), value });
}
