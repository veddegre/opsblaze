import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SplunkHecExporter } from "../telemetry/splunk-hec.js";
import type { SplunkHecConfig } from "../telemetry/splunk-hec.js";
import type { AgentTelemetryEvent } from "../telemetry/index.js";

function defaultConfig(overrides: Partial<SplunkHecConfig> = {}): SplunkHecConfig {
  return {
    url: "https://splunk.local:8088",
    token: "test-token",
    index: "main",
    source: "opsblaze",
    sourcetype: "opsblaze:agent",
    verifySsl: true,
    batchSize: 3,
    flushIntervalMs: 60_000,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<AgentTelemetryEvent> = {}): AgentTelemetryEvent {
  return {
    type: "query_complete",
    timestamp: 1700000000000,
    requestId: "req-1",
    ...overrides,
  };
}

interface CapturedRequest {
  url: string;
  init: RequestInit & { dispatcher?: unknown };
}

let captured: CapturedRequest[] = [];

beforeEach(() => {
  captured = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    captured.push({ url, init: init as CapturedRequest["init"] });
    return { ok: true, status: 200, text: async () => "" } as Response;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SplunkHecExporter", () => {
  describe("URL construction", () => {
    it("appends /services/collector/event to base URL", async () => {
      const exporter = new SplunkHecExporter(defaultConfig());
      await exporter.emit(makeEvent());
      await exporter.flush();
      await exporter.shutdown();

      expect(captured[0].url).toBe("https://splunk.local:8088/services/collector/event");
    });

    it("strips trailing slashes from URL", async () => {
      const exporter = new SplunkHecExporter(
        defaultConfig({ url: "https://splunk.local:8088///" })
      );
      await exporter.emit(makeEvent());
      await exporter.flush();
      await exporter.shutdown();

      expect(captured[0].url).toBe("https://splunk.local:8088/services/collector/event");
    });

    it("normalizes URL when /services/collector is already included", async () => {
      const exporter = new SplunkHecExporter(
        defaultConfig({ url: "https://splunk.local:8088/services/collector" })
      );
      await exporter.emit(makeEvent());
      await exporter.flush();
      await exporter.shutdown();

      expect(captured[0].url).toBe("https://splunk.local:8088/services/collector/event");
    });

    it("normalizes URL with /services/collector/event already present", async () => {
      const exporter = new SplunkHecExporter(
        defaultConfig({ url: "https://splunk.local:8088/services/collector/event" })
      );
      await exporter.emit(makeEvent());
      await exporter.flush();
      await exporter.shutdown();

      expect(captured[0].url).toBe("https://splunk.local:8088/services/collector/event");
    });
  });

  describe("auth and headers", () => {
    it("sends Splunk auth header with token", async () => {
      const exporter = new SplunkHecExporter(defaultConfig({ token: "my-secret" }));
      await exporter.emit(makeEvent());
      await exporter.flush();
      await exporter.shutdown();

      const headers = captured[0].init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Splunk my-secret");
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("payload format", () => {
    it("wraps events in HEC envelope with epoch-second timestamps", async () => {
      const exporter = new SplunkHecExporter(defaultConfig());
      await exporter.emit(makeEvent({ timestamp: 1700000000000 }));
      await exporter.flush();
      await exporter.shutdown();

      const body = captured[0].init.body as string;
      const envelope = JSON.parse(body);

      expect(envelope.time).toBe(1700000000);
      expect(envelope.host).toBe("opsblaze");
      expect(envelope.source).toBe("opsblaze");
      expect(envelope.sourcetype).toBe("opsblaze:agent");
      expect(envelope.index).toBe("main");
      expect(envelope.event.type).toBe("query_complete");
      expect(envelope.event.requestId).toBe("req-1");
    });

    it("concatenates multiple events without separator (HEC batch format)", async () => {
      const exporter = new SplunkHecExporter(defaultConfig({ batchSize: 10 }));
      await exporter.emit(makeEvent({ requestId: "a" }));
      await exporter.emit(makeEvent({ requestId: "b" }));
      await exporter.flush();
      await exporter.shutdown();

      const body = captured[0].init.body as string;
      const parts = body.split("}{");
      expect(parts).toHaveLength(2);
    });

    it("uses configured index, source, and sourcetype", async () => {
      const exporter = new SplunkHecExporter(
        defaultConfig({ index: "custom", source: "myapp", sourcetype: "mytype" })
      );
      await exporter.emit(makeEvent());
      await exporter.flush();
      await exporter.shutdown();

      const body = captured[0].init.body as string;
      const envelope = JSON.parse(body);
      expect(envelope.index).toBe("custom");
      expect(envelope.source).toBe("myapp");
      expect(envelope.sourcetype).toBe("mytype");
    });
  });

  describe("batching", () => {
    it("flushes automatically when buffer reaches batchSize", async () => {
      const exporter = new SplunkHecExporter(defaultConfig({ batchSize: 2 }));

      await exporter.emit(makeEvent({ requestId: "1" }));
      expect(captured).toHaveLength(0);

      await exporter.emit(makeEvent({ requestId: "2" }));
      expect(captured).toHaveLength(1);

      await exporter.shutdown();
    });

    it("does not flush when buffer is below batchSize", async () => {
      const exporter = new SplunkHecExporter(defaultConfig({ batchSize: 5 }));

      await exporter.emit(makeEvent());
      expect(captured).toHaveLength(0);

      await exporter.shutdown();
      expect(captured).toHaveLength(1);
    });

    it("flush is a no-op when buffer is empty", async () => {
      const exporter = new SplunkHecExporter(defaultConfig());
      await exporter.flush();
      await exporter.shutdown();

      expect(captured).toHaveLength(0);
    });
  });

  describe("error handling and re-queue", () => {
    it("re-queues events on transient fetch failure", async () => {
      let callCount = 0;
      vi.stubGlobal("fetch", async () => {
        callCount++;
        if (callCount === 1) throw new Error("ECONNREFUSED");
        return { ok: true, status: 200, text: async () => "" } as Response;
      });

      const exporter = new SplunkHecExporter(defaultConfig({ batchSize: 10 }));
      await exporter.emit(makeEvent());

      await exporter.flush();
      expect(callCount).toBe(1);

      await exporter.flush();
      expect(callCount).toBe(2);

      await exporter.shutdown();
    });

    it("does not re-queue beyond 2x batchSize", async () => {
      vi.stubGlobal("fetch", async () => {
        throw new Error("ECONNREFUSED");
      });

      const exporter = new SplunkHecExporter(defaultConfig({ batchSize: 2 }));

      for (let i = 0; i < 5; i++) {
        await exporter.emit(makeEvent({ requestId: `r-${i}` }));
      }

      await exporter.flush();
      await exporter.flush();

      await exporter.shutdown();
    });

    it("logs warning on non-ok HTTP response but does not re-queue", async () => {
      vi.stubGlobal("fetch", async () => ({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      }));

      const exporter = new SplunkHecExporter(defaultConfig({ batchSize: 10 }));
      await exporter.emit(makeEvent());
      await exporter.flush();

      await exporter.flush();
      await exporter.shutdown();
    });
  });

  describe("SSL configuration", () => {
    it("does not create dispatcher when verifySsl is true", async () => {
      const exporter = new SplunkHecExporter(defaultConfig({ verifySsl: true }));
      await exporter.emit(makeEvent());
      await exporter.flush();
      await exporter.shutdown();

      expect(captured[0].init.dispatcher).toBeUndefined();
    });

    it("attaches dispatcher when verifySsl is false", async () => {
      const exporter = new SplunkHecExporter(defaultConfig({ verifySsl: false }));
      await exporter.emit(makeEvent());
      await exporter.flush();

      expect(captured[0].init.dispatcher).toBeDefined();

      await exporter.shutdown();
    });
  });

  describe("shutdown", () => {
    it("flushes remaining events on shutdown", async () => {
      const exporter = new SplunkHecExporter(defaultConfig({ batchSize: 10 }));
      await exporter.emit(makeEvent());
      await exporter.emit(makeEvent());

      expect(captured).toHaveLength(0);

      await exporter.shutdown();

      expect(captured).toHaveLength(1);
      const body = captured[0].init.body as string;
      const parts = body.split("}{");
      expect(parts).toHaveLength(2);
    });

    it("clears the flush timer on shutdown", async () => {
      const clearSpy = vi.spyOn(globalThis, "clearInterval");
      const exporter = new SplunkHecExporter(defaultConfig());

      await exporter.shutdown();

      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });

    it("double shutdown is safe", async () => {
      const exporter = new SplunkHecExporter(defaultConfig());
      await exporter.shutdown();
      await exporter.shutdown();
    });
  });
});
