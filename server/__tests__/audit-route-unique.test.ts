import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const indexPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../index.ts");

describe("audit route registration", () => {
  it("registers GET /api/audit exactly once (guards against duplicate handlers)", () => {
    const src = readFileSync(indexPath, "utf-8");
    const matches = src.match(/app\.get\(\s*["']\/api\/audit["']/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
