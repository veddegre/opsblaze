/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const mockUser = {
  id: "local",
  name: "Local user",
  email: "local@test",
  isAdmin: true,
};

const mockSettings = {
  runtime: {
    claudeModel: "claude-opus-4-6",
    claudeEffort: "high",
    maxTurns: 30,
    streamTimeoutMs: 300000,
    llmProvider: "claude" as const,
  },
  system: {
    llmProvider: "claude" as const,
    splunkHost: "localhost",
    splunkPort: 8089,
    splunkScheme: "https",
    splunkAuthMethod: "token",
    serverPort: 3000,
    bindAddress: "127.0.0.1",
    claudeAuthMethod: "cli",
    serverMode: "dev",
  },
};

const getSettingsMock = vi.fn().mockResolvedValue(mockSettings);
const updateSettingsMock = vi.fn().mockResolvedValue({ runtime: mockSettings.runtime });

vi.mock("../../lib/auth", () => ({
  fetchAuthConfig: vi.fn().mockResolvedValue({ enabled: false }),
  logout: vi.fn(),
}));

const fetchOpenWebUiModelsMock = vi.fn().mockResolvedValue([]);

vi.mock("../../lib/settings-api", () => ({
  getSettings: (...args: unknown[]) => getSettingsMock(...args),
  updateSettings: (...args: unknown[]) => updateSettingsMock(...args),
  fetchOpenWebUiModels: (...args: unknown[]) => fetchOpenWebUiModelsMock(...args),
  listMcpServers: vi.fn().mockResolvedValue([]),
  addMcpServer: vi.fn(),
  updateMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
  toggleMcpServer: vi.fn(),
  testMcpServer: vi.fn(),
  listSkillsApi: vi.fn().mockResolvedValue([]),
  toggleSkillApi: vi.fn(),
  deleteSkillApi: vi.fn(),
  getConfigPaths: vi.fn().mockResolvedValue({ mcpConfig: "/data/mcp.json", skillsDir: "/skills" }),
}));

import { SettingsPanel } from "../SettingsPanel";

function renderPanel() {
  return render(<SettingsPanel isOpen={true} onClose={vi.fn()} user={mockUser} />);
}

async function openPreferences() {
  fireEvent.click(screen.getByRole("button", { name: /Runtime settings/i }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Runtime settings" })).toBeInTheDocument();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSettingsMock.mockResolvedValue(mockSettings);
  updateSettingsMock.mockResolvedValue({ runtime: mockSettings.runtime });
  fetchOpenWebUiModelsMock.mockResolvedValue([]);
});

describe("SettingsPanel: Preferences", () => {
  it("renders Max steps input with initial value from server", async () => {
    renderPanel();
    await openPreferences();

    const input = screen.getByDisplayValue("30") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "number");
  });

  it("renders Time limit dropdown with initial value from server", async () => {
    renderPanel();
    await openPreferences();

    expect(screen.getByDisplayValue("5 minutes")).toBeInTheDocument();
  });

  it("changing Max steps and saving sends maxTurns in the PATCH body", async () => {
    const updatedRuntime = { ...mockSettings.runtime, maxTurns: 50 };
    updateSettingsMock.mockResolvedValue({ runtime: updatedRuntime });

    renderPanel();
    await openPreferences();

    const input = screen.getByDisplayValue("30") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "50" } });

    fireEvent.click(screen.getByRole("button", { name: /Save runtime settings/i }));

    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledWith({ maxTurns: 50 });
    });
  });

  it("changing Time limit and saving sends streamTimeoutMs in the PATCH body", async () => {
    const updatedRuntime = { ...mockSettings.runtime, streamTimeoutMs: 600000 };
    updateSettingsMock.mockResolvedValue({ runtime: updatedRuntime });

    renderPanel();
    await openPreferences();

    const select = screen.getByDisplayValue("5 minutes") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "600000" } });

    fireEvent.click(screen.getByRole("button", { name: /Save runtime settings/i }));

    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledWith({ streamTimeoutMs: 600000 });
    });
  });

  it("Max steps input clamps values to 1-200 range", async () => {
    renderPanel();
    await openPreferences();

    const input = screen.getByDisplayValue("30") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "500" } });
    expect(input.value).toBe("200");

    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("1");
  });

  it("no PATCH is sent when values haven't changed", async () => {
    renderPanel();
    await openPreferences();

    fireEvent.click(screen.getByRole("button", { name: /Save runtime settings/i }));

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });

    expect(updateSettingsMock).not.toHaveBeenCalled();
  });
});

describe("SettingsPanel: navigation", () => {
  it("shows Administration section for admins", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Administration")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /MCP servers/i })).toBeInTheDocument();
  });

  it("shows My account by default", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Your profile")).toBeInTheDocument();
    });
  });

  it("opens Preferences when initialSection is preferences", async () => {
    render(
      <SettingsPanel isOpen={true} onClose={vi.fn()} user={mockUser} initialSection="preferences" />
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Runtime settings" })).toBeInTheDocument();
    });
  });

  it("shows Open WebUI model dropdown when models are returned", async () => {
    getSettingsMock.mockResolvedValue({
      ...mockSettings,
      runtime: {
        ...mockSettings.runtime,
        claudeModel: "gemma4:31b",
        llmProvider: "openwebui",
      },
    });
    fetchOpenWebUiModelsMock.mockResolvedValue([
      { id: "gemma4:31b", label: "Gemma 4" },
      { id: "llama3.1", label: "Llama 3.1" },
    ]);

    renderPanel();
    await openPreferences();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Gemma 4/ })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /Llama 3.1/ })).toBeInTheDocument();
    });
  });
});
