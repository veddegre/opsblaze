import { describe, it, expect } from "vitest";
import {
  normalizeSplunkToolArgs,
  splQueryFingerprint,
  compactSplunkToolResultForModel,
  duplicateSplunkToolContent,
  buildFallbackInvestigationSummary,
  validateSplunkToolArgs,
  extractSplFromToolArgs,
  isTimeOnlyMisplacedAsSpl,
} from "../openwebui-splunk-tools.js";

describe("openwebui-splunk-tools", () => {
  it("rejects spl=0 as a time misplaced in spl field", () => {
    expect(isTimeOnlyMisplacedAsSpl("0")).toBe(true);
    expect(validateSplunkToolArgs({ spl: "0", earliest: "-24h" })).toMatch(/time value/i);
    expect(extractSplFromToolArgs({ spl: "0", query: "index=main" })).toBe("index=main");
  });

  it("maps query to spl and sets defaults", () => {
    const out = normalizeSplunkToolArgs({
      query: "index=_audit | head 10",
      vizType: "table",
    });
    expect(out.spl).toBe("index=_audit | head 10");
    expect(out.query).toBeUndefined();
    expect(out.viz_type).toBe("table");
    expect(out.earliest).toBe("-24h");
    expect(out.latest).toBe("now");
  });

  it("fingerprints SPL case-insensitively", () => {
    const a = splQueryFingerprint({ spl: "index=main", earliest: "-24h", latest: "now" });
    const b = splQueryFingerprint({ query: "INDEX=MAIN", earliest: "-24h", latest: "now" });
    expect(a).toBe(b);
  });

  it("strips chart data from model-facing tool JSON", () => {
    const full = JSON.stringify({
      summary: "10 rows",
      chart: { vizType: "table", dataSources: { primary: { data: { columns: [[1, 2, 3]] } } } },
      suppressed: false,
      queryMeta: { spl: "index=main", earliest: "-24h", latest: "now" },
    });
    const compact = compactSplunkToolResultForModel(full);
    const parsed = JSON.parse(compact) as Record<string, unknown>;
    expect(parsed.summary).toBe("10 rows");
    expect(parsed.chart).toBeUndefined();
    expect(parsed.hasChartForUi).toBe(true);
    expect(compact).not.toContain("dataSources");
  });

  it("marks duplicate tool content", () => {
    const prior = compactSplunkToolResultForModel(
      JSON.stringify({ summary: "5 rows", suppressed: false })
    );
    const dup = JSON.parse(duplicateSplunkToolContent(prior)) as { duplicate: boolean };
    expect(dup.duplicate).toBe(true);
  });

  it("builds fallback summary from executed queries", () => {
    const executed = new Map<string, string>();
    executed.set(
      "fp1",
      JSON.stringify({
        summary: "3 login failures",
        queryMeta: { spl: "index=_audit action=login", earliest: "-7d", latest: "now" },
      })
    );
    const md = buildFallbackInvestigationSummary(executed);
    expect(md).toContain("login failures");
    expect(md).toContain("index=_audit");
  });
});
