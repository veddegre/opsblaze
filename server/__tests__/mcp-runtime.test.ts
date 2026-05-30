import { describe, it, expect } from "vitest";
import { qualifyToolName, parseQualifiedToolName, resolveToolInvocation } from "../mcp-runtime.js";
import type { McpToolServerRef } from "../mcp-runtime.js";

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

describe("resolveToolInvocation", () => {
  const servers: McpToolServerRef[] = [
    {
      name: "opsblaze-splunk",
      tools: [{ name: "splunk_query" }, { name: "splunk_indexes" }],
    },
  ];

  it("resolves qualified tool names", () => {
    expect(resolveToolInvocation("opsblaze-splunk__splunk_query", servers)).toEqual({
      serverName: "opsblaze-splunk",
      toolName: "splunk_query",
    });
  });

  it("resolves bare splunk_query from models that omit the server prefix", () => {
    expect(resolveToolInvocation("splunk_query", servers)).toEqual({
      serverName: "opsblaze-splunk",
      toolName: "splunk_query",
    });
  });

  it("returns a helpful error for unknown tools", () => {
    const result = resolveToolInvocation("missing_tool", servers);
    expect(result).toHaveProperty("error");
    expect(String((result as { error: string }).error)).toContain("Tool not found");
    expect(String((result as { error: string }).error)).toContain("splunk_query");
  });

  it("rejects empty tool names", () => {
    const result = resolveToolInvocation("  ", servers);
    expect(result).toHaveProperty("error");
  });
});
