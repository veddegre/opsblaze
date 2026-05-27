import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LEN = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/** Format: scrypt:<salt-b64>:<hash-b64> */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, SCRYPT_OPTIONS);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    if (expected.length !== KEY_LEN) return false;
    const actual = scryptSync(password, salt, KEY_LEN, SCRYPT_OPTIONS);
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
