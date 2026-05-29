import { afterEach, describe, expect, it, vi } from "vitest";
import { getCached, setCached } from "../cache.js";

describe("threat-intel cache", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("stores and retrieves values within TTL", () => {
    setCached("vt:1.1.1.1", "hello");
    expect(getCached("vt:1.1.1.1")).toBe("hello");
  });

  it("expires entries after TTL", () => {
    vi.stubEnv("THREAT_INTEL_CACHE_HOURS", "1");
    vi.useFakeTimers();
    setCached("vt:2.2.2.2", "world");
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(getCached("vt:2.2.2.2")).toBeUndefined();
  });

  it("stays bounded under many distinct keys", () => {
    for (let i = 0; i < 6000; i++) {
      setCached(`vt:key-${i}`, String(i));
    }
    // Oldest keys should have been evicted; most recent should remain.
    expect(getCached("vt:key-5999")).toBe("5999");
    expect(getCached("vt:key-0")).toBeUndefined();
  });
});
