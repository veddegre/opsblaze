import type { Logger } from "pino";
import { McpRuntime, type OpenAiToolDef } from "./mcp-runtime.js";

/** Default idle time before closing an unused conversation MCP session (5 minutes). */
const DEFAULT_IDLE_MS = 5 * 60 * 1000;

function idleMs(): number {
  const raw = process.env.OPSBLAZE_MCP_SESSION_IDLE_MS;
  if (!raw) return DEFAULT_IDLE_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_IDLE_MS;
}

export interface McpSessionKey {
  userId: string;
  conversationId: string;
}

export interface AcquiredMcpSession {
  runtime: McpRuntime;
  tools: OpenAiToolDef[];
  /** True when an existing pooled connection was reused (no new stdio spawn). */
  reused: boolean;
  release: () => void;
}

interface SessionEntry {
  runtime: McpRuntime;
  tools: OpenAiToolDef[];
  refCount: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  connectPromise: Promise<OpenAiToolDef[]> | null;
  lock: Promise<void>;
  lockRelease: (() => void) | null;
}

const pool = new Map<string, SessionEntry>();

function poolKey({ userId, conversationId }: McpSessionKey): string {
  return `${userId}:${conversationId}`;
}

function clearIdleTimer(entry: SessionEntry): void {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }
}

function scheduleIdleEviction(key: string, entry: SessionEntry, log?: Logger): void {
  const ms = idleMs();
  if (ms === 0) {
    void closeEntry(key, entry, log);
    return;
  }
  entry.idleTimer = setTimeout(() => {
    if (entry.refCount > 0) return;
    void closeEntry(key, entry, log);
  }, ms);
}

async function closeEntry(key: string, entry: SessionEntry, log?: Logger): Promise<void> {
  clearIdleTimer(entry);
  pool.delete(key);
  try {
    await entry.runtime.close();
    log?.debug({ sessionKey: key }, "MCP session closed (idle eviction)");
  } catch (err) {
    log?.warn({ err, sessionKey: key }, "MCP session close failed during eviction");
  }
}

async function ensureConnected(
  entry: SessionEntry,
  log: Logger
): Promise<{ tools: OpenAiToolDef[]; reused: boolean }> {
  if (entry.runtime.connectedServers.length > 0 && entry.tools.length > 0) {
    return { tools: entry.tools, reused: true };
  }

  if (entry.connectPromise) {
    const tools = await entry.connectPromise;
    return { tools, reused: false };
  }

  entry.connectPromise = entry.runtime
    .connect(log)
    .then((tools) => {
      entry.tools = tools;
      entry.connectPromise = null;
      return tools;
    })
    .catch((err) => {
      entry.connectPromise = null;
      entry.tools = [];
      throw err;
    });

  const tools = await entry.connectPromise;
  return { tools, reused: false };
}

/**
 * Borrow an MCP runtime for a chat request. Pooled by user + conversation when
 * {@link key} is provided; otherwise a one-off runtime is created and closed on release.
 */
export async function acquireMcpSession(
  log: Logger,
  key?: McpSessionKey
): Promise<AcquiredMcpSession> {
  if (!key?.conversationId?.trim() || !key.userId) {
    const runtime = new McpRuntime();
    const tools = await runtime.connect(log);
    let released = false;
    return {
      runtime,
      tools,
      reused: false,
      release: () => {
        if (released) return;
        released = true;
        void runtime.close();
      },
    };
  }

  const sessionKey = poolKey(key);
  let entry = pool.get(sessionKey);
  if (!entry) {
    entry = {
      runtime: new McpRuntime(),
      tools: [],
      refCount: 0,
      idleTimer: null,
      connectPromise: null,
      lock: Promise.resolve(),
      lockRelease: null,
    };
    pool.set(sessionKey, entry);
  }

  clearIdleTimer(entry);
  entry.refCount++;

  let tools: OpenAiToolDef[];
  let reused: boolean;
  try {
    ({ tools, reused } = await ensureConnected(entry, log));
  } catch (err) {
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0) {
      await closeEntry(sessionKey, entry, log);
    }
    throw err;
  }

  let released = false;
  return {
    runtime: entry.runtime,
    tools,
    reused,
    release: () => {
      if (released) return;
      released = true;
      entry!.refCount = Math.max(0, entry!.refCount - 1);
      if (entry!.refCount === 0) {
        scheduleIdleEviction(sessionKey, entry!, log);
      }
    },
  };
}

/** Close a pooled MCP session immediately (e.g. conversation deleted). */
export async function evictMcpSession(key: McpSessionKey, log?: Logger): Promise<void> {
  const sessionKey = poolKey(key);
  const entry = pool.get(sessionKey);
  if (!entry) return;
  await closeEntry(sessionKey, entry, log);
}

/** Close all pooled sessions (tests and graceful shutdown). */
export async function evictAllMcpSessions(log?: Logger): Promise<void> {
  const keys = [...pool.keys()];
  await Promise.all(
    keys.map(async (key) => {
      const entry = pool.get(key);
      if (entry) await closeEntry(key, entry, log);
    })
  );
}

/**
 * Serialize tool calls on a shared session so concurrent chat requests for the
 * same conversation do not interleave MCP stdio traffic.
 */
export async function withMcpSessionLock<T>(
  runtime: McpRuntime,
  fn: () => Promise<T>
): Promise<T> {
  const entry = [...pool.values()].find((e) => e.runtime === runtime);
  if (!entry) {
    return fn();
  }

  const prev = entry.lock;
  entry.lock = new Promise<void>((resolve) => {
    entry.lockRelease = resolve;
  });
  await prev;

  try {
    return await fn();
  } finally {
    entry.lockRelease?.();
    entry.lockRelease = null;
  }
}

/** @internal Test-only pool inspection. */
export function __getMcpPoolSizeForTests(): number {
  return pool.size;
}
