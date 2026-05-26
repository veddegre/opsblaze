import { describe, it, expect } from "vitest";
import {
  parseIndexesFromSpl,
  estimateTimeRangeHours,
  validateSplunkQuery,
} from "../splunk-guardrails.js";

describe("splunk guardrails", () => {
  it("parses index= from SPL", () => {
    expect(parseIndexesFromSpl('index=okta | stats count')).toEqual(["okta"]);
    expect(parseIndexesFromSpl('index="main" OR index=security')).toEqual(["main", "security"]);
  });

  it("rejects disallowed indexes", () => {
    const g = { allowedIndexes: ["okta", "main"], maxTimeRangeHours: 168 };
    expect(validateSplunkQuery(g, "index=okta | stats count", "-24h", "now")).toBeNull();
    expect(validateSplunkQuery(g, "index=audit | stats count", "-24h", "now")).toMatch(
      /not allowed/
    );
    expect(validateSplunkQuery(g, "| stats count", "-24h", "now")).toMatch(/must include/);
  });

  it("enforces max time range", () => {
    const g = { allowedIndexes: [], maxTimeRangeHours: 24 };
    expect(validateSplunkQuery(g, "index=main", "-7d", "now")).toMatch(/exceeds/);
    expect(validateSplunkQuery(g, "index=main", "-12h", "now")).toBeNull();
  });

  it("estimates relative time windows", () => {
    expect(estimateTimeRangeHours("-24h", "now")).toBe(24);
    expect(estimateTimeRangeHours("-7d", "now")).toBe(168);
  });
});
