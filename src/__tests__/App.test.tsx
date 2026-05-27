/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

const mockStartNew = vi.fn();
const mockLoadExisting = vi.fn();
const mockSendMessage = vi.fn();
const mockDeleteConversation = vi.fn().mockResolvedValue(undefined);
const mockStopStreaming = vi.fn();

vi.mock("../hooks/useChat", () => ({
  useChat: () => ({
    messages: [],
    isStreaming: false,
    conversationId: null,
    conversationTitle: null,
    queryUsage: null,
    contextUsage: null,
    streamingConversationIds: [],
    notice: null,
    clearNotice: vi.fn(),
    sendMessage: mockSendMessage,
    startNewConversation: mockStartNew,
    loadExistingConversation: mockLoadExisting,
    renameConversation: vi.fn(),
    deleteConversation: mockDeleteConversation,
    stopStreaming: mockStopStreaming,
    conversationSkillScope: null,
    persistSkillScope: vi.fn(),
  }),
}));

vi.mock("../lib/settings-api", () => ({
  getSettings: vi.fn().mockResolvedValue({ runtime: { skillPacks: [] } }),
  listSkillsApi: vi.fn().mockResolvedValue([
    { name: "splunk-analyst", description: "Expert Splunk analyst", enabled: true, path: "" },
    { name: "login-investigator", description: "Login investigation", enabled: true, path: "" },
  ]),
}));

vi.mock("../lib/playbooks-api", () => ({
  listPlaybooks: vi.fn().mockResolvedValue([]),
}));

vi.mock("../components/SettingsPanel", () => ({
  SettingsPanel: () => null,
}));

vi.mock("../components/SkillExtractor", () => ({
  SkillExtractor: () => null,
}));

vi.mock("../lib/auth", () => ({
  fetchAuthConfig: vi.fn().mockResolvedValue({ enabled: false }),
  fetchAuthMe: vi.fn().mockResolvedValue({
    authenticated: true,
    user: { id: "local", name: "Local user", isAdmin: true },
  }),
  loginRedirect: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/api", () => ({
  headers: () => ({}),
  fetchInit: (init?: RequestInit) => ({ credentials: "include", ...init }),
  fetchHealth: vi.fn().mockResolvedValue({ status: "ok", checks: {} }),
  listConversations: vi.fn().mockResolvedValue([
    {
      id: "conv-1",
      title: "Old investigation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 3,
    },
  ]),
  searchConversations: vi.fn().mockResolvedValue([]),
}));

Element.prototype.scrollIntoView = vi.fn();

import { App } from "../App";

beforeEach(() => {
  vi.clearAllMocks();
});

async function selectSkill(name: string) {
  const addInput = await screen.findByPlaceholderText(/Add skills/);
  fireEvent.focus(addInput);
  await screen.findByPlaceholderText("Filter skills...");
  await waitFor(() => {
    expect(document.querySelectorAll("[data-skill-item]").length).toBeGreaterThan(0);
  });
  const item = [...document.querySelectorAll<HTMLElement>("[data-skill-item]")].find((el) =>
    el.textContent?.includes(name)
  );
  if (!item) throw new Error(`Skill ${name} not found in picker`);
  fireEvent.click(item);
  await waitFor(() => {
    expect(screen.getByLabelText(`Remove skill ${name}`)).toBeInTheDocument();
  });
}

describe("App skill reset on investigation switch", () => {
  it("clears selected skills when 'New investigation' is clicked", async () => {
    await act(async () => {
      render(<App />);
    });

    await selectSkill("splunk-analyst");

    const newBtn = screen.getByText("New investigation");
    fireEvent.click(newBtn);

    expect(mockStartNew).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByLabelText("Remove skill splunk-analyst")).not.toBeInTheDocument();
    });
  });

  it("resets allowAdditional to true when starting new investigation", async () => {
    await act(async () => {
      render(<App />);
    });

    await selectSkill("splunk-analyst");
    const toggle = await screen.findByLabelText("Restrict to selected skills only");
    fireEvent.click(toggle);

    fireEvent.click(screen.getByText("New investigation"));

    await waitFor(() => {
      expect(screen.queryByLabelText("Restrict to selected skills only")).not.toBeInTheDocument();
    });
  });

  it("calls loadExistingConversation when a saved investigation is selected", async () => {
    await act(async () => {
      render(<App />);
    });

    fireEvent.click(screen.getByLabelText("Toggle investigations sidebar"));

    const conv = await screen.findByText("Old investigation");
    fireEvent.click(conv);

    expect(mockLoadExisting).toHaveBeenCalledWith("conv-1");
  });

  it("clears selected skills when deleting the active conversation", async () => {
    await act(async () => {
      render(<App />);
    });

    await selectSkill("splunk-analyst");

    fireEvent.click(screen.getByLabelText("Toggle investigations sidebar"));
    const deleteBtn = await screen.findByLabelText("Delete investigation: Old investigation");
    fireEvent.click(deleteBtn);
    const confirmDelete = await screen.findByRole("button", { name: /^Delete$/ });
    await act(async () => {
      fireEvent.click(confirmDelete);
    });

    expect(mockDeleteConversation).toHaveBeenCalledWith("conv-1");
  });

  it("clears selected skills when '+ New' is clicked in sidebar", async () => {
    await act(async () => {
      render(<App />);
    });

    await selectSkill("login-investigator");

    fireEvent.click(screen.getByLabelText("Toggle investigations sidebar"));
    const newBtn = await screen.findByLabelText("New investigation");
    fireEvent.click(newBtn);

    expect(mockStartNew).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByLabelText("Remove skill login-investigator")).not.toBeInTheDocument();
    });
  });
});
