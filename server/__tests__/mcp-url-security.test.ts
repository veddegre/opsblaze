import { describe, it, expect } from "vitest";
import { assertAllowedMcpRemoteUrl } from "../mcp-url-security.js";

describe("assertAllowedMcpRemoteUrl", () => {
  it("allows public HTTPS URLs", () => {
    expect(() => assertAllowedMcpRemoteUrl("https://example.com/mcp")).not.toThrow();
  });

  it("blocks localhost", () => {
    expect(() => assertAllowedMcpRemoteUrl("http://localhost:8080/mcp")).toThrow(
      /not allowed|private|reserved/i
    );
  });

  it("blocks RFC1918 IPv4", () => {
    expect(() => assertAllowedMcpRemoteUrl("http://192.168.1.1/mcp")).toThrow(
      /private|reserved/i
    );
    expect(() => assertAllowedMcpRemoteUrl("http://10.0.0.5/mcp")).toThrow(/private|reserved/i);
  });

  it("blocks link-local metadata IP", () => {
    expect(() => assertAllowedMcpRemoteUrl("http://169.254.169.254/latest")).toThrow(
      /private|reserved/i
    );
  });

  it("blocks non-http protocols", () => {
    expect(() => assertAllowedMcpRemoteUrl("ftp://example.com")).toThrow(/http or https/i);
  });
});
