import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

let dir: string;

function evt(ts: string, userId: string, action: string, detail?: Record<string, unknown>) {
  return JSON.stringify({ ts, userId, action, ...(detail ? { detail } : {}) });
}

async function loadModule() {
  vi.resetModules();
  // DATA_ROOT = dirname(OPSBLAZE_DATA_DIR); put the data root at `dir`.
  vi.stubEnv("OPSBLAZE_DATA_DIR", path.join(dir, "conversations"));
  return import("../audit-log.js");
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "opsblaze-auditq-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("listAuditEvents filtering", () => {
  it("returns matches newest-first and filters by action", async () => {
    const mod = await loadModule();
    await writeFile(
      mod.AUDIT_LOG_PATH,
      [
        evt("2026-05-01T10:00:00.000Z", "alice", "auth.login"),
        evt("2026-05-01T11:00:00.000Z", "bob", "auth.login.failed"),
        evt("2026-05-01T12:00:00.000Z", "carol", "auth.login.failed"),
      ].join("\n") + "\n"
    );

    const all = await mod.listAuditEvents(200);
    expect(all.map((e) => e.userId)).toEqual(["carol", "bob", "alice"]);

    const failed = await mod.listAuditEvents({ action: "auth.login.failed" });
    expect(failed.map((e) => e.userId)).toEqual(["carol", "bob"]);
  });

  it("filters by user substring (case-insensitive) and date range", async () => {
    const mod = await loadModule();
    await writeFile(
      mod.AUDIT_LOG_PATH,
      [
        evt("2026-05-01T10:00:00.000Z", "Alice", "auth.login"),
        evt("2026-05-02T10:00:00.000Z", "alicia", "auth.login"),
        evt("2026-05-03T10:00:00.000Z", "bob", "auth.login"),
      ].join("\n") + "\n"
    );

    const byUser = await mod.listAuditEvents({ user: "ali" });
    expect(byUser.map((e) => e.userId).sort()).toEqual(["Alice", "alicia"]);

    const byDate = await mod.listAuditEvents({
      fromMs: Date.parse("2026-05-02T00:00:00.000Z"),
      toMs: Date.parse("2026-05-02T23:59:59.999Z"),
    });
    expect(byDate.map((e) => e.userId)).toEqual(["alicia"]);
  });

  it("scans rotated archives when the active file has no match", async () => {
    const mod = await loadModule();
    // Active file: only recent, non-matching events.
    await writeFile(
      mod.AUDIT_LOG_PATH,
      [evt("2026-05-10T10:00:00.000Z", "dave", "auth.login")].join("\n") + "\n"
    );
    // Older archive containing the lockout we want to find.
    await writeFile(
      path.join(dir, "audit-2026-05-01T00-00-00-000Z.jsonl"),
      [
        evt("2026-05-01T09:00:00.000Z", "erin", "auth.login.failed"),
        evt("2026-05-01T09:01:00.000Z", "erin", "auth.login.locked"),
      ].join("\n") + "\n"
    );

    const locked = await mod.listAuditEvents({ action: "auth.login.locked" });
    expect(locked.map((e) => e.userId)).toEqual(["erin"]);
  });

  it("stops at the limit across files (newest-first)", async () => {
    const mod = await loadModule();
    await writeFile(
      mod.AUDIT_LOG_PATH,
      [
        evt("2026-05-05T10:00:00.000Z", "u4", "auth.login"),
        evt("2026-05-05T11:00:00.000Z", "u5", "auth.login"),
      ].join("\n") + "\n"
    );
    await writeFile(
      path.join(dir, "audit-2026-05-01T00-00-00-000Z.jsonl"),
      [evt("2026-05-01T10:00:00.000Z", "u1", "auth.login")].join("\n") + "\n"
    );

    const limited = await mod.listAuditEvents({ limit: 2 });
    expect(limited.map((e) => e.userId)).toEqual(["u5", "u4"]);
  });
});
