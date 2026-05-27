/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SkillBundlePicker } from "../SkillBundlePicker";
import type { SkillPack } from "../../lib/settings-api";

Element.prototype.scrollIntoView = vi.fn();

const sample: SkillPack[] = [
  {
    id: "1",
    name: "Splunk core",
    description: "Default Splunk investigation skills",
    skills: ["splunk-analyst"],
    strict: true,
  },
  {
    id: "2",
    name: "Security pack",
    skills: ["login-investigator"],
    strict: false,
  },
];

describe("SkillBundlePicker", () => {
  it("renders nothing when there are no bundles", () => {
    const { container } = render(<SkillBundlePicker skillPacks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a single trigger instead of one chip per bundle", () => {
    render(<SkillBundlePicker skillPacks={sample} onApplySkillPack={vi.fn()} />);
    expect(screen.getByRole("button", { name: /bundles/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Splunk core" })).not.toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("opens list and applies a bundle on click", () => {
    const onApply = vi.fn();
    render(<SkillBundlePicker skillPacks={sample} onApplySkillPack={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /bundles/i }));
    fireEvent.click(screen.getByRole("option", { name: /security pack/i }));
    expect(onApply).toHaveBeenCalledWith(sample[1]);
  });
});
