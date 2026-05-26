import { describe, it, expect } from "vitest";
import { buildChatHistoryFromMessages } from "../chat-history.js";

describe("buildChatHistoryFromMessages", () => {
  it("extracts text blocks and excludes the current user message", () => {
    const history = buildChatHistoryFromMessages(
      [
        {
          role: "user",
          blocks: [{ type: "text", content: "First question" }],
        },
        {
          role: "assistant",
          blocks: [{ type: "text", content: "First answer" }],
        },
        {
          role: "user",
          blocks: [{ type: "text", content: "Follow-up question" }],
        },
      ],
      "Follow-up question"
    );

    expect(history).toEqual([
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
    ]);
  });

  it("skips chart-only assistant messages and empty placeholders", () => {
    const history = buildChatHistoryFromMessages(
      [
        { role: "user", blocks: [{ type: "text", content: "Q" }] },
        { role: "assistant", blocks: [{ type: "chart", vizType: "table" }] },
        { role: "assistant", blocks: [] },
      ],
      "Next"
    );

    expect(history).toEqual([{ role: "user", content: "Q" }]);
  });

  it("truncates to maxEntries", () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      blocks: [{ type: "text", content: `m${i}` }],
    }));

    const history = buildChatHistoryFromMessages(messages, "new", { maxEntries: 4 });
    expect(history).toHaveLength(4);
    expect(history[0].content).toBe("m26");
  });
});
