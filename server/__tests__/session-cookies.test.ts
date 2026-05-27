import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("resolveSecureCookies", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.OPSBLAZE_SECURE_COOKIES;
    delete process.env.OPSBLAZE_PUBLIC_URL;
  });

  afterEach(() => {
    process.env = env;
  });

  it("defaults to false without explicit https public URL", async () => {
    const { resolveSecureCookies } = await import("../auth/session-cookies.js");
    expect(resolveSecureCookies()).toBe(false);
  });

  it("honors OPSBLAZE_SECURE_COOKIES=true", async () => {
    process.env.OPSBLAZE_SECURE_COOKIES = "true";
    const { resolveSecureCookies } = await import("../auth/session-cookies.js");
    expect(resolveSecureCookies()).toBe(true);
  });

  it("enables when OPSBLAZE_PUBLIC_URL is https", async () => {
    process.env.OPSBLAZE_PUBLIC_URL = "https://opsblaze.example.edu";
    const { resolveSecureCookies } = await import("../auth/session-cookies.js");
    expect(resolveSecureCookies()).toBe(true);
  });

  it("respects explicit false even with https public URL", async () => {
    process.env.OPSBLAZE_PUBLIC_URL = "https://opsblaze.example.edu";
    process.env.OPSBLAZE_SECURE_COOKIES = "false";
    const { resolveSecureCookies } = await import("../auth/session-cookies.js");
    expect(resolveSecureCookies()).toBe(false);
  });
});
