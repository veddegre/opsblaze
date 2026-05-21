/**
 * LLM provider configuration. When OPENWEBUI_BASE_URL is set, OpsBlaze uses
 * Open WebUI instead of the Claude Agent SDK / Anthropic.
 */

export type LlmProvider = "openwebui" | "claude";

export interface OpenWebUiConfig {
  baseUrl: string;
  apiBase: string;
  apiKey: string;
}

/** Strip trailing slashes and optional `/api` suffix from the configured base URL. */
export function normalizeOpenWebUiBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api")) {
    return trimmed.slice(0, -4);
  }
  return trimmed;
}

export function getOpenWebUiConfig(): OpenWebUiConfig | null {
  const raw = process.env.OPENWEBUI_BASE_URL?.trim();
  if (!raw) return null;

  const apiKey = process.env.OPENWEBUI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENWEBUI_API_KEY is required when OPENWEBUI_BASE_URL is set");
  }

  const baseUrl = normalizeOpenWebUiBaseUrl(raw);
  return {
    baseUrl,
    apiBase: `${baseUrl}/api`,
    apiKey,
  };
}

export function getLlmProvider(): LlmProvider {
  return process.env.OPENWEBUI_BASE_URL?.trim() ? "openwebui" : "claude";
}

export function isOpenWebUiMode(): boolean {
  return getLlmProvider() === "openwebui";
}
