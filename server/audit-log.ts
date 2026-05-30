import { appendFile, mkdir, readFile, readdir, rename, stat, unlink } from "fs/promises";
import path from "path";
import { logger } from "./logger.js";
import { sanitizeUserId, LOCAL_USER_ID } from "./auth/types.js";

export type AuditAction =
  | "auth.login"
  | "auth.login.failed"
  | "auth.login.locked"
  | "auth.logout"
  | "export.download"
  | "export.preview"
  | "mcp.create"
  | "mcp.update"
  | "mcp.delete"
  | "mcp.toggle"
  | "skill.create"
  | "skill.update"
  | "skill.delete"
  | "skill.toggle"
  | "settings.update"
  | "playbook.create"
  | "playbook.update"
  | "playbook.delete";

export interface AuditEvent {
  ts: string;
  userId: string;
  action: AuditAction;
  detail?: Record<string, unknown>;
}

const DATA_ROOT = path.resolve(
  process.env.OPSBLAZE_DATA_DIR ? path.dirname(process.env.OPSBLAZE_DATA_DIR) : "./data"
);
const AUDIT_PATH = path.join(DATA_ROOT, "audit.jsonl");

/** Rotate the active log once it crosses this size (default ~5 MB). */
const AUDIT_MAX_BYTES = (() => {
  const raw = parseInt(process.env.OPSBLAZE_AUDIT_MAX_BYTES ?? "", 10);
  return Number.isFinite(raw) && raw >= 64_000 ? raw : 5_000_000;
})();

/** How many rotated files to retain (oldest beyond this are deleted). */
const AUDIT_KEEP_FILES = (() => {
  const raw = parseInt(process.env.OPSBLAZE_AUDIT_KEEP_FILES ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
})();

const ROTATED_RE = /^audit-.*\.jsonl$/;

async function ensureDir() {
  await mkdir(path.dirname(AUDIT_PATH), { recursive: true });
}

/** Filesystem-safe rotated filename derived from the rotation timestamp. */
function rotatedName(date: Date): string {
  return `audit-${date.toISOString().replace(/[:.]/g, "-")}.jsonl`;
}

async function readJsonlLines(filePath: string): Promise<string[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return raw.trim().split("\n").filter(Boolean);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    logger.error({ err, filePath }, "failed to read audit log file");
    return [];
  }
}

async function listRotatedFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    // ISO-timestamped names sort lexicographically in chronological order.
    return entries.filter((f) => ROTATED_RE.test(f)).sort();
  } catch {
    return [];
  }
}

/**
 * Rename the active audit file to a timestamped archive when it exceeds the
 * size cap, so `audit.jsonl` can't grow without bound. Returns the rotated
 * path, or `null` when no rotation happened. Exposed for testing.
 */
export async function rotateAuditFileIfNeeded(
  opts: { filePath?: string; maxBytes?: number } = {}
): Promise<string | null> {
  const filePath = opts.filePath ?? AUDIT_PATH;
  const maxBytes = opts.maxBytes ?? AUDIT_MAX_BYTES;
  try {
    const st = await stat(filePath);
    if (st.size < maxBytes) return null;
  } catch {
    // Missing file (nothing to rotate) or unstattable — skip.
    return null;
  }
  const rotated = path.join(path.dirname(filePath), rotatedName(new Date()));
  try {
    await rename(filePath, rotated);
    return rotated;
  } catch (err) {
    logger.warn({ err }, "audit log rotation failed");
    return null;
  }
}

/**
 * Delete rotated archives beyond the retention count, oldest first. Returns the
 * filenames removed. Exposed for testing.
 */
export async function pruneRotatedAuditFiles(
  opts: { dir?: string; keep?: number } = {}
): Promise<string[]> {
  const dir = opts.dir ?? DATA_ROOT;
  const keep = opts.keep ?? AUDIT_KEEP_FILES;
  const rotated = await listRotatedFiles(dir);
  const excess = rotated.length - keep;
  if (excess <= 0) return [];
  const removed: string[] = [];
  for (let i = 0; i < excess; i++) {
    const name = rotated[i];
    try {
      await unlink(path.join(dir, name));
      removed.push(name);
    } catch (err) {
      logger.warn({ err, name }, "failed to prune rotated audit file");
    }
  }
  return removed;
}

export async function recordAudit(
  userId: string,
  action: AuditAction,
  detail?: Record<string, unknown>
): Promise<void> {
  const event: AuditEvent = {
    ts: new Date().toISOString(),
    userId: sanitizeUserId(userId || LOCAL_USER_ID),
    action,
    ...(detail && Object.keys(detail).length > 0 ? { detail } : {}),
  };
  try {
    await ensureDir();
    const rotated = await rotateAuditFileIfNeeded();
    if (rotated) await pruneRotatedAuditFiles();
    await appendFile(AUDIT_PATH, `${JSON.stringify(event)}\n`, "utf-8");
  } catch (err) {
    logger.warn({ err, action }, "failed to write audit log");
  }
}

export interface AuditQuery {
  limit?: number;
  /** Exact action match (e.g. "auth.login.failed"). */
  action?: string;
  /** Case-insensitive substring match on userId. */
  user?: string;
  /** Inclusive lower bound (ms since epoch). */
  fromMs?: number;
  /** Inclusive upper bound (ms since epoch). */
  toMs?: number;
}

function matchesQuery(ev: AuditEvent, q: AuditQuery, userNeedle?: string): boolean {
  if (q.action && ev.action !== q.action) return false;
  if (userNeedle && !ev.userId.toLowerCase().includes(userNeedle)) return false;
  if (q.fromMs != null || q.toMs != null) {
    const t = Date.parse(ev.ts);
    if (q.fromMs != null && t < q.fromMs) return false;
    if (q.toMs != null && t > q.toMs) return false;
  }
  return true;
}

/**
 * Return audit events newest-first, optionally filtered. Scanning walks the
 * active file then rotated archives newest-first, so filters apply across the
 * whole retained history (not just the latest file) but stop as soon as
 * `limit` matches are collected.
 *
 * Accepts a bare number for backward compatibility (`listAuditEvents(200)`).
 */
export async function listAuditEvents(arg: number | AuditQuery = 200): Promise<AuditEvent[]> {
  const q: AuditQuery = typeof arg === "number" ? { limit: arg } : arg;
  const limit = q.limit && q.limit > 0 ? q.limit : 200;
  const userNeedle = q.user?.trim().toLowerCase() || undefined;

  const files = [
    AUDIT_PATH,
    ...(await listRotatedFiles(DATA_ROOT)).reverse().map((f) => path.join(DATA_ROOT, f)),
  ];

  const matches: AuditEvent[] = [];
  for (const file of files) {
    if (matches.length >= limit) break;
    const lines = await readJsonlLines(file);
    // Iterate within the file newest-first (lines are appended chronologically).
    for (let i = lines.length - 1; i >= 0 && matches.length < limit; i--) {
      let ev: AuditEvent;
      try {
        ev = JSON.parse(lines[i]) as AuditEvent;
      } catch {
        continue;
      }
      if (matchesQuery(ev, q, userNeedle)) matches.push(ev);
    }
  }
  return matches;
}

export const AUDIT_LOG_PATH = AUDIT_PATH;
