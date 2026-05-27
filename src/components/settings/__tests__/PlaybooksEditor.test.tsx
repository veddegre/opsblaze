/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { PlaybooksEditor } from "../PlaybooksEditor";

vi.mock("../../../lib/playbooks-api", () => ({
  listPlaybooks: vi.fn(),
  createPlaybook: vi.fn(),
  updatePlaybook: vi.fn(),
  deletePlaybook: vi.fn(),
}));

vi.mock("../../../lib/settings-api", () => ({
  listSkillsApi: vi.fn().mockResolvedValue([
    { name: "splunk-analyst", description: "", enabled: true, path: "" },
  ]),
}));

import {
  listPlaybooks,
  updatePlaybook,
} from "../../../lib/playbooks-api";

const sample = [
  {
    id: "pb-1",
    name: "Auth check",
    prompt: "Review failed logins",
    skills: ["splunk-analyst"],
    strict: true,
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPlaybooks).mockResolvedValue(sample);
  vi.mocked(updatePlaybook).mockResolvedValue({
    ...sample[0],
    name: "Auth check (updated)",
    prompt: "Review failed logins in 24h",
  });
});

describe("PlaybooksEditor", () => {
  it("opens inline edit form and calls updatePlaybook", async () => {
    render(<PlaybooksEditor />);
    await waitFor(() => expect(screen.getByText("Auth check")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("Editing playbook")).toBeInTheDocument();
    const prompt = screen.getByLabelText("Investigation prompt");
    fireEvent.change(prompt, { target: { value: "Review failed logins in 24h" } });

    fireEvent.click(screen.getByRole("button", { name: "Update playbook" }));

    await waitFor(() => {
      expect(updatePlaybook).toHaveBeenCalledWith("pb-1", {
        name: "Auth check",
        prompt: "Review failed logins in 24h",
        skills: ["splunk-analyst"],
        strict: true,
      });
    });
  });
});
