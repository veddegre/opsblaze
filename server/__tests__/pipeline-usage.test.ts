import { describe, it, expect } from "vitest";
import { processMessageStream } from "../pipeline.js";
import type { PipelineEmitter, QueryUsageData } from "../pipeline.js";

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  fatal: () => {},
  trace: () => {},
  child: () => silentLog,
  bindings: () => ({}),
  level: "silent",
  isLevelEnabled: () => false,
} as unknown as import("pino").Logger;

interface SSEEvent {
  event: string;
  data: unknown;
}

async function runPipeline(messages: Record<string, unknown>[]) {
  const events: SSEEvent[] = [];

  async function* generate() {
    for (const m of messages) yield m;
  }

  const emitter: PipelineEmitter = {
    emit: (event: string, data: unknown) => events.push({ event, data }),
    log: silentLog,
  };

  const result = await processMessageStream(generate(), emitter);
  return { events, result };
}

function textBlockStart() {
  return {
    type: "stream_event",
    event: {
      type: "content_block_start",
      content_block: { type: "text" },
    },
  };
}

function textDelta(text: string) {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text },
    },
  };
}

function contentBlockStop() {
  return {
    type: "stream_event",
    event: { type: "content_block_stop" },
  };
}

function resultWithUsage(
  usage: Record<string, number>,
  modelUsage?: Record<string, Record<string, unknown>>,
  totalCostUsd?: number
) {
  return {
    type: "result",
    subtype: "success",
    usage,
    modelUsage,
    total_cost_usd: totalCostUsd,
  };
}

