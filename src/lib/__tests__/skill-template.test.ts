import { describe, it, expect } from "vitest";
import {
  buildDefaultSkillContent,
  normalizeSkillName,
  validateSkillName,
} from "../skill-template";

describe("skill-template", () => {
  it("buildDefaultSkillContent includes front matter", () => {
    const md = buildDefaultSkillContent("my-skill", "Does things");
    expect(md).toContain("name: my-skill");
    expect(md).toContain("description: Does things");
    expect(md).toContain("# My Skill");
  });

  it("normalizeSkillName slugifies input", () => {
    expect(normalizeSkillName("  Okta Events! ")).toBe("okta-events");
  });

  it("validateSkillName rejects reserved words", () => {
    expect(validateSkillName("my-claude-skill")).toMatch(/reserved/);
  });
});
