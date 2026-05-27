import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../auth/password.js";

describe("password", () => {
  it("hashes and verifies a password", () => {
    const hash = hashPassword("test-secret");
    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(verifyPassword("test-secret", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });
});
