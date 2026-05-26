export type SanitizeExportMode = "full" | "findings";

interface MessageBlock {
  type: string;
  content?: string;
}

interface ConvMessage {
  role: string;
  blocks: MessageBlock[];
}

/** User messages that add no value to a shared report. */
const TRIVIAL_USER_MESSAGE =
  /^(can you )?(please )?(try again|retry|continue|go ahead|run it again|do it again|thanks|thank you|yes|no|ok|okay|yep|sure|hello|hi)\.?$/i;

function textFromBlocks(blocks: MessageBlock[]): string {
  return blocks
    .filter((b) => b.type === "text" && typeof b.content === "string")
    .map((b) => b.content!.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function isErrorTextContent(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (/>\s*\*\*Error:\*\*/i.test(t)) return true;
  if (/^\*\*Error:\*\*/im.test(t)) return true;
  if (/^Error:\s/im.test(t)) return true;
  // Block is only the error callout (optional whitespace around it)
  const stripped = t
    .replace(/>\s*\*\*Error:\*\*[^\n]*/gi, "")
    .replace(/\*\*Error:\*\*[^\n]*/gi, "")
    .replace(/^Error:\s[^\n]*/gim, "")
    .trim();
  return /\*\*Error:\*\*/i.test(t) && stripped.length < 40;
}

export function isTrivialUserText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length <= 2) return true;
  return TRIVIAL_USER_MESSAGE.test(t);
}

function filterAssistantBlocks(blocks: MessageBlock[], mode: SanitizeExportMode): MessageBlock[] {
  return blocks.filter((b) => {
    if (b.type === "limit") return false;
    if (b.type === "text") {
      const content = b.content ?? "";
      if (isErrorTextContent(content)) return false;
      if (mode === "findings") return false;
    }
    if (b.type === "skill" && mode === "findings") return false;
    return true;
  });
}

/**
 * Removes failed-attempt noise from exports: connection errors, "try again" prompts, duplicates.
 */
export function sanitizeMessagesForExport(
  messages: unknown[],
  options: { mode: SanitizeExportMode; clean: boolean }
): ConvMessage[] {
  const msgs = (messages ?? []) as ConvMessage[];
  if (!options.clean) return msgs;

  const out: ConvMessage[] = [];
  let lastUserText: string | null = null;

  for (const msg of msgs) {
    if (msg.role === "user") {
      if (options.mode === "findings") continue;
      const text = textFromBlocks(msg.blocks ?? []);
      if (isTrivialUserText(text)) continue;
      if (text === lastUserText) continue;
      lastUserText = text;
      out.push(msg);
      continue;
    }

    if (msg.role === "assistant") {
      const blocks = filterAssistantBlocks(msg.blocks ?? [], options.mode);
      if (blocks.length === 0) continue;
      if (options.mode === "findings" && !blocks.some((b) => b.type === "chart")) continue;
      out.push({ ...msg, blocks });
      lastUserText = null;
    }
  }

  return out;
}
