import { describe, it, expect } from "vitest";
import type { ChatMessage } from "../openwebui-client.js";

/**
 * Mirrors the message-history update in openwebui-agent after each stream completion.
 */
function appendStreamTurn(
  messages: ChatMessage[],
  stream: {
    content: string;
    toolCalls: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  }
): ChatMessage[] {
  const next = [...messages];
  if (stream.toolCalls.length === 0) {
    if (stream.content) {
      next.push({ role: "assistant", content: stream.content });
    }
    return next;
  }
  const assistantMessage: ChatMessage = {
    role: "assistant",
    tool_calls: stream.toolCalls,
  };
  if (stream.content) assistantMessage.content = stream.content;
  next.push(assistantMessage);
  return next;
}

describe("Open WebUI message history", () => {
  it("appends final assistant message when there are no tool calls", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are an analyst." },
      { role: "user", content: "Summarize login failures" },
    ];

    const updated = appendStreamTurn(messages, {
      content: "Here is the summary of login failures.",
      toolCalls: [],
    });

    expect(updated).toHaveLength(3);
    expect(updated[2]).toEqual({
      role: "assistant",
      content: "Here is the summary of login failures.",
    });
  });

  it("appends assistant with tool_calls when tools are requested", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "query splunk" }];

    const updated = appendStreamTurn(messages, {
      content: "",
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "opsblaze-splunk__splunk_query", arguments: "{}" },
        },
      ],
    });

    expect(updated[1]).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "call_1", type: "function" }],
    });
  });
});
