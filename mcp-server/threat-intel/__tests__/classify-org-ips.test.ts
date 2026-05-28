import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearThreatIntelInternalRangesCache } from "../../../server/threat-intel-ranges.js";
import { classifyOrganizationIpsForTool } from "../classify-org-ips.js";

describe("classify_organization_ips", () => {
  beforeEach(() => {
    clearThreatIntelInternalRangesCache();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    clearThreatIntelInternalRangesCache();
    vi.unstubAllEnvs();
  });

  it("classifies env zone and external IPs", () => {
    vi.stubEnv("THREAT_INTEL_INTERNAL_CIDRS", "203.0.113.0/24");
    const payload = classifyOrganizationIpsForTool(["203.0.113.10", "8.8.8.8", "bad"]);
    expect(payload.results.find((r) => r.ip === "203.0.113.10")).toMatchObject({
      zone: "env",
      defaultPosture: "neutral",
      inOrganizationRange: true,
      threatIntelSkipped: true,
    });
    expect(payload.results.find((r) => r.ip === "8.8.8.8")).toMatchObject({
      zone: null,
      inOrganizationRange: false,
      isPublic: true,
      threatIntelSkipped: false,
    });
    expect(payload.skippedInvalid).toEqual(["bad"]);
  });
});
