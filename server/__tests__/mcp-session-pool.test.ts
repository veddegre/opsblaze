import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { connect, close } = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
}));

vi.mock("../mcp-runtime.js", () => {
  class MockMcpRuntime {
    connect = connect;
    close = close;
    get connectedServers() {
      return connect.mock.calls.length > 0
        ? [{ name: "opsblaze-splunk", tools: [{ name: "splunk_query" }] }]
        : [];
    }
    callTool = vi.fn();
  }
  return {
    McpRuntime: MockMcpRuntime,
    qualifyToolName: (s: string, t: string) => `${s}__${t}`,
    resolveToolInvocation: vi.fn(),
  };
});

import {
  acquireMcpSession,
  evictMcpSession,
  evictAllMcpSessions,
  __getMcpPoolSizeForTests,
} from "../mcp-session-pool.js";

describe("mcp-session-pool", () => {
  const log = { debug: vi.fn(), warn: vi.fn() } as never;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    connect.mockResolvedValue([
      { type: "function", function: { name: "opsblaze-splunk__splunk_query", parameters: {} } },
    ]);
    close.mockResolvedValue(undefined);
    await evictAllMcpSessions();
  });

  afterEach(async () => {
    await evictAllMcpSessions();
    vi.useRealTimers();
    delete process.env.OPSBLAZE_MCP_SESSION_IDLE_MS;
  });

  it("creates ephemeral session without conversation key", async () => {
    const session = await acquireMcpSession(log);
    expect(session.reused).toBe(false);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(__getMcpPoolSizeForTests()).toBe(0);

    session.release();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("reuses pooled session for the same conversation", async () => {
    const key = { userId: "u1", conversationId: "c1" };

    const first = await acquireMcpSession(log, key);
    expect(first.reused).toBe(false);
    expect(connect).toHaveBeenCalledTimes(1);
    first.release();

    const second = await acquireMcpSession(log, key);
    expect(second.reused).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
    second.release();
  });

  it("dedupes concurrent connect for the same conversation", async () => {
    const key = { userId: "u1", conversationId: "c1" };
    let resolveConnect!: (tools: unknown[]) => void;
    connect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConnect = resolve;
        })
    );

    const p1 = acquireMcpSession(log, key);
    const p2 = acquireMcpSession(log, key);

    resolveConnect([
      { type: "function", function: { name: "opsblaze-splunk__splunk_query", parameters: {} } },
    ]);

    const [s1, s2] = await Promise.all([p1, p2]);
    expect(connect).toHaveBeenCalledTimes(1);
    s1.release();
    s2.release();
  });

  it("evicts idle session after TTL", async () => {
    process.env.OPSBLAZE_MCP_SESSION_IDLE_MS = "1000";
    const key = { userId: "u1", conversationId: "c1" };

    const session = await acquireMcpSession(log, key);
    session.release();
    expect(__getMcpPoolSizeForTests()).toBe(1);

    await vi.advanceTimersByTimeAsync(1001);
    expect(close).toHaveBeenCalled();
    expect(__getMcpPoolSizeForTests()).toBe(0);
  });

  it("evictMcpSession closes immediately", async () => {
    const key = { userId: "u1", conversationId: "c1" };
    const session = await acquireMcpSession(log, key);
    session.release();

    await evictMcpSession(key);
    expect(close).toHaveBeenCalled();
    expect(__getMcpPoolSizeForTests()).toBe(0);
  });
});
