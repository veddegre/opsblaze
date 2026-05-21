import { getOpenWebUiConfig } from "./llm-config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  /** Open WebUI requires a non-null chat_id on external API calls (see open-webui#24550). */
  chatId?: string;
  tools?: Array<{
    type: "function";
    function: { name: string; description?: string; parameters: Record<string, unknown> };
  }>;
  stream?: boolean;
  signal?: AbortSignal;
}

function parseErrorBody(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; message?: unknown };
    const detail = parsed.detail ?? parsed.message;
    if (typeof detail === "string" && detail) return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => (typeof d === "string" ? d : JSON.stringify(d))).join("; ");
    }
  } catch {
    /* not JSON */
  }
  return body || `Open WebUI chat request failed (${status})`;
}

/** Open WebUI crashes if message content is null/omitted in some roles (startswith on None). */
export function sanitizeMessagesForOpenWebUi(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    const out: ChatMessage = { ...msg };
    if (typeof out.content !== "string") {
      out.content = out.tool_calls?.length ? "" : "";
    }
    if (out.role === "tool") {
      out.content = out.content ?? "";
      if (!out.tool_call_id) out.tool_call_id = "call_unknown";
      if (!out.name) out.name = "tool";
    }
    if (out.role === "assistant" && out.tool_calls?.length) {
      out.content = out.content ?? "";
    }
    return out;
  });
}

export function sanitizeToolsForOpenWebUi(
  tools: ChatCompletionOptions["tools"]
): ChatCompletionOptions["tools"] {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.function.name,
      description: t.function.description ?? t.function.name,
      parameters: t.function.parameters ?? { type: "object", properties: {} },
    },
  }));
}

function buildRequestBody(options: ChatCompletionOptions, stream: boolean): Record<string, unknown> {
  const chatId = options.chatId?.trim() || `opsblaze-${crypto.randomUUID()}`;
  const body: Record<string, unknown> = {
    model: options.model,
    messages: sanitizeMessagesForOpenWebUi(options.messages),
    stream,
    chat_id: chatId,
  };
  const tools = sanitizeToolsForOpenWebUi(options.tools);
  if (tools?.length) body.tools = tools;
  return body;
}

export interface StreamResult {
  content: string;
  toolCalls: ToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  } | null;
}

export class OpenWebUiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "OpenWebUiError";
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export async function fetchOpenWebUiModels(signal?: AbortSignal): Promise<unknown> {
  const config = getOpenWebUiConfig();
  if (!config) throw new OpenWebUiError("Open WebUI is not configured");

  const res = await fetch(`${config.apiBase}/models`, {
    headers: authHeaders(config.apiKey),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenWebUiError(
      body || `Open WebUI models request failed (${res.status})`,
      res.status
    );
  }

  return res.json();
}

/**
 * Non-streaming completion — used for skill extraction/refinement.
 */
export async function chatComplete(options: ChatCompletionOptions): Promise<string> {
  const config = getOpenWebUiConfig();
  if (!config) throw new OpenWebUiError("Open WebUI is not configured");

  const res = await fetch(`${config.apiBase}/chat/completions`, {
    method: "POST",
    headers: authHeaders(config.apiKey),
    body: JSON.stringify(buildRequestBody(options, false)),
    signal: options.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenWebUiError(parseErrorBody(body, res.status), res.status);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (p): p is Record<string, unknown> =>
          typeof p === "object" && p !== null && p.type === "text"
      )
      .map((p) => String(p.text ?? ""))
      .join("");
  }

  throw new OpenWebUiError("Open WebUI returned an empty completion");
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Streaming chat completion. Accumulates text and tool_calls from SSE chunks.
 */
export async function chatCompleteStream(
  options: ChatCompletionOptions
): Promise<StreamResult> {
  const config = getOpenWebUiConfig();
  if (!config) throw new OpenWebUiError("Open WebUI is not configured");

  const res = await fetch(`${config.apiBase}/chat/completions`, {
    method: "POST",
    headers: authHeaders(config.apiKey),
    body: JSON.stringify(buildRequestBody(options, true)),
    signal: options.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenWebUiError(parseErrorBody(body, res.status), res.status);
  }

  if (!res.body) {
    throw new OpenWebUiError("Open WebUI returned no response body");
  }

  let content = "";
  const toolAcc = new Map<number, ToolCallAccumulator>();
  let usage: StreamResult["usage"] = null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (options.signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          continue;
        }

        const rawUsage = chunk.usage as Record<string, unknown> | undefined;
        if (rawUsage) {
          usage = {
            inputTokens: Number(rawUsage.prompt_tokens ?? rawUsage.input_tokens ?? 0) || 0,
            outputTokens: Number(rawUsage.completion_tokens ?? rawUsage.output_tokens ?? 0) || 0,
          };
        }

        const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
        const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        if (typeof delta.content === "string") {
          content += delta.content;
        }

        const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (toolCalls) {
          for (const tc of toolCalls) {
            const index = (tc.index as number) ?? 0;
            let acc = toolAcc.get(index);
            if (!acc) {
              acc = {
                id: (tc.id as string) ?? `call_${index}`,
                name: "",
                arguments: "",
              };
              toolAcc.set(index, acc);
            }
            const fn = tc.function as Record<string, unknown> | undefined;
            if (fn?.name) acc.name += String(fn.name);
            if (fn?.arguments) acc.arguments += String(fn.arguments);
            if (tc.id) acc.id = String(tc.id);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const toolCalls: ToolCall[] = [...toolAcc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, acc]) => ({
      id: acc.id,
      type: "function" as const,
      function: { name: acc.name, arguments: acc.arguments },
    }))
    .filter((tc) => tc.function.name);

  return { content, toolCalls, usage };
}
