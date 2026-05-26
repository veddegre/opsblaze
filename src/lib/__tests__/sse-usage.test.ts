import { describe, it, expect, vi, beforeEach } from "vitest";
import { streamChat, type SSECallbacks, type UsageData, type ContextData } from "../sse.js";

function mockFetchResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let idx = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx]));
        idx++;
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: true,
    status: 200,
    body: stream,
    text: async () => "",
  } as unknown as Response;
}

function makeCallbacks(overrides: Partial<SSECallbacks> = {}): SSECallbacks {
  return {
    onText: vi.fn(),
    onChart: vi.fn(),
    onSkill: vi.fn(),
    onUsage: vi.fn(),
    onContext: vi.fn(),
    onError: vi.fn(),
    onLimit: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("streamChat SSE parser: usage and context events", () => {
  const sampleUsage: UsageData = {
    inputTokens: 1500,
    outputTokens: 800,
    cacheReadTokens: 200,
    cacheCreationTokens: 50,
    totalCostUsd: 0.042,
    modelUsage: {
      "claude-opus-4-6": {
        costUSD: 0.042,
        inputTokens: 1500,
        outputTokens: 800,
        contextWindow: 200000,
      },
    },
  };

  const sampleContext: ContextData = {
    totalTokens: 45000,
    maxTokens: 200000,
    percentage: 22.5,
    categories: { system: 5000, user: 40000 },
  };

  it("parses usage events and calls onUsage", async () => {
    const chunks = [
      `event: usage\ndata: ${JSON.stringify(sampleUsage)}\n\n`,
      "event: done\ndata: {}\n\n",
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const usages: UsageData[] = [];
    const cb = makeCallbacks({ onUsage: (d) => usages.push(d) });

    await streamChat("q", cb);
    expect(usages).toHaveLength(1);
    expect(usages[0].inputTokens).toBe(1500);
    expect(usages[0].outputTokens).toBe(800);
    expect(usages[0].totalCostUsd).toBe(0.042);
    expect(usages[0].modelUsage["claude-opus-4-6"].contextWindow).toBe(200000);
  });

  it("parses context events and calls onContext", async () => {
    const chunks = [
      `event: context\ndata: ${JSON.stringify(sampleContext)}\n\n`,
      "event: done\ndata: {}\n\n",
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const contexts: ContextData[] = [];
    const cb = makeCallbacks({ onContext: (d) => contexts.push(d) });

    await streamChat("q", cb);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].totalTokens).toBe(45000);
    expect(contexts[0].maxTokens).toBe(200000);
    expect(contexts[0].percentage).toBe(22.5);
    expect(contexts[0].categories).toEqual({ system: 5000, user: 40000 });
  });

  it("delivers usage and context in correct order alongside text", async () => {
    const chunks = [
      'event: text\ndata: {"content":"Analysis complete."}\n\n',
      `event: usage\ndata: ${JSON.stringify(sampleUsage)}\n\n`,
      `event: context\ndata: ${JSON.stringify(sampleContext)}\n\n`,
      "event: done\ndata: {}\n\n",
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const order: string[] = [];
    const cb = makeCallbacks({
      onText: () => order.push("text"),
      onUsage: () => order.push("usage"),
      onContext: () => order.push("context"),
      onDone: () => order.push("done"),
    });

    await streamChat("q", cb);
    expect(order).toEqual(["text", "usage", "context", "done"]);
  });

  it("handles usage event split across read boundaries", async () => {
    const json = JSON.stringify(sampleUsage);
    const mid = Math.floor(json.length / 2);
    const chunks = [
      `event: usage\ndata: ${json.slice(0, mid)}`,
      `${json.slice(mid)}\n\n`,
      "event: done\ndata: {}\n\n",
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const usages: UsageData[] = [];
    const cb = makeCallbacks({ onUsage: (d) => usages.push(d) });

    await streamChat("q", cb);
    expect(usages).toHaveLength(1);
    expect(usages[0].inputTokens).toBe(1500);
  });

  it("skips malformed usage data gracefully", async () => {
    const chunks = [
      "event: usage\ndata: {not valid json}\n\n",
      `event: context\ndata: ${JSON.stringify(sampleContext)}\n\n`,
      "event: done\ndata: {}\n\n",
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const usages: UsageData[] = [];
    const contexts: ContextData[] = [];
    const cb = makeCallbacks({
      onUsage: (d) => usages.push(d),
      onContext: (d) => contexts.push(d),
    });

    await streamChat("q", cb);
    expect(usages).toHaveLength(0);
    expect(contexts).toHaveLength(1);
  });
});
