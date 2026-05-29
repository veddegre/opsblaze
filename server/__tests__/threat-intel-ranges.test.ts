import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  classifyOrganizationIp,
  clearThreatIntelInternalRangesCache,
  isIpv4InInternalRanges,
  loadParsedThreatIntelInternalRanges,
  parseInternalRangeEntry,
  validateThreatIntelInternalCidrs,
} from "../threat-intel-ranges.js";

describe("threat-intel-ranges", () => {
  beforeEach(() => {
    clearThreatIntelInternalRangesCache();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    clearThreatIntelInternalRangesCache();
    vi.unstubAllEnvs();
  });

  it("parses host and CIDR entries", () => {
    const cidr = parseInternalRangeEntry("10.0.0.0/8");
    expect(cidr).not.toBeNull();
    expect(isIpv4InInternalRanges("10.1.2.3", [cidr!])).toBe(true);
    expect(isIpv4InInternalRanges("8.8.8.8", [cidr!])).toBe(false);

    const host = parseInternalRangeEntry("203.0.113.5");
    expect(host).not.toBeNull();
    expect(isIpv4InInternalRanges("203.0.113.5", [host!])).toBe(true);
    expect(isIpv4InInternalRanges("203.0.113.6", [host!])).toBe(false);
  });

  it("validates CIDR list on save", () => {
    expect(validateThreatIntelInternalCidrs(["10.0.0.0/8", "bad-range"])).toEqual([
      "Invalid internal IPv4 range: bad-range",
    ]);
    expect(validateThreatIntelInternalCidrs(["10.0.0.0/8", "10.0.0.0/8"])).toEqual([
      "Duplicate internal range: 10.0.0.0/8",
    ]);
  });

  it("loads ranges from THREAT_INTEL_INTERNAL_CIDRS env", () => {
    vi.stubEnv("THREAT_INTEL_INTERNAL_CIDRS", "198.51.100.0/24");
    const ranges = loadParsedThreatIntelInternalRanges();
    expect(ranges.length).toBe(1);
    expect(isIpv4InInternalRanges("198.51.100.42", ranges)).toBe(true);
  });

  it("still applies env ranges when a user zone reuses the reserved name", () => {
    // Regression: a user zone named `env` must NOT cause THREAT_INTEL_INTERNAL_CIDRS to be
    // dropped (which would leak those IPs to third-party APIs).
    vi.stubEnv("THREAT_INTEL_INTERNAL_CIDRS", "198.51.100.0/24");
    const ranges = classifyOrganizationIp("198.51.100.42");
    expect(ranges?.inOrganizationRange).toBe(true);
    expect(ranges?.threatIntelSkipped).toBe(true);
  });
});
