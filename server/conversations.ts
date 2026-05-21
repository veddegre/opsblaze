import { readFile, writeFile, readdir, unlink, mkdir } from "fs/promises";
import path from "path";
import { logger } from "./logger.js";
import { LOCAL_USER_ID, sanitizeUserId } from "./auth/types.js";

export interface StoredConversation {
  id: string;
  title: string;
  messages: unknown[];
  createdAt: string;
  updatedAt: string;
  userId?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

const DATA_ROOT = path.resolve(process.env.OPSBLAZE_DATA_DIR ?? "./data/conversations");

function userDataDir(userId: string): string {
  return path.join(DATA_ROOT, sanitizeUserId(userId));
}

async function ensureUserDir(userId: string) {
  await mkdir(userDataDir(userId), { recursive: true });
}

function safePath(userId: string, id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9-]/g, "");
  if (!safe) throw new Error("Invalid conversation ID");
  const dir = userDataDir(userId);
  const resolved = path.resolve(dir, `${safe}.json`);
  const prefix = dir + path.sep;
  if (!resolved.startsWith(prefix)) {
    throw new Error("Path traversal blocked");
  }
  return resolved;
}

export async function listConversations(userId: string = LOCAL_USER_ID): Promise<ConversationSummary[]> {
  await ensureUserDir(userId);
  const dir = userDataDir(userId);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const summaries: ConversationSummary[] = [];
  for (const file of jsonFiles) {
    try {
      const raw = await readFile(path.join(dir, file), "utf-8");
      const conv = JSON.parse(raw) as StoredConversation;
      summaries.push({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages.length,
      });
    } catch (err) {
      logger.warn({ file, err, userId }, "skipping corrupt conversation file");
    }
  }

  summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return summaries;
}

export async function getConversation(
  userId: string,
  id: string
): Promise<StoredConversation | null> {
  try {
    const raw = await readFile(safePath(userId, id), "utf-8");
    return JSON.parse(raw) as StoredConversation;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      logger.error({ id, err, userId }, "failed to read conversation");
    }
    return null;
  }
}

export async function saveConversation(userId: string, conv: StoredConversation): Promise<void> {
  await ensureUserDir(userId);
  const stored: StoredConversation = { ...conv, userId: sanitizeUserId(userId) };
  await writeFile(safePath(userId, conv.id), JSON.stringify(stored, null, 2), "utf-8");
}

export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  try {
    await unlink(safePath(userId, id));
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      logger.error({ id, err, userId }, "failed to delete conversation");
    }
    return false;
  }
}

export interface SearchResult extends ConversationSummary {
  snippet?: string;
}

const SNIPPET_RADIUS = 50;

function extractSnippet(text: string, query: string): string | undefined {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return undefined;
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + query.length + SNIPPET_RADIUS);
  let snippet = text.slice(start, end).replace(/\n+/g, " ");
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

export async function searchConversations(
  userId: string,
  query: string
): Promise<SearchResult[]> {
  await ensureUserDir(userId);
  const dir = userDataDir(userId);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const file of jsonFiles) {
    try {
      const raw = await readFile(path.join(dir, file), "utf-8");
      const conv = JSON.parse(raw) as StoredConversation;

      let snippet: string | undefined;

      if (conv.title.toLowerCase().includes(q)) {
        snippet = conv.title;
      }

      if (!snippet && Array.isArray(conv.messages)) {
        for (const msg of conv.messages as Array<{
          blocks?: Array<{ type: string; content?: string }>;
        }>) {
          if (!Array.isArray(msg.blocks)) continue;
          for (const block of msg.blocks) {
            if (block.type === "text" && typeof block.content === "string") {
              snippet = extractSnippet(block.content, query);
              if (snippet) break;
            }
          }
          if (snippet) break;
        }
      }

      if (snippet) {
        results.push({
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount: conv.messages.length,
          snippet,
        });
      }
    } catch (err) {
      logger.warn({ file, err, userId }, "skipping corrupt conversation file in search");
    }
  }

  results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return results;
}

export async function cleanupConversations(
  userId: string,
  maxAgeDays: number
): Promise<number> {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const summaries = await listConversations(userId);
  let deleted = 0;

  for (const conv of summaries) {
    const updatedAt = new Date(conv.updatedAt).getTime();
    if (updatedAt < cutoff) {
      const ok = await deleteConversation(userId, conv.id);
      if (ok) deleted++;
    }
  }

  if (deleted > 0) {
    logger.info({ deleted, maxAgeDays, userId }, "conversation cleanup complete");
  }
  return deleted;
}
