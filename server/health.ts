import https from "https";
import http from "http";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import type { IncomingMessage, ClientRequest, RequestOptions } from "http";
import { normalizeOpenWebUiBaseUrl } from "./llm-config.js";

const execFile = promisify(execFileCb);

export interface HealthCheck {
  status: string;
  message?: string;
}

export interface HealthResult {
  status: "ok" | "degraded" | "error";
  checks: Record<string, HealthCheck>;
}

export type Requester = (opts: RequestOptions, cb: (res: IncomingMessage) => void) => ClientRequest;

function splunkAuthHeader(opts: {
  token?: string;
  username?: string;
  password?: string;
}): string | undefined {
  if (opts.token) return `Bearer ${opts.token}`;
  if (opts.username && opts.password) {
    return `Basic ${Buffer.from(`${opts.username}:${opts.password}`).toString("base64")}`;
  }
  return undefined;
}

export function checkSplunk(opts: {
  host?: string;
  port: number;
  scheme: string;
  verifySsl: boolean;
  token?: string;
  username?: string;
  password?: string;
  _requester?: Requester;
}): Promise<HealthCheck> {
  if (!opts.host) {
    return Promise.resolve({ status: "error", message: "not configured" });
  }

  const requester = opts._requester ?? (opts.scheme === "https" ? https : http).request;
  const auth = splunkAuthHeader(opts);
  const authLabel = opts.token ? "Token" : "Basic";

  return new Promise((resolve) => {
    try {
      const req = requester(
        {
          hostname: opts.host,
          port: opts.port,
          path: "/services/server/info",
          method: "GET",
          timeout: 5000,
          rejectUnauthorized: opts.verifySsl,
          headers: auth ? { Authorization: auth } : undefined,
        },
        (resp) => {
          resp.resume();
          const code = resp.statusCode ?? 0;
          if (code >= 200 && code < 300) {
            resolve({ status: "ok", message: authLabel });
          } else if (code === 401 || code === 403) {
            resolve({ status: "degraded", message: "auth failed" });
          } else if (code >= 500) {
            resolve({ status: "error", message: `HTTP ${code}` });
          } else {
            resolve({ status: "degraded", message: `HTTP ${code}` });
          }
        }
      );
      req.on("error", () => {
        resolve({ status: "error", message: "unreachable" });
      });
      req.on("timeout", () => {
        req.destroy();
        resolve({ status: "error", message: "timeout" });
      });
      req.end();
    } catch {
      resolve({ status: "error", message: "unreachable" });
    }
  });
}

export async function checkOpenWebUi(opts: {
  baseUrl?: string;
  apiKey?: string;
  _fetch?: typeof fetch;
}): Promise<HealthCheck> {
  const baseUrl = opts.baseUrl?.trim();
  if (!baseUrl) {
    return { status: "error", message: "not configured" };
  }
  if (!opts.apiKey?.trim()) {
    return { status: "error", message: "API key missing" };
  }

  const apiBase = `${normalizeOpenWebUiBaseUrl(baseUrl)}/api`;
  const doFetch = opts._fetch ?? fetch;

  try {
    const res = await doFetch(`${apiBase}/models`, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      return { status: "ok", message: "API Key" };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: "error", message: "invalid API key" };
    }
    if (res.status === 429) {
      return { status: "degraded", message: "rate limited" };
    }
    return { status: "degraded", message: `HTTP ${res.status}` };
  } catch {
    return { status: "error", message: "unreachable" };
  }
}

export async function checkClaude(opts: {
  apiKey?: string;
  _requester?: Requester;
  _execFile?: typeof execFile;
}): Promise<HealthCheck> {
  if (opts.apiKey) {
    const requester = opts._requester ?? https.request;
    return new Promise((resolve) => {
      try {
        const req = requester(
          {
            hostname: "api.anthropic.com",
            port: 443,
            path: "/v1/models",
            method: "GET",
            timeout: 5000,
            headers: {
              "x-api-key": opts.apiKey!,
              "anthropic-version": "2023-06-01",
            },
          },
          (resp) => {
            resp.resume();
            const code = resp.statusCode ?? 0;
            if (code >= 200 && code < 300) {
              resolve({ status: "ok", message: "API Key" });
            } else if (code === 401) {
              resolve({ status: "error", message: "invalid API key" });
            } else if (code === 429) {
              resolve({ status: "degraded", message: "rate limited" });
            } else {
              resolve({ status: "degraded", message: `HTTP ${code}` });
            }
          }
        );
        req.on("error", () => {
          resolve({ status: "error", message: "unreachable" });
        });
        req.on("timeout", () => {
          req.destroy();
          resolve({ status: "error", message: "unreachable" });
        });
        req.end();
      } catch {
        resolve({ status: "error", message: "unreachable" });
      }
    });
  }

  const run = opts._execFile ?? execFile;
  try {
    const { stdout } = await run("claude", ["auth", "status", "--json"], { timeout: 10000 });
    const raw = String(stdout ?? "");
    try {
      const status = JSON.parse(raw.trim());
      if (status.loggedIn) {
        return { status: "ok", message: "OAuth" };
      }
      return { status: "error", message: "not logged in" };
    } catch {
      return { status: "error", message: "unexpected CLI response" };
    }
  } catch {
    return { status: "error", message: "CLI not found" };
  }
}

export async function runHealthChecks(): Promise<HealthResult> {
  const openWebUiBase = process.env.OPENWEBUI_BASE_URL?.trim();
  const openWebUiKey = process.env.OPENWEBUI_API_KEY?.trim();

  const [splunk, llm] = await Promise.all([
    checkSplunk({
      host: process.env.SPLUNK_HOST,
      port: parseInt(process.env.SPLUNK_PORT ?? "8089", 10),
      scheme: process.env.SPLUNK_SCHEME ?? "https",
      verifySsl: process.env.SPLUNK_VERIFY_SSL !== "false",
      token: process.env.SPLUNK_TOKEN,
      username: process.env.SPLUNK_USERNAME,
      password: process.env.SPLUNK_PASSWORD,
    }),
    openWebUiBase
      ? checkOpenWebUi({
          baseUrl: openWebUiBase,
          apiKey: openWebUiKey,
        })
      : checkClaude({
          apiKey: process.env.ANTHROPIC_API_KEY,
        }),
  ]);

  const llmKey = openWebUiBase ? "openwebui" : "claude";
  const checks: Record<string, HealthCheck> = { splunk, [llmKey]: llm };

  const overall = Object.values(checks).every((c) => c.status === "ok")
    ? "ok"
    : Object.values(checks).some((c) => c.status === "error")
      ? "error"
      : "degraded";

  return { status: overall, checks };
}
