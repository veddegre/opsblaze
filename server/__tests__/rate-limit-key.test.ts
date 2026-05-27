import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request } from "express";

describe("rateLimitKey", () => {
  beforeEach(() => {
    vi.stubEnv("OPSBLAZE_LOCAL_AUTH_FILE", "");
    vi.stubEnv("OPSBLAZE_OIDC_ISSUER", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses ipKeyGenerator for open mode (satisfies express-rate-limit v8 IPv6 check)", async () => {
    const { rateLimitKey } = await import("../rate-limit-key.js");
    const req = {
      ip: "::ffff:192.168.1.10",
      socket: { remoteAddress: "::ffff:192.168.1.10" },
    } as Request;

    expect(rateLimitKey(req)).toBe("ip:192.168.1.10");
  });

  it("uses user id when local auth is enabled", async () => {
    vi.stubEnv("OPSBLAZE_LOCAL_AUTH_FILE", "./data/local-auth.json");
    vi.stubEnv("OPSBLAZE_SESSION_SECRET", "x".repeat(32));

    const { rateLimitKey } = await import("../rate-limit-key.js");
    const req = {
      ip: "203.0.113.1",
      session: { user: { id: "analyst", isAdmin: false, groups: [] } },
    } as unknown as Request;

    expect(rateLimitKey(req)).toBe("user:analyst");
  });
});
