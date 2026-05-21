/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const mockSettings = {
  runtime: {
    claudeModel: "claude-opus-4-6",
    claudeEffort: "high",
    maxTurns: 30,
    streamTimeoutMs: 300000,
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

const mockHealth = {
  status: "ok" as const,
  checks: {
    splunk: { status: "ok" },
    claude: { status: "ok", message: "CLI Auth" },
  },
};

const getSettingsMock = vi.fn().mockResolvedValue(mockSettings);
const updateSettingsMock = vi.fn().mockResolvedValue({ runtime: mockSettings.runtime });
const fetchHealthMock = vi.fn().mockResolvedValue(mockHealth);

vi.mock("../../lib/settings-api", () => ({
  getSettings: (...args: unknown[]) => getSettingsMock(...args),
  updateSettings: (...args: unknown[]) => updateSettingsMock(...args),
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

vi.mock("../../lib/api", () => ({
  fetchHealth: (...args: unknown[]) => fetchHealthMock(...args),
}));

import { SettingsPanel } from "../SettingsPanel";

beforeEach(() => {
  vi.clearAllMocks();
  getSettingsMock.mockResolvedValue(mockSettings);
  updateSettingsMock.mockResolvedValue({ runtime: mockSettings.runtime });
  fetchHealthMock.mockResolvedValue(mockHealth);
});

describe("SettingsPanel: General tab", () => {
  it("renders Max Turns number input with initial value from server", async () => {
    render(<SettingsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Max Turns")).toBeInTheDocument();
    });

    const input = screen.getByDisplayValue("30") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "number");
  });

  it("renders Timeout dropdown with initial value from server", async () => {
    render(<SettingsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Timeout")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("5 minutes")).toBeInTheDocument();
  });

  it("changing Max Turns and clicking Save sends maxTurns in the PATCH body", async () => {
    const updatedRuntime = { ...mockSettings.runtime, maxTurns: 50 };
    updateSettingsMock.mockResolvedValue({ runtime: updatedRuntime });

    render(<SettingsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Max Turns")).toBeInTheDocument();
    });

    const input = screen.getByDisplayValue("30") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "50" } });

    const saveButton = screen.getByRole("button", { name: /Save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledWith({ maxTurns: 50 });
    });
  });

  it("changing Timeout and clicking Save sends streamTimeoutMs in the PATCH body", async () => {
    const updatedRuntime = { ...mockSettings.runtime, streamTimeoutMs: 600000 };
    updateSettingsMock.mockResolvedValue({ runtime: updatedRuntime });

    render(<SettingsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Timeout")).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue("5 minutes") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "600000" } });

    const saveButton = screen.getByRole("button", { name: /Save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledWith({ streamTimeoutMs: 600000 });
    });
  });

  it("Max Turns input clamps values to 1-200 range", async () => {
    render(<SettingsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Max Turns")).toBeInTheDocument();
    });

    const input = screen.getByDisplayValue("30") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "500" } });
    expect(input.value).toBe("200");

    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("1");
  });

  it("no PATCH is sent when values haven't changed", async () => {
    render(<SettingsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Max Turns")).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", { name: /Save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });

    expect(updateSettingsMock).not.toHaveBeenCalled();
  });
});
