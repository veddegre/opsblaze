/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { appendLimit } from "../useChat";
import type { Message } from "../../types";

vi.mock("../../lib/sse", () => ({
  streamChat: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  loadConversation: vi.fn(),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

import { streamChat } from "../../lib/sse";
import type { SSECallbacks } from "../../lib/sse";
import { createConversation, loadConversation, updateConversation } from "../../lib/api";
import { useChat } from "../useChat";

const mockStreamChat = vi.mocked(streamChat);
const mockCreateConversation = vi.mocked(createConversation);
const mockLoadConversation = vi.mocked(loadConversation);
const mockUpdateConversation = vi.mocked(updateConversation);

const sampleUsage = {
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  totalCostUsd: 0.01,
  modelUsage: {},
};

const sampleContext = {
  totalTokens: 5000,
  maxTokens: 200000,
  percentage: 2.5,
  categories: {},
};

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  mockCreateConversation.mockResolvedValue(undefined as any);
  mockUpdateConversation.mockResolvedValue(undefined as any);
});

/**
 * Uses loadExistingConversation to establish a conversation so that
 * convIdRef is synced before sendMessage is called. This avoids the
 * timing issue where sendMessage creates a conversation and the ref
 * isn't updated before synchronous mock callbacks fire.
 */
async function setupConversation() {
  mockLoadConversation.mockResolvedValue({
    id: "conv-1",
    title: "Test Conversation",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as any);

  const hookResult = renderHook(() => useChat());

  await act(async () => {
    await hookResult.result.current.loadExistingConversation("conv-1");
  });

  expect(hookResult.result.current.conversationId).toBe("conv-1");
  expect(hookResult.result.current.isStreaming).toBe(false);
  return hookResult;
}

describe("appendLimit (pure function)", () => {
  const baseMessages: Message[] = [
    { id: "msg-1", role: "user", blocks: [{ type: "text", content: "hello" }] },
    {
      id: "msg-2",
      role: "assistant",
      blocks: [{ type: "text", content: "Analysis done." }],
    },
  ];

  it("adds a LimitBlock to the assistant message's blocks array", () => {
    const result = appendLimit(baseMessages, "msg-2", {
      reason: "max_turns",
      message: "Hit the 30-turn limit.",
      setting: "Max Turns",
    });

    const assistant = result.find((m) => m.id === "msg-2")!;
    expect(assistant.blocks).toHaveLength(2);
    expect(assistant.blocks[1]).toEqual({
      type: "limit",
      reason: "max_turns",
      message: "Hit the 30-turn limit.",
      setting: "Max Turns",
    });
  });

  it("returns the original array unchanged when message ID is unknown", () => {
    const result = appendLimit(baseMessages, "unknown-id", {
      reason: "max_turns",
      message: "Limit hit.",
      setting: "Max Turns",
    });

    expect(result).toBe(baseMessages);
  });
});

describe("useChat: usage and context state", () => {
  it("queryUsage state is set when onUsage fires", async () => {
    const { result } = await setupConversation();

    mockStreamChat.mockImplementation(async (_msg, _history, callbacks: SSECallbacks) => {
      callbacks.onUsage(sampleUsage as any);
      callbacks.onDone();
    });

    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.queryUsage).toEqual(sampleUsage);
  });

  it("contextUsage state is set when onContext fires", async () => {
    const { result } = await setupConversation();

    mockStreamChat.mockImplementation(async (_msg, _history, callbacks: SSECallbacks) => {
      callbacks.onContext(sampleContext as any);
      callbacks.onDone();
    });

    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.contextUsage).toEqual(sampleContext);
  });

  it("queryUsage and contextUsage are reset to null when sendMessage is called", async () => {
    const { result } = await setupConversation();

    mockStreamChat.mockImplementation(async (_msg, _history, callbacks: SSECallbacks) => {
      callbacks.onUsage(sampleUsage as any);
      callbacks.onContext(sampleContext as any);
      callbacks.onDone();
    });

    await act(async () => {
      await result.current.sendMessage("with-usage");
    });

    expect(result.current.queryUsage).not.toBeNull();
    expect(result.current.contextUsage).not.toBeNull();

    mockStreamChat.mockImplementation(async (_msg, _history, callbacks: SSECallbacks) => {
      callbacks.onDone();
    });

    await act(async () => {
      await result.current.sendMessage("no-usage");
    });

    expect(result.current.queryUsage).toBeNull();
    expect(result.current.contextUsage).toBeNull();
  });

  it("queryUsage and contextUsage are reset to null on startNewConversation", async () => {
    const { result } = await setupConversation();

    mockStreamChat.mockImplementation(async (_msg, _history, callbacks: SSECallbacks) => {
      callbacks.onUsage(sampleUsage as any);
      callbacks.onContext(sampleContext as any);
      callbacks.onDone();
    });

    await act(async () => {
      await result.current.sendMessage("with-usage");
    });

    expect(result.current.queryUsage).not.toBeNull();
    expect(result.current.contextUsage).not.toBeNull();

    act(() => {
      result.current.startNewConversation();
    });

    expect(result.current.queryUsage).toBeNull();
    expect(result.current.contextUsage).toBeNull();
  });

  it("queryUsage and contextUsage are reset to null on loadExistingConversation", async () => {
    const { result } = await setupConversation();

    mockStreamChat.mockImplementation(async (_msg, _history, callbacks: SSECallbacks) => {
      callbacks.onUsage(sampleUsage as any);
      callbacks.onContext(sampleContext as any);
      callbacks.onDone();
    });

    await act(async () => {
      await result.current.sendMessage("with-usage");
    });

    expect(result.current.queryUsage).not.toBeNull();
    expect(result.current.contextUsage).not.toBeNull();

    mockLoadConversation.mockResolvedValue({
      id: "other-conv",
      title: "Other",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);

    await act(async () => {
      await result.current.loadExistingConversation("other-conv");
    });

    expect(result.current.queryUsage).toBeNull();
    expect(result.current.contextUsage).toBeNull();
  });
});