describe("pipeline: usage extraction", () => {
  it("extracts usage data from result message", async () => {
    const messages = [
      textDelta("Hello"),
      contentBlockStop(),
      resultWithUsage(
        {
          input_tokens: 1500,
          output_tokens: 800,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 50,
        },
        {
          "claude-opus-4-6": {
            costUSD: 0.042,
            inputTokens: 1500,
            outputTokens: 800,
            contextWindow: 200000,
          },
        },
        0.042
      ),
    ];

    const { result, events } = await runPipeline(messages);

    expect(result.usage).not.toBeNull();
    const u = result.usage!;
    expect(u.inputTokens).toBe(1500);
    expect(u.outputTokens).toBe(800);
    expect(u.cacheReadTokens).toBe(200);
    expect(u.cacheCreationTokens).toBe(50);
    expect(u.totalCostUsd).toBe(0.042);
    expect(u.modelUsage["claude-opus-4-6"]).toEqual({
      costUSD: 0.042,
      inputTokens: 1500,
      outputTokens: 800,
      contextWindow: 200000,
    });

    const usageEvents = events.filter((e) => e.event === "usage");
    expect(usageEvents).toHaveLength(1);
    expect((usageEvents[0].data as QueryUsageData).inputTokens).toBe(1500);
  });

  it("defaults to zero when usage fields are missing", async () => {
    const messages = [textDelta("Hi"), contentBlockStop(), resultWithUsage({})];

    const { result } = await runPipeline(messages);

    expect(result.usage).not.toBeNull();
    const u = result.usage!;
    expect(u.inputTokens).toBe(0);
    expect(u.outputTokens).toBe(0);
    expect(u.cacheReadTokens).toBe(0);
    expect(u.cacheCreationTokens).toBe(0);
    expect(u.totalCostUsd).toBe(0);
    expect(u.modelUsage).toEqual({});
  });

  it("returns null usage when result message has no usage field", async () => {
    const messages = [
      textDelta("Hello"),
      contentBlockStop(),
      { type: "result", subtype: "success" },
    ];

    const { result } = await runPipeline(messages);

    expect(result.usage).not.toBeNull();
    expect(result.usage!.inputTokens).toBe(0);
  });

  it("emits usage SSE event before returning", async () => {
    const messages = [
      textDelta("Analysis"),
      contentBlockStop(),
      resultWithUsage({ input_tokens: 500, output_tokens: 200 }, undefined, 0.01),
    ];

    const { events } = await runPipeline(messages);

    const textEvents = events.filter((e) => e.event === "text");
    const usageEvents = events.filter((e) => e.event === "usage");

    expect(textEvents.length).toBeGreaterThanOrEqual(1);
    expect(usageEvents).toHaveLength(1);

    const usageIdx = events.indexOf(usageEvents[0]);
    const lastTextIdx = events.lastIndexOf(textEvents[textEvents.length - 1]);
    expect(usageIdx).toBeGreaterThan(lastTextIdx);
  });

  it("handles multiple models in modelUsage", async () => {
    const messages = [
      textDelta("Done"),
      contentBlockStop(),
      resultWithUsage(
        { input_tokens: 3000, output_tokens: 1500 },
        {
          "claude-opus-4-6": {
            costUSD: 0.08,
            inputTokens: 2000,
            outputTokens: 1000,
            contextWindow: 200000,
          },
          "claude-sonnet-4-6": {
            costUSD: 0.02,
            inputTokens: 1000,
            outputTokens: 500,
            contextWindow: 200000,
          },
        },
        0.1
      ),
    ];

    const { result } = await runPipeline(messages);

    expect(Object.keys(result.usage!.modelUsage)).toHaveLength(2);
    expect(result.usage!.modelUsage["claude-opus-4-6"].costUSD).toBe(0.08);
    expect(result.usage!.modelUsage["claude-sonnet-4-6"].costUSD).toBe(0.02);
  });

  it("handles error result with usage still extractable", async () => {
    const messages = [
      textDelta("Partial"),
      contentBlockStop(),
      {
        type: "result",
        subtype: "error_during_execution",
        result: "Something went wrong",
        usage: { input_tokens: 100, output_tokens: 50 },
        total_cost_usd: 0.005,
      },
    ];

    const { result, events } = await runPipeline(messages);

    expect(result.usage).not.toBeNull();
    expect(result.usage!.inputTokens).toBe(100);

    const errorEvents = events.filter((e) => e.event === "error");
    expect(errorEvents).toHaveLength(1);

    const usageEvents = events.filter((e) => e.event === "usage");
    expect(usageEvents).toHaveLength(1);
  });

  it("returns null usage when stream throws before result", async () => {
    async function* generate() {
      yield textDelta("Start");
      throw new Error("Connection lost");
    }

    const events: SSEEvent[] = [];
    const emitter: PipelineEmitter = {
      emit: (event: string, data: unknown) => events.push({ event, data }),
      log: silentLog,
    };

    const result = await processMessageStream(generate(), emitter);

    expect(result.usage).toBeNull();
    const errorEvents = events.filter((e) => e.event === "error");
    expect(errorEvents).toHaveLength(1);
  });

  it("returns null usage when stream is aborted before result", async () => {
    const controller = new AbortController();

    async function* generate() {
      yield textDelta("Start");
      controller.abort();
      yield textDelta("Should be skipped");
      yield resultWithUsage({ input_tokens: 100 });
    }

    const events: SSEEvent[] = [];
    const emitter: PipelineEmitter = {
      emit: (event: string, data: unknown) => events.push({ event, data }),
      log: silentLog,
    };

    const result = await processMessageStream(generate(), emitter, controller.signal);

    expect(result.usage).toBeNull();
    const usageEvents = events.filter((e) => e.event === "usage");
    expect(usageEvents).toHaveLength(0);
  });

  it("handles missing modelUsage gracefully", async () => {
    const messages = [
      textDelta("Hello"),
      contentBlockStop(),
      resultWithUsage({ input_tokens: 500, output_tokens: 200 }, undefined, 0.01),
    ];

    const { result } = await runPipeline(messages);

    expect(result.usage).not.toBeNull();
    expect(result.usage!.modelUsage).toEqual({});
    expect(result.usage!.inputTokens).toBe(500);
  });
});
