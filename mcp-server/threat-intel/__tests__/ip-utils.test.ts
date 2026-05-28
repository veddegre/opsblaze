import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyIpsForThreatIntel,
  classifyIpForThreatIntel,
  dedupePublicIps,
  isPublicIpv4,
  normalizeIp,
} from "../ip-utils.js";
import {
  clearThreatIntelInternalRangesCache,
  loadParsedThreatIntelInternalRanges,
} from "../../../server/threat-intel-ranges.js";

describe("ip-utils", () => {
  beforeEach(() => {
    clearThreatIntelInternalRangesCache();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    clearThreatIntelInternalRangesCache();
    vi.unstubAllEnvs();
  });

  it("normalizes valid IPv4", () => {
    expect(normalizeIp(" 8.8.8.8 ")).toBe("8.8.8.8");
    expect(normalizeIp("not-an-ip")).toBeNull();
  });

  it("filters private addresses", () => {
    expect(isPublicIpv4("10.0.0.1")).toBe(false);
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
  });

  it("dedupes and caps public IPs", () => {
    const result = dedupePublicIps(["8.8.8.8", "8.8.8.8", "10.0.0.1", "1.1.1.1"], 1);
    expect(result.publicIps).toEqual(["8.8.8.8"]);
    expect(result.skippedPrivate).toEqual(["10.0.0.1"]);
    expect(result.truncated).toBe(true);
  });

  it("skips organization internal ranges before API lookup", () => {
    vi.stubEnv("THREAT_INTEL_INTERNAL_CIDRS", "203.0.113.0/24");
    expect(loadParsedThreatIntelInternalRanges().length).toBeGreaterThan(0);

    const batch = classifyIpsForThreatIntel(["203.0.113.10", "8.8.8.8"], 10);
    expect(batch.skippedInternal).toEqual(["203.0.113.10"]);
    expect(batch.queryable).toEqual(["8.8.8.8"]);

    const single = classifyIpForThreatIntel("203.0.113.10");
    expect(single.skip).toBe(true);
    expect(single.reason).toBe("internal");
  });
});
