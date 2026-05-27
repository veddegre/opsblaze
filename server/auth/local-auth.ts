import { readFile, stat } from "fs/promises";
import path from "path";
import { z } from "zod";
import { formatJsonParseError } from "../json-syntax-error.js";
import { logger } from "../logger.js";
import { loadAdminPolicy } from "./admin-policy.js";
import { verifyPassword } from "./password.js";
import { normalizeGroupName, resolveAdminDetails } from "./roles.js";
import { sanitizeUserId, type AuthUser } from "./types.js";

const userSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, "username must be alphanumeric with . _ -"),
  passwordHash: z.string().min(10),
  name: z.string().max(128).optional(),
  email: z.string().email().max(254).optional(),
  groups: z.array(z.string().max(128)).default([]),
  disabled: z.boolean().optional(),
});

const fileSchema = z.object({
  users: z.array(userSchema).min(1).max(500),
});

export type LocalAuthUserRecord = z.infer<typeof userSchema>;

let cachedUsers: Map<string, LocalAuthUserRecord> | null = null;
let cachedMtimeMs = 0;

export function isLocalAuthEnabled(): boolean {
  return Boolean(process.env.OPSBLAZE_LOCAL_AUTH_FILE?.trim());
}

export function getLocalAuthFilePath(): string {
  const raw = process.env.OPSBLAZE_LOCAL_AUTH_FILE?.trim();
  if (!raw) {
    throw new Error("OPSBLAZE_LOCAL_AUTH_FILE is not set");
  }
  return path.resolve(process.cwd(), raw);
}

export async function validateLocalAuthFile(): Promise<string | null> {
  if (!isLocalAuthEnabled()) return null;
  try {
    await loadLocalAuthUsers(true);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

async function loadLocalAuthUsers(force = false): Promise<Map<string, LocalAuthUserRecord>> {
  const filePath = getLocalAuthFilePath();
  const st = await stat(filePath);
  if (!force && cachedUsers && cachedMtimeMs === st.mtimeMs) {
    return cachedUsers;
  }

  const raw = await readFile(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(formatJsonParseError(raw, err, filePath));
  }

  const result = fileSchema.safeParse(parsed);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid local auth file: ${msg}`);
  }

  const byUsername = new Map<string, LocalAuthUserRecord>();
  for (const user of result.data.users) {
    const key = user.username.trim().toLowerCase();
    if (byUsername.has(key)) {
      throw new Error(`Duplicate username in local auth file: ${user.username}`);
    }
    if (user.username.includes("..") || user.username.includes("/")) {
      throw new Error(`Invalid username: ${user.username}`);
    }
    byUsername.set(key, {
      ...user,
      groups: user.groups.map((g) => normalizeGroupName(g)).filter(Boolean),
    });
  }

  cachedUsers = byUsername;
  cachedMtimeMs = st.mtimeMs;
  logger.info({ path: filePath, userCount: byUsername.size }, "local auth users loaded");
  return byUsername;
}

export function buildAuthUserFromLocal(record: LocalAuthUserRecord): AuthUser {
  const policy = loadAdminPolicy();
  const username = record.username.trim().toLowerCase();
  const admin = resolveAdminDetails({
    adminEmails: policy.adminEmails,
    adminGroups: policy.adminGroups,
    adminUsernames: policy.adminUsernames,
    allUsersAdmin: policy.allUsersAdmin,
    email: record.email,
    username,
    groups: record.groups,
  });

  return {
    id: sanitizeUserId(username),
    email: record.email,
    name: record.name ?? record.username,
    isAdmin: admin.isAdmin,
    groups: record.groups,
    adminSource: admin.source,
    matchedAdminGroup: admin.matchedAdminGroup,
  };
}

export async function authenticateLocalUser(
  username: string,
  password: string
): Promise<AuthUser | null> {
  const key = username.trim().toLowerCase();
  if (!key) return null;

  const users = await loadLocalAuthUsers();
  const record = users.get(key);
  if (!record || record.disabled) return null;
  if (!verifyPassword(password, record.passwordHash)) return null;

  return buildAuthUserFromLocal(record);
}
