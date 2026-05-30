/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { SkillMultiSelect } from "../SkillMultiSelect";

const SKILLS = [
  {
    name: "splunk-analyst",
    description: "General Splunk investigations",
    enabled: true,
    path: ".claude/skills/splunk-analyst/SKILL.md",
  },
  {
    name: "login-investigator",
    description: "Login activity",
    enabled: true,
    path: ".claude/skills/login-investigator/SKILL.md",
  },
  {
    name: "disabled-skill",
    description: "Off",
    enabled: false,
    path: ".claude/skills/disabled-skill/SKILL.md.disabled",
  },
];

describe("SkillMultiSelect", () => {
  it("adds a skill from the dropdown", async () => {
    const onChange = vi.fn();
    render(<SkillMultiSelect value={[]} onChange={onChange} availableSkills={SKILLS} />);

    fireEvent.focus(screen.getByPlaceholderText("Search skills to add…"));
    await waitFor(() => {
      expect(screen.getByText("splunk-analyst")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("splunk-analyst"));
    expect(onChange).toHaveBeenCalledWith(["splunk-analyst"]);
  });

  it("filters options by search query", async () => {
    render(<SkillMultiSelect value={[]} onChange={vi.fn()} availableSkills={SKILLS} />);

    const input = screen.getByPlaceholderText("Search skills to add…");
    fireEvent.change(input, { target: { value: "login" } });

    await waitFor(() => {
      expect(screen.getByText("login-investigator")).toBeInTheDocument();
      expect(screen.queryByText("splunk-analyst")).not.toBeInTheDocument();
    });
  });

  it("shows selected skills as removable pills", () => {
    const onChange = vi.fn();
    render(
      <SkillMultiSelect value={["splunk-analyst"]} onChange={onChange} availableSkills={SKILLS} />
    );

    fireEvent.click(screen.getByLabelText("Remove splunk-analyst"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
