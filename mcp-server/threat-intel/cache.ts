const cache = new Map<string, { expires: number; value: string }>();

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
  cache.set(key, { expires: Date.now() + ttlMs(), value });
}
