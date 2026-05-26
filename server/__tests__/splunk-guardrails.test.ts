import { describe, it, expect } from "vitest";
import {
  parseIndexesFromSpl,
  estimateTimeRangeHours,
  validateSplunkQuery,
  applySplunkGuardrailsForUser,
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

  it("merges admin extra indexes into allowlist", () => {
    const prev = process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_EXTRA_INDEXES;
    const prevBypass = process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_BYPASS_INDEXES;
    process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_EXTRA_INDEXES = "audit,_internal";
    delete process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_BYPASS_INDEXES;

    const base = { allowedIndexes: ["okta", "main"], maxTimeRangeHours: 168 };
    const effective = applySplunkGuardrailsForUser(base, { isAdmin: true });
    expect(effective.allowedIndexes).toEqual(
      expect.arrayContaining(["okta", "main", "audit", "_internal"])
    );

    if (prev === undefined) delete process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_EXTRA_INDEXES;
    else process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_EXTRA_INDEXES = prev;
    if (prevBypass === undefined) delete process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_BYPASS_INDEXES;
    else process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_BYPASS_INDEXES = prevBypass;
  });

  it("allows admin bypass to clear index allowlist", () => {
    const prev = process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_BYPASS_INDEXES;
    process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_BYPASS_INDEXES = "true";

    const base = { allowedIndexes: ["okta"], maxTimeRangeHours: 24 };
    const effective = applySplunkGuardrailsForUser(base, { isAdmin: true });
    expect(effective.allowedIndexes).toEqual([]);
    expect(validateSplunkQuery(effective, "index=secret | stats count", "-1h", "now")).toBeNull();

    if (prev === undefined) delete process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_BYPASS_INDEXES;
    else process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_BYPASS_INDEXES = prev;
  });
});
