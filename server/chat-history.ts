/**
 * Build LLM chat history from persisted investigation messages (server-side only).
 */

export interface ChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

interface HistoryBlock {
  type: string;
  content?: string;
}

interface HistoryMessage {
  role: string;
  blocks?: HistoryBlock[];
}

function textFromBlocks(blocks: HistoryBlock[] | undefined): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b.type === "text" && typeof b.content === "string")
    .map((b) => b.content!.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Converts stored investigation messages into chat history for the model.
 * Excludes the current user turn (passed separately as `message`) and empty assistant placeholders.
 */
export function buildChatHistoryFromMessages(
  messages: unknown[],
  currentMessage: string,
  options: { maxEntries?: number; maxEntryLen?: number } = {}
): ChatHistoryEntry[] {
  const maxEntries = options.maxEntries ?? 20;
  const maxEntryLen = options.maxEntryLen ?? 50_000;
  const current = currentMessage.trim();

  const entries: ChatHistoryEntry[] = [];

  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const msg = raw as HistoryMessage;
    if (msg.role !== "user" && msg.role !== "assistant") continue;

    const content = textFromBlocks(msg.blocks);
    if (!content) continue;

    entries.push({
      role: msg.role,
      content: content.length > maxEntryLen ? content.slice(0, maxEntryLen) : content,
    });
  }

  if (entries.length > 0) {
    const last = entries[entries.length - 1];
    if (last.role === "user" && current && last.content.trim() === current) {
      entries.pop();
    }
  }

  while (entries.length > 0 && entries[entries.length - 1].role === "assistant") {
    const last = entries[entries.length - 1];
    if (!last.content.trim()) {
      entries.pop();
    } else {
      break;
    }
  }

  return entries.slice(-maxEntries);
}
