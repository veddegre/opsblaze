import { describe, it, expect } from "vitest";
import { qualifyToolName, parseQualifiedToolName } from "../mcp-runtime.js";

describe("MCP tool naming", () => {
  it("qualifies and parses server__tool names", () => {
    const qualified = qualifyToolName("opsblaze-splunk", "splunk_query");
    expect(qualified).toBe("opsblaze-splunk__splunk_query");
    expect(parseQualifiedToolName(qualified)).toEqual({
      serverName: "opsblaze-splunk",
      toolName: "splunk_query",
    });
  });

  it("returns null for invalid qualified names", () => {
    expect(parseQualifiedToolName("no-separator")).toBeNull();
    expect(parseQualifiedToolName("__onlytool")).toBeNull();
  });
});
