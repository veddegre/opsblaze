import { describe, it, expect, vi } from "vitest";
import { parseThreatIntelResults, emitThreatIntelResults } from "../threat-intel-emit.js";

const enrichPayload = JSON.stringify({
  summary: "Providers: virustotal, abuseipdb",
  providersUsed: ["virustotal", "abuseipdb"],
  skippedPrivate: ["10.0.0.1"],
  skippedInternal: [],
  skippedInvalid: [],
  truncated: false,
  results: [
    {
      provider: "virustotal",
      ip: "8.8.8.8",
      ok: true,
      summary: "0/90 vendors flagged this IP",
      link: "https://virustotal.com/8.8.8.8",
    },
    { provider: "abuseipdb", ip: "8.8.8.8", ok: true, summary: "Abuse score 0%" },
  ],
});

describe("parseThreatIntelResults", () => {
  it("maps enrich_ips results to provider/ip/summary records", () => {
    const out = parseThreatIntelResults(enrichPayload);
    expect(out).toEqual([
      {
        provider: "virustotal",
        ip: "8.8.8.8",
        ok: true,
        summary: "0/90 vendors flagged this IP",
        link: "https://virustotal.com/8.8.8.8",
      },
      { provider: "abuseipdb", ip: "8.8.8.8", ok: true, summary: "Abuse score 0%" },
    ]);
  });

  it("drops the empty-ip placeholder from the no-providers response", () => {
    const payload = JSON.stringify({
      providersUsed: [],
      results: [{ provider: "virustotal", ip: "", ok: false, summary: "No providers enabled" }],
    });
    expect(parseThreatIntelResults(payload)).toBeNull();
  });

  it("ignores Splunk tool results", () => {
    const splunk = JSON.stringify({ summary: "5 events", chart: null, suppressed: false });
    expect(parseThreatIntelResults(splunk)).toBeNull();
  });

  it("ignores classify_organization_ips results (no providersUsed)", () => {
    const classify = JSON.stringify({
      zonesConfigured: ["campus"],
      results: [{ ip: "10.0.0.5", zone: "campus", inOrganizationRange: true }],
      skippedInvalid: [],
    });
    expect(parseThreatIntelResults(classify)).toBeNull();
  });

  it("returns null for non-JSON", () => {
    expect(parseThreatIntelResults("not json")).toBeNull();
  });
});

describe("emitThreatIntelResults", () => {
  it("emits a threatintel event when the payload is an enrichment result", () => {
    const emit = vi.fn();
    emitThreatIntelResults(enrichPayload, emit);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("threatintel", {
      results: expect.arrayContaining([expect.objectContaining({ ip: "8.8.8.8" })]),
    });
  });

  it("does not emit for unrelated tool results", () => {
    const emit = vi.fn();
    emitThreatIntelResults(JSON.stringify({ summary: "x", chart: null }), emit);
    expect(emit).not.toHaveBeenCalled();
  });
});
