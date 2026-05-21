/**
 * LLM provider configuration. When OPENWEBUI_BASE_URL is set, OpsBlaze uses
 * Open WebUI instead of the Claude Agent SDK / Anthropic.
 */

export type LlmProvider = "openwebui" | "claude";

export interface OpenWebUiConfig {
  baseUrl: string;
  /** Base for GET /models (typically `{baseUrl}/api`). */
  apiBase: string;
  apiKey: string;
}

/** Path prefixes tried for chat completions when OPENWEBUI_CHAT_API_PREFIX is unset. */
export const OPENWEBUI_CHAT_API_PREFIX_CANDIDATES = ["ollama/v1", "api/v1", "api"] as const;

let cachedChatApiBase: string | null = null;

export function getChatApiPrefixFromEnv(): string | null {
  const raw = process.env.OPENWEBUI_CHAT_API_PREFIX?.trim();
  if (!raw) return null;
  return raw.replace(/^\/+|\/+$/g, "");
}

export function resetOpenWebUiChatApiCache(): void {
  cachedChatApiBase = null;
}

/**
 * Resolves the Open WebUI chat completions API base URL.
 * Some instances (e.g. direct Ollama routing) expose chat at `/ollama/v1` while
 * `/api/chat/completions` returns 404 with a generic error.
 */
export async function resolveOpenWebUiChatApiBase(
  config: OpenWebUiConfig,
  opts?: { model?: string; _fetch?: typeof fetch }
): Promise<string> {
  if (cachedChatApiBase) return cachedChatApiBase;

  const fromEnv = getChatApiPrefixFromEnv();
  if (fromEnv) {
    cachedChatApiBase = `${config.baseUrl}/${fromEnv}`;
    return cachedChatApiBase;
  }

  const doFetch = opts?._fetch ?? fetch;
  const model = opts?.model ?? process.env.OPENWEBUI_MODEL?.trim() ?? "default";

  for (const prefix of OPENWEBUI_CHAT_API_PREFIX_CANDIDATES) {
    const chatApiBase = `${config.baseUrl}/${prefix}`;
    const url = `${chatApiBase}/chat/completions`;
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          stream: false,
          chat_id: "opsblaze-probe",
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        cachedChatApiBase = chatApiBase;
        return cachedChatApiBase;
      }
      // Wrong path on many instances: 404 + generic detail
      if (res.status === 404) continue;
      // Endpoint exists but model/auth may be wrong
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        cachedChatApiBase = chatApiBase;
        return cachedChatApiBase;
      }
    } catch {
      continue;
    }
  }

  // Prefer Ollama-compatible path over /api (GVSU returns startswith/404 on /api chat).
  cachedChatApiBase = `${config.baseUrl}/ollama/v1`;
  return cachedChatApiBase;
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
