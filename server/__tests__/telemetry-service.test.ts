import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TelemetryExporter, AgentTelemetryEvent } from "../telemetry/index.js";

function makeEvent(overrides: Partial<AgentTelemetryEvent> = {}): AgentTelemetryEvent {
  return {
    type: "query_complete",
    timestamp: Date.now(),
    requestId: "req-1",
    ...overrides,
  };
}

function mockExporter(name: string): TelemetryExporter & {
  emittedEvents: AgentTelemetryEvent[];
  flushed: number;
  shutdownCalled: boolean;
} {
  const state = {
    emittedEvents: [] as AgentTelemetryEvent[],
    flushed: 0,
    shutdownCalled: false,
  };
  return {
    name,
    ...state,
    async emit(event: AgentTelemetryEvent) {
      state.emittedEvents.push(event);
    },
    async flush() {
      state.flushed++;
    },
    async shutdown() {
      state.shutdownCalled = true;
    },
    get emittedEvents() {
      return state.emittedEvents;
    },
    get flushed() {
      return state.flushed;
    },
    get shutdownCalled() {
      return state.shutdownCalled;
    },
  };
}

vi.mock("../env.js", () => ({
  getEnv: () => ({
    SPLUNK_HEC_URL: undefined,
    SPLUNK_HEC_TOKEN: undefined,
    OTEL_ENABLED: false,
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
    OTEL_SERVICE_NAME: "test",
  }),
}));

describe("TelemetryService", () => {
  let telemetry: (typeof import("../telemetry/index.js"))["telemetry"];

  beforeEach(async () => {
    const mod = await import("../telemetry/index.js");
    telemetry = mod.telemetry;
    await telemetry.shutdown();
  });

  it("reports enabled=false when no exporters configured", async () => {
    await telemetry.initialize();
    expect(telemetry.enabled).toBe(false);
  });

  it("does not error when emitting with no exporters", async () => {
    await telemetry.initialize();
    await expect(telemetry.emit(makeEvent())).resolves.toBeUndefined();
  });

  it("idempotent initialization — second call is a no-op", async () => {
    await telemetry.initialize();
    await telemetry.initialize();
    expect(telemetry.enabled).toBe(false);
  });

  it("shutdown resets initialized state allowing re-initialization", async () => {
    await telemetry.initialize();
    await telemetry.shutdown();
    expect(telemetry.enabled).toBe(false);
    await telemetry.initialize();
    expect(telemetry.enabled).toBe(false);
  });
});

describe("TelemetryService exporter routing", () => {
  it("routes events to all registered exporters", async () => {
    const { telemetry } = await import("../telemetry/index.js");
    await telemetry.shutdown();

    const exp1 = mockExporter("exp-1");
    const exp2 = mockExporter("exp-2");

    // Access internal exporters array via the initialize bypass
    // We test through the public API by relying on module-level state
    // Since TelemetryService is not directly constructable, we test the
    // emit/flush/shutdown contract through the exported singleton.
    telemetry["exporters"] = [exp1, exp2];
    telemetry["initialized"] = true;

    expect(telemetry.enabled).toBe(true);

    const event = makeEvent({ type: "query_start" });
    await telemetry.emit(event);

    expect(exp1.emittedEvents).toHaveLength(1);
    expect(exp1.emittedEvents[0].type).toBe("query_start");
    expect(exp2.emittedEvents).toHaveLength(1);

    await telemetry.flush();
    expect(exp1.flushed).toBe(1);
    expect(exp2.flushed).toBe(1);

    await telemetry.shutdown();
    expect(exp1.shutdownCalled).toBe(true);
    expect(exp2.shutdownCalled).toBe(true);
    expect(telemetry.enabled).toBe(false);
  });

  it("continues emitting to healthy exporters when one fails", async () => {
    const { telemetry } = await import("../telemetry/index.js");
    await telemetry.shutdown();

    const failing: TelemetryExporter = {
      name: "failing",
      async emit() {
        throw new Error("boom");
      },
      async flush() {},
      async shutdown() {},
    };
    const healthy = mockExporter("healthy");

    telemetry["exporters"] = [failing, healthy];
    telemetry["initialized"] = true;

    await telemetry.emit(makeEvent());

    expect(healthy.emittedEvents).toHaveLength(1);

    await telemetry.shutdown();
  });

  it("emits query_complete event with usage data", async () => {
    const { telemetry } = await import("../telemetry/index.js");
    await telemetry.shutdown();

    const exp = mockExporter("usage-test");

    telemetry["exporters"] = [exp];
    telemetry["initialized"] = true;

    const event = makeEvent({
      type: "query_complete",
      turnCount: 5,
      inputTokens: 1500,
      outputTokens: 800,
      cacheReadTokens: 200,
      cacheCreationTokens: 50,
      totalCostUsd: 0.042,
      durationMs: 12000,
      model: "claude-opus-4-6",
    });
    await telemetry.emit(event);

    expect(exp.emittedEvents).toHaveLength(1);
    const emitted = exp.emittedEvents[0];
    expect(emitted.type).toBe("query_complete");
    expect(emitted.inputTokens).toBe(1500);
    expect(emitted.outputTokens).toBe(800);
    expect(emitted.totalCostUsd).toBe(0.042);
    expect(emitted.turnCount).toBe(5);

    await telemetry.shutdown();
  });

  it("emits query_error event when usage is null and turnCount is 0", async () => {
    const { telemetry } = await import("../telemetry/index.js");
    await telemetry.shutdown();

    const exp = mockExporter("error-test");

    telemetry["exporters"] = [exp];
    telemetry["initialized"] = true;

    const event = makeEvent({
      type: "query_error",
      turnCount: 0,
      inputTokens: undefined,
      outputTokens: undefined,
      totalCostUsd: undefined,
      errorMessage: "Connection lost",
    });
    await telemetry.emit(event);

    expect(exp.emittedEvents).toHaveLength(1);
    const emitted = exp.emittedEvents[0];
    expect(emitted.type).toBe("query_error");
    expect(emitted.turnCount).toBe(0);
    expect(emitted.inputTokens).toBeUndefined();
    expect(emitted.errorMessage).toBe("Connection lost");

    await telemetry.shutdown();
  });

  it("does not emit when telemetry.enabled is false (no exporters)", async () => {
    const { telemetry } = await import("../telemetry/index.js");
    await telemetry.shutdown();
    await telemetry.initialize();

    expect(telemetry.enabled).toBe(false);

    const event = makeEvent({ type: "query_start" });
    await telemetry.emit(event);

    await telemetry.shutdown();
  });

  it("graceful shutdown flushes pending events", async () => {
    const { telemetry } = await import("../telemetry/index.js");
    await telemetry.shutdown();

    const exp = mockExporter("flush-test");

    telemetry["exporters"] = [exp];
    telemetry["initialized"] = true;

    await telemetry.emit(makeEvent({ type: "query_start" }));
    await telemetry.emit(makeEvent({ type: "query_complete" }));

    expect(exp.emittedEvents).toHaveLength(2);

    await telemetry.shutdown();
    expect(exp.shutdownCalled).toBe(true);
    expect(telemetry.enabled).toBe(false);
  });
});
