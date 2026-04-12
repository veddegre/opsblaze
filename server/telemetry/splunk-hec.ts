import { logger as rootLogger } from "../logger.js";
import type { TelemetryExporter, AgentTelemetryEvent } from "./index.js";
import { Agent as UndiciAgent } from "undici";

export interface SplunkHecConfig {
  url: string;
  token: string;
  index: string;
  source: string;
  sourcetype: string;
  verifySsl: boolean;
  batchSize: number;
  flushIntervalMs: number;
}

export class SplunkHecExporter implements TelemetryExporter {
  readonly name = "splunk-hec";

  private config: SplunkHecConfig;
  private buffer: AgentTelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private log = rootLogger.child({ module: "telemetry:splunk-hec" });
  private dispatcher: UndiciAgent | undefined;

  constructor(config: SplunkHecConfig) {
    this.config = config;

    if (!config.verifySsl) {
      this.dispatcher = new UndiciAgent({
        connect: { rejectUnauthorized: false },
      });
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => this.log.warn({ err }, "periodic flush failed"));
    }, config.flushIntervalMs);

    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  async emit(event: AgentTelemetryEvent): Promise<void> {
    this.buffer.push(event);
    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);
    const payload = batch
      .map((event) =>
        JSON.stringify({
          time: event.timestamp / 1000,
          host: "opsblaze",
          source: this.config.source,
          sourcetype: this.config.sourcetype,
          index: this.config.index,
          event,
        })
      )
      .join("");

    const base = this.config.url.replace(/\/+$/, "");
    const endpoint = base.includes("/services/collector")
      ? base.replace(/\/services\/collector.*$/, "/services/collector/event")
      : base + "/services/collector/event";

    try {
      const fetchOpts: RequestInit = {
        method: "POST",
        headers: {
          Authorization: `Splunk ${this.config.token}`,
          "Content-Type": "application/json",
        },
        body: payload,
      };

      if (this.dispatcher) {
        (fetchOpts as Record<string, unknown>).dispatcher = this.dispatcher;
      }

      const res = await fetch(endpoint, fetchOpts);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.log.warn(
          { status: res.status, body: body.slice(0, 200), events: batch.length },
          "HEC rejected batch"
        );
      } else {
        this.log.debug({ events: batch.length }, "HEC batch sent");
      }
    } catch (err) {
      this.log.warn({ err, events: batch.length }, "HEC send failed");
      // Re-queue on transient failures (up to 2x batch size to avoid unbounded growth)
      if (this.buffer.length + batch.length <= this.config.batchSize * 2) {
        this.buffer.unshift(...batch);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
    await this.dispatcher?.close();
  }
}
