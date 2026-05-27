/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

Element.prototype.scrollIntoView = vi.fn();
import { PlaybookPicker } from "../PlaybookPicker";
import type { InvestigationPlaybook } from "../../lib/playbooks-api";

const sample: InvestigationPlaybook[] = [
  {
    id: "1",
    name: "Okta failures",
    prompt: "Investigate login failures in the last 24h",
    skills: ["investigating-okta-events"],
    strict: true,
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    name: "Splunk health",
    prompt: "Check indexer lag and queue depth",
    skills: [],
    strict: false,
    updatedAt: "2026-01-02T00:00:00Z",
  },
];

describe("PlaybookPicker", () => {
  it("renders nothing when there are no playbooks", () => {
    const { container } = render(<PlaybookPicker playbooks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a single trigger instead of one chip per playbook", () => {
    render(<PlaybookPicker playbooks={sample} onApplyPlaybook={vi.fn()} />);
    expect(screen.getByRole("button", { name: /playbooks/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Okta failures" })).not.toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("opens list and applies a playbook on click", () => {
    const onApply = vi.fn();
    render(<PlaybookPicker playbooks={sample} onApplyPlaybook={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /playbooks/i }));
    fireEvent.click(screen.getByRole("option", { name: /splunk health/i }));
    expect(onApply).toHaveBeenCalledWith(sample[1]);
  });
});
