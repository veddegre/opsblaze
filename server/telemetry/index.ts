import { logger as rootLogger } from "../logger.js";
import { getEnv } from "../env.js";
import type { Logger } from "pino";

export interface AgentTelemetryEvent {
  type: "query_start" | "query_complete" | "query_error" | "tool_use";
  timestamp: number;
  requestId?: string;
  model?: string;
  promptLength?: number;
  skills?: string[];
  turnCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalCostUsd?: number;
  durationMs?: number;
  toolName?: string;
  errorMessage?: string;
}

export interface TelemetryExporter {
  name: string;
  emit(event: AgentTelemetryEvent): Promise<void>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

class TelemetryService {
  private exporters: TelemetryExporter[] = [];
  private log: Logger;
  private initialized = false;

  constructor() {
    this.log = rootLogger.child({ module: "telemetry" });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const env = getEnv();

    if (env.SPLUNK_HEC_URL && env.SPLUNK_HEC_TOKEN) {
      try {
        const { SplunkHecExporter } = await import("./splunk-hec.js");
        const exporter = new SplunkHecExporter({
          url: env.SPLUNK_HEC_URL,
          token: env.SPLUNK_HEC_TOKEN,
          index: env.SPLUNK_HEC_INDEX,
          source: env.SPLUNK_HEC_SOURCE,
          sourcetype: env.SPLUNK_HEC_SOURCETYPE,
          verifySsl: env.SPLUNK_HEC_VERIFY_SSL,
          batchSize: env.SPLUNK_HEC_BATCH_SIZE,
          flushIntervalMs: env.SPLUNK_HEC_FLUSH_MS,
        });
        this.exporters.push(exporter);
        this.log.info("Splunk HEC telemetry exporter enabled");
      } catch (err) {
        this.log.error({ err }, "failed to initialize Splunk HEC exporter");
      }
    }

    if (env.OTEL_ENABLED) {
      try {
        const { OtelExporter } = await import("./otel.js");
        const exporter = new OtelExporter({
          endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
          serviceName: env.OTEL_SERVICE_NAME,
        });
        await exporter.start();
        this.exporters.push(exporter);
        this.log.info("OpenTelemetry exporter enabled");
      } catch (err) {
        this.log.error(
          { err },
          "failed to initialize OTEL exporter — are @opentelemetry packages installed?"
        );
      }
    }

    if (this.exporters.length === 0) {
      this.log.debug("no telemetry exporters configured");
    }
  }

  async emit(event: AgentTelemetryEvent): Promise<void> {
    if (this.exporters.length === 0) return;

    const results = await Promise.allSettled(this.exporters.map((e) => e.emit(event)));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "rejected") {
        this.log.warn({ exporter: this.exporters[i].name, err: r.reason }, "telemetry emit failed");
      }
    }
  }

  async flush(): Promise<void> {
    await Promise.allSettled(this.exporters.map((e) => e.flush()));
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled(this.exporters.map((e) => e.shutdown()));
    this.exporters = [];
    this.initialized = false;
  }

  get enabled(): boolean {
    return this.exporters.length > 0;
  }
}

export const telemetry = new TelemetryService();
