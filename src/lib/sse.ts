export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number;
  modelUsage: Record<
    string,
    { costUSD: number; inputTokens: number; outputTokens: number; contextWindow: number }
  >;
}

export interface ContextData {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  categories: Record<string, number>;
}

export interface SSECallbacks {
  onText: (content: string) => void;
  onChart: (data: {
    vizType: string;
    dataSources: unknown;
    width: number;
    height: number;
    spl?: string;
    earliest?: string;
    latest?: string;
  }) => void;
  onSkill: (skill: string) => void;
  onUsage: (data: UsageData) => void;
  onContext: (data: ContextData) => void;
  onError: (message: string) => void;
  onLimit: (data: { reason: string; message: string; setting: string }) => void;
  onDone: () => void;
}

export async function streamChat(
  message: string,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
  skills?: string[],
  skillsStrict?: boolean,
  conversationId?: string
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      ...(conversationId && { conversationId }),
      ...(skills && skills.length > 0 && { skills, skillsStrict: skillsStrict !== false }),
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error (${response.status}): ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith("event: ")) {
          currentEvent = trimmed.slice(7);
          continue;
        }

        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);

          try {
            const parsed = JSON.parse(data);

            switch (currentEvent) {
              case "text":
                callbacks.onText(parsed.content ?? "");
                break;
              case "chart":
                callbacks.onChart(parsed);
                break;
              case "skill":
                callbacks.onSkill(parsed.skill ?? "unknown");
                break;
              case "usage":
                callbacks.onUsage(parsed);
                break;
              case "context":
                callbacks.onContext(parsed);
                break;
              case "error":
                callbacks.onError(parsed.message ?? "Unknown error");
                break;
              case "limit":
                callbacks.onLimit(parsed);
                break;
              case "done":
                callbacks.onDone();
                return;
            }
          } catch {
            // Skip unparseable data
          }

          currentEvent = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone();
}
