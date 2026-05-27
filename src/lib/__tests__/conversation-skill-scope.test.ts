import { describe, it, expect } from "vitest";
import { inferSkillScopeFromMessages } from "../conversation-skill-scope";
import type { Message } from "../../types";

describe("inferSkillScopeFromMessages", () => {
  it("reads advisory prefix from last user message", () => {
    const messages: Message[] = [
      {
        id: "1",
        role: "user",
        blocks: [
          {
            type: "text",
            content: "[Use skills: splunk-analyst, login-investigator]\n\nWhat failed?",
          },
        ],
      },
      {
        id: "2",
        role: "assistant",
        blocks: [{ type: "skill", skill: "splunk-analyst" }],
      },
    ];
    expect(inferSkillScopeFromMessages(messages)).toEqual({
      skills: ["splunk-analyst", "login-investigator"],
      strict: false,
    });
  });

  it("falls back to assistant skill blocks", () => {
    const messages: Message[] = [
      { id: "1", role: "user", blocks: [{ type: "text", content: "Check Okta" }] },
      {
        id: "2",
        role: "assistant",
        blocks: [
          { type: "skill", skill: "investigating-okta-events" },
          { type: "text", content: "Findings…" },
        ],
      },
    ];
    expect(inferSkillScopeFromMessages(messages)).toEqual({
      skills: ["investigating-okta-events"],
      strict: true,
    });
  });
});
