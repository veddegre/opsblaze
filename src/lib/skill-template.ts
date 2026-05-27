/** Default SKILL.md body for in-app skill creation. */
export function buildDefaultSkillContent(name: string, description: string): string {
  const safeName = name.trim() || "my-skill";
  const desc =
    description.trim() ||
    "Describe when the investigator should use this skill (shown in the skill picker).";
  const title = safeName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return `---
name: ${safeName}
description: ${desc}
---

# ${title}

Describe the investigation approach, Splunk indexes, and key fields for this use case.

## When to use

- Add bullet points for questions this skill should handle.

## Your tool

You have a \`splunk_query\` tool that executes SPL and returns visualization data. Use it to support your narrative with charts and tables.

## Investigation steps

1. Scope the time range from the user's question.
2. Run targeted SPL searches.
3. Summarize findings with evidence from the data.
`;
}

export const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;

export function normalizeSkillName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function validateSkillName(name: string): string | null {
  if (!name) return "Skill ID is required";
  if (name.length > 64) return "Skill ID must be at most 64 characters";
  if (!SKILL_NAME_PATTERN.test(name)) {
    return "Use lowercase letters, numbers, and hyphens only (e.g. investigating-login-events)";
  }
  if (name.includes("anthropic") || name.includes("claude")) {
    return "Skill ID cannot contain reserved words (anthropic, claude)";
  }
  return null;
}
