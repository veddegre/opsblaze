import { describe, expect, it } from "vitest";
import {
  sanitizeMessagesForOpenWebUi,
  sanitizeToolsForOpenWebUi,
  type ChatMessage,
} from "../openwebui-client.js";

describe("sanitizeMessagesForOpenWebUi", () => {
  it("fills empty content for assistant messages with tool_calls", () => {
    const messages: ChatMessage[] = [
      {
        role: "assistant",
        tool_calls: [
          { id: "c1", type: "function", function: { name: "splunk__search", arguments: "{}" } },
        ],
      },
    ];
    const out = sanitizeMessagesForOpenWebUi(messages);
    expect(out[0].content).toBe("");
  });

  it("ensures tool messages have content, tool_call_id, and name", () => {
    const messages: ChatMessage[] = [{ role: "tool", content: undefined }];
    const out = sanitizeMessagesForOpenWebUi(messages);
    expect(out[0].content).toBe("");
    expect(out[0].tool_call_id).toBe("call_unknown");
    expect(out[0].name).toBe("tool");
  });
});

describe("sanitizeToolsForOpenWebUi", () => {
  it("defaults missing description to tool name", () => {
    const out = sanitizeToolsForOpenWebUi([
      {
        type: "function",
        function: { name: "splunk__search", parameters: { type: "object", properties: {} } },
      },
    ]);
    expect(out?.[0].function.description).toBe("splunk__search");
  });
});
