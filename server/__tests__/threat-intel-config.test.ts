import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("threat-intel-config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables only VirusTotal when AbuseIPDB is disabled", async () => {
    vi.stubEnv("VIRUSTOTAL_API_KEY", "vt-key");
    vi.stubEnv("ABUSEIPDB_API_KEY", "aip-key");
    vi.stubEnv("ABUSEIPDB_ENABLED", "false");
    const mod = await import("../threat-intel-config.js");
    expect(mod.getActiveThreatIntelProviders()).toEqual(["virustotal"]);
  });

  it("enables only AbuseIPDB when VirusTotal is disabled", async () => {
    vi.stubEnv("VIRUSTOTAL_API_KEY", "vt-key");
    vi.stubEnv("ABUSEIPDB_API_KEY", "aip-key");
    vi.stubEnv("VIRUSTOTAL_ENABLED", "false");
    const mod = await import("../threat-intel-config.js");
    expect(mod.getActiveThreatIntelProviders()).toEqual(["abuseipdb"]);
  });

  it("disables all providers when THREAT_INTEL_ENABLED=false", async () => {
    vi.stubEnv("VIRUSTOTAL_API_KEY", "vt-key");
    vi.stubEnv("ABUSEIPDB_API_KEY", "aip-key");
    vi.stubEnv("THREAT_INTEL_ENABLED", "false");
    const mod = await import("../threat-intel-config.js");
    expect(mod.getActiveThreatIntelProviders()).toEqual([]);
  });

  it("defaults provider on when key is set", async () => {
    vi.stubEnv("VIRUSTOTAL_API_KEY", "vt-key");
    const mod = await import("../threat-intel-config.js");
    expect(mod.isThreatIntelProviderConfigured("virustotal")).toBe(true);
    expect(mod.isThreatIntelProviderConfigured("abuseipdb")).toBe(false);
  });
});
