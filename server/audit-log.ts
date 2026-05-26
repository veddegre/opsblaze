import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";
import { logger } from "./logger.js";
import { sanitizeUserId, LOCAL_USER_ID } from "./auth/types.js";

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "export.download"
  | "export.preview"
  | "mcp.create"
  | "mcp.update"
  | "mcp.delete"
  | "mcp.toggle"
  | "skill.create"
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

async function ensureDir() {
  await mkdir(path.dirname(AUDIT_PATH), { recursive: true });
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
    await appendFile(AUDIT_PATH, `${JSON.stringify(event)}\n`, "utf-8");
  } catch (err) {
    logger.warn({ err, action }, "failed to write audit log");
  }
}

export async function listAuditEvents(limit = 200): Promise<AuditEvent[]> {
  try {
    const raw = await readFile(AUDIT_PATH, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const events: AuditEvent[] = [];
    for (const line of lines.slice(-limit)) {
      try {
        events.push(JSON.parse(line) as AuditEvent);
      } catch {
        /* skip corrupt line */
      }
    }
    return events.reverse();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    logger.error({ err }, "failed to read audit log");
    return [];
  }
}

export const AUDIT_LOG_PATH = AUDIT_PATH;
