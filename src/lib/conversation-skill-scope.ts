import type { Message } from "../types";

export interface ConversationSkillScope {
  skills: string[];
  strict: boolean;
}

/** Recover skill scope from stored messages when older conversations lack `skillScope`. */
export function inferSkillScopeFromMessages(messages: Message[]): ConversationSkillScope | null {
  let lastAdvisory: string[] | null = null;
  let lastAssistantSkills: string[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      const text = m.blocks.find((b) => b.type === "text")?.content ?? "";
      const match = text.match(/^\[Use skills: ([^\]]+)\]\n\n/s);
      if (match) {
        lastAdvisory = match[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    if (m.role === "assistant") {
      lastAssistantSkills = [];
      for (const b of m.blocks) {
        if (b.type === "skill") lastAssistantSkills.push(b.skill);
      }
    }
  }

  if (lastAdvisory && lastAdvisory.length > 0) {
    return { skills: lastAdvisory, strict: false };
  }
  if (lastAssistantSkills.length > 0) {
    return { skills: lastAssistantSkills, strict: true };
  }
  return null;
}
