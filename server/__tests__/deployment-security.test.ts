import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.stubEnv("SPLUNK_HOST", "splunk.example.com");
  vi.stubEnv("SPLUNK_PORT", "8089");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("validateDeploymentSecurity", () => {
  it("fails when HOST is public without OIDC or LOCAL_MODE", async () => {
    vi.stubEnv("HOST", "0.0.0.0");
    vi.resetModules();
    const { validateEnv } = await import("../env.js");
    const { validateDeploymentSecurity } = await import("../deployment-security.js");
    const result = validateEnv();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const errors = validateDeploymentSecurity(result.env);
      expect(errors.some((e) => e.includes("OPSBLAZE_OIDC_ISSUER"))).toBe(true);
    }
  });

  it("allows non-loopback HOST with OPSBLAZE_LOCAL_MODE", async () => {
    vi.stubEnv("HOST", "0.0.0.0");
    vi.stubEnv("OPSBLAZE_LOCAL_MODE", "true");
    vi.resetModules();
    const { validateEnv } = await import("../env.js");
    const { validateDeploymentSecurity } = await import("../deployment-security.js");
    const result = validateEnv();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(validateDeploymentSecurity(result.env)).toEqual([]);
    }
  });

  it("requires OPSBLAZE_OIDC_REDIRECT_URI when OIDC is enabled", async () => {
    vi.stubEnv("OPSBLAZE_OIDC_ISSUER", "https://login.example.com/");
    vi.stubEnv("OPSBLAZE_OIDC_CLIENT_ID", "client");
    vi.stubEnv("OPSBLAZE_OIDC_CLIENT_SECRET", "secret");
    vi.stubEnv("OPSBLAZE_SESSION_SECRET", "a".repeat(32));
    vi.resetModules();
    const { validateEnv } = await import("../env.js");
    const result = validateEnv();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("OPSBLAZE_OIDC_REDIRECT_URI"))).toBe(true);
    }
  });
});
