import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readdir, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { rotateAuditFileIfNeeded, pruneRotatedAuditFiles } from "../audit-log.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "opsblaze-audit-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("rotateAuditFileIfNeeded", () => {
  it("does not rotate when under the size cap", async () => {
    const filePath = path.join(dir, "audit.jsonl");
    await writeFile(filePath, "small\n");
    const result = await rotateAuditFileIfNeeded({ filePath, maxBytes: 1_000_000 });
    expect(result).toBeNull();
    await expect(stat(filePath)).resolves.toBeTruthy();
  });

  it("does not rotate when the file is missing", async () => {
    const result = await rotateAuditFileIfNeeded({
      filePath: path.join(dir, "missing.jsonl"),
      maxBytes: 10,
    });
    expect(result).toBeNull();
  });

  it("rotates when over the cap and leaves the active file gone", async () => {
    const filePath = path.join(dir, "audit.jsonl");
    await writeFile(filePath, "x".repeat(500));
    const result = await rotateAuditFileIfNeeded({ filePath, maxBytes: 100 });
    expect(result).not.toBeNull();
    await expect(stat(filePath)).rejects.toThrow();
    const entries = await readdir(dir);
    expect(entries.filter((f) => /^audit-.*\.jsonl$/.test(f))).toHaveLength(1);
  });
});

describe("pruneRotatedAuditFiles", () => {
  it("removes the oldest archives beyond the keep count", async () => {
    // Names sort chronologically; create five archives plus the active file.
    const names = [
      "audit-2026-01-01T00-00-00-000Z.jsonl",
      "audit-2026-02-01T00-00-00-000Z.jsonl",
      "audit-2026-03-01T00-00-00-000Z.jsonl",
      "audit-2026-04-01T00-00-00-000Z.jsonl",
      "audit-2026-05-01T00-00-00-000Z.jsonl",
    ];
    for (const n of names) await writeFile(path.join(dir, n), "x\n");
    await writeFile(path.join(dir, "audit.jsonl"), "active\n");

    const removed = await pruneRotatedAuditFiles({ dir, keep: 2 });
    expect(removed).toEqual([
      "audit-2026-01-01T00-00-00-000Z.jsonl",
      "audit-2026-02-01T00-00-00-000Z.jsonl",
      "audit-2026-03-01T00-00-00-000Z.jsonl",
    ]);

    const remaining = (await readdir(dir)).filter((f) => /^audit-.*\.jsonl$/.test(f)).sort();
    expect(remaining).toEqual([
      "audit-2026-04-01T00-00-00-000Z.jsonl",
      "audit-2026-05-01T00-00-00-000Z.jsonl",
    ]);
    // The active log is never pruned.
    expect((await readdir(dir)).includes("audit.jsonl")).toBe(true);
  });

  it("is a no-op when under the keep count", async () => {
    await writeFile(path.join(dir, "audit-2026-01-01T00-00-00-000Z.jsonl"), "x\n");
    const removed = await pruneRotatedAuditFiles({ dir, keep: 5 });
    expect(removed).toEqual([]);
  });
});
