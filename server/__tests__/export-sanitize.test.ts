import { describe, it, expect } from "vitest";
import {
  isErrorTextContent,
  isTrivialUserText,
  sanitizeMessagesForExport,
} from "../export-sanitize.js";

describe("isErrorTextContent", () => {
  it("detects markdown error callouts", () => {
    expect(isErrorTextContent("\n\n> **Error:** Open WebUI: Server Connection Error\n\n")).toBe(
      true
    );
  });
});

describe("isTrivialUserText", () => {
  it("flags retry prompts", () => {
    expect(isTrivialUserText("Can you try again")).toBe(true);
    expect(isTrivialUserText("try again")).toBe(true);
  });

  it("keeps substantive questions", () => {
    expect(isTrivialUserText("Show failed logins for the last 24 hours")).toBe(false);
  });
});

describe("sanitizeMessagesForExport", () => {
  const noisy = [
    { role: "user", blocks: [{ type: "text", content: "Analyze failed logins" }] },
    {
      role: "assistant",
      blocks: [
        { type: "text", content: "\n\n> **Error:** Open WebUI: Server Connection Error\n\n" },
      ],
    },
    { role: "user", blocks: [{ type: "text", content: "Can you try again" }] },
    { role: "user", blocks: [{ type: "text", content: "Can you try again" }] },
    {
      role: "assistant",
      blocks: [
        { type: "text", content: "Here are the results." },
        {
          type: "chart",
          vizType: "table",
          dataSources: {
            primary: { data: { fields: [{ name: "c" }], columns: [[1]] } },
          },
        },
      ],
    },
  ];

  it("removes errors, retries, and duplicate user lines in full mode", () => {
    const out = sanitizeMessagesForExport(noisy, { mode: "full", clean: true });
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe("user");
    expect(textFrom(out[0])).toBe("Analyze failed logins");
    expect(textFrom(out[1])).toContain("Here are the results");
    expect(JSON.stringify(out)).not.toContain("try again");
    expect(JSON.stringify(out)).not.toContain("Server Connection Error");
  });

  it("keeps only chart findings in findings mode", () => {
    const out = sanitizeMessagesForExport(noisy, { mode: "findings", clean: true });
    expect(out).toHaveLength(1);
    expect(out[0].blocks.some((b) => b.type === "chart")).toBe(true);
    expect(textFrom(out[0])).toBe("");
  });

  it("preserves everything when clean is false", () => {
    const out = sanitizeMessagesForExport(noisy, { mode: "full", clean: false });
    expect(out).toHaveLength(5);
  });
});

function textFrom(msg: { blocks: Array<{ type: string; content?: string }> }): string {
  return msg.blocks
    .filter((b) => b.type === "text")
    .map((b) => b.content ?? "")
    .join("");
}
