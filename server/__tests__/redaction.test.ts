import { describe, it, expect } from "vitest";
import {
  redactText,
  redactConversation,
  compileRedactionPatterns,
  parseStringList,
  validateCustomPatterns,
  normalizeExportRedactionTerms,
  REDACTION_PLACEHOLDER,
  MAX_EXPORT_REDACTION_TERM_LEN,
} from "../redaction.js";
import type { StoredConversation } from "../conversations.js";

describe("redactText", () => {
  it("redacts email and IPv4 when enabled", () => {
    const patterns = compileRedactionPatterns({
      settings: { builtin: { email: true, ipv4: true, mac: false }, customStrings: [] },
    });
    const out = redactText("Contact alice@corp.com from 10.1.2.3", patterns);
    expect(out).toContain(REDACTION_PLACEHOLDER);
    expect(out).not.toContain("alice@corp.com");
    expect(out).not.toContain("10.1.2.3");
  });

  it("redacts custom literals case-insensitively", () => {
    const patterns = compileRedactionPatterns({
      settings: { builtin: { email: false, ipv4: false }, customStrings: ["SecretHost"] },
    });
    expect(redactText("seen on secrethost twice", patterns)).toBe(
      `seen on ${REDACTION_PLACEHOLDER} twice`
    );
  });

  it("merges per-investigation strings", () => {
    const patterns = compileRedactionPatterns({
      settings: { builtin: {}, customStrings: ["global"] },
      conversationStrings: ["local"],
    });
    const out = redactText("global and local", patterns);
    expect(out).not.toContain("global");
    expect(out).not.toContain("local");
  });
});

describe("redactConversation", () => {
  it("redacts nested chart data", () => {
    const conv: StoredConversation = {
      id: "c1",
      title: "Report for alice@corp.com",
      messages: [
        {
          role: "assistant",
          blocks: [
            {
              type: "chart",
              vizType: "table",
              spl: 'index=main user="alice@corp.com"',
              dataSources: {
                primary: {
                  data: {
                    fields: [{ name: "user" }],
                    columns: [["alice@corp.com"]],
                  },
                },
              },
            },
          ],
        },
      ],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const redacted = redactConversation(conv, {
      settings: { builtin: { email: true, ipv4: false } },
    });
    expect(redacted.title).toContain(REDACTION_PLACEHOLDER);
    const json = JSON.stringify(redacted);
    expect(json).not.toContain("alice@corp.com");
  });
});

describe("parseStringList", () => {
  it("deduplicates and trims lines", () => {
    expect(parseStringList("  foo \nbar\nfoo\n")).toEqual(["foo", "bar"]);
  });
});

describe("validateCustomPatterns", () => {
  it("rejects invalid regex", () => {
    expect(validateCustomPatterns(["("]).length).toBeGreaterThan(0);
  });

  it("rejects nested quantifier patterns", () => {
    expect(validateCustomPatterns(["(a+)+"]).length).toBeGreaterThan(0);
  });
});

describe("normalizeExportRedactionTerms", () => {
  it("caps term length and deduplicates", () => {
    const long = "x".repeat(MAX_EXPORT_REDACTION_TERM_LEN + 50);
    const out = normalizeExportRedactionTerms(["foo", "FOO", long]);
    expect(out).toEqual(["foo", "x".repeat(MAX_EXPORT_REDACTION_TERM_LEN)]);
  });
});
