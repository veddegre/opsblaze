import { logger as rootLogger } from "../logger.js";
import type { TelemetryExporter, AgentTelemetryEvent } from "./index.js";

export interface OtelConfig {
  endpoint: string;
  serviceName: string;
}

/**
 * OpenTelemetry exporter that creates trace spans for agent query lifecycle events.
 * Follows GenAI semantic conventions where applicable.
 *
 * All @opentelemetry imports are dynamic so the app starts cleanly when
 * the packages aren't installed.
 */
export class OtelExporter implements TelemetryExporter {
  readonly name = "otel";

  private config: OtelConfig;
  private log = rootLogger.child({ module: "telemetry:otel" });
  private tracer: import("@opentelemetry/api").Tracer | null = null;
  private api: typeof import("@opentelemetry/api") | null = null;
  private sdk: { shutdown(): Promise<void> } | null = null;

  constructor(config: OtelConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    const { resourceFromAttributes } = await import("@opentelemetry/resources");
    const api = await import("@opentelemetry/api");

    const resource = resourceFromAttributes({
      "service.name": this.config.serviceName,
      "service.version": process.env.npm_package_version ?? "0.0.0",
    });

    const traceExporter = new OTLPTraceExporter({
      url: `${this.config.endpoint.replace(/\/+$/, "")}/v1/traces`,
    });

    const sdk = new NodeSDK({
      resource,
      traceExporter,
    });

    sdk.start();
    this.sdk = sdk;
    this.api = api;
    this.tracer = api.trace.getTracer(this.config.serviceName);
    this.log.info({ endpoint: this.config.endpoint }, "OTEL SDK started");
  }

  async emit(event: AgentTelemetryEvent): Promise<void> {
    if (!this.tracer || !this.api) return;

    const api = this.api;

    const spanName = `opsblaze.agent.${event.type}`;
    const span = this.tracer.startSpan(spanName, {
      kind: api.SpanKind.CLIENT,
      startTime: new Date(event.timestamp),
      attributes: {
        "gen_ai.system": "anthropic",
        "gen_ai.operation.name": event.type,
      },
    });

    if (event.model) span.setAttribute("gen_ai.request.model", event.model);
    if (event.requestId) span.setAttribute("opsblaze.request_id", event.requestId);
    if (event.promptLength != null) span.setAttribute("gen_ai.prompt.length", event.promptLength);
    if (event.inputTokens != null)
      span.setAttribute("gen_ai.usage.input_tokens", event.inputTokens);
    if (event.outputTokens != null)
      span.setAttribute("gen_ai.usage.output_tokens", event.outputTokens);
    if (event.cacheReadTokens != null)
      span.setAttribute("gen_ai.usage.cache_read_tokens", event.cacheReadTokens);
    if (event.cacheCreationTokens != null)
      span.setAttribute("gen_ai.usage.cache_creation_tokens", event.cacheCreationTokens);
    if (event.totalCostUsd != null) span.setAttribute("gen_ai.usage.cost_usd", event.totalCostUsd);
    if (event.durationMs != null) span.setAttribute("opsblaze.duration_ms", event.durationMs);
    if (event.turnCount != null) span.setAttribute("opsblaze.turn_count", event.turnCount);
    if (event.toolName) span.setAttribute("gen_ai.tool.name", event.toolName);
    if (event.skills && event.skills.length > 0)
      span.setAttribute("opsblaze.skills", event.skills.join(","));

    if (event.type === "query_error" && event.errorMessage) {
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: event.errorMessage });
    }

    const endTime = event.durationMs
      ? new Date(event.timestamp + event.durationMs)
      : new Date(event.timestamp);
    span.end(endTime);
  }

  async flush(): Promise<void> {
    // The NodeSDK handles batching and flushing internally
  }

  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.sdk = null;
      this.tracer = null;
      this.api = null;
      this.log.info("OTEL SDK shut down");
    }
  }
}
