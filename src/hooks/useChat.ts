import { useState, useCallback, useRef, useEffect } from "react";
import { streamChat } from "../lib/sse";
import type { UsageData, ContextData } from "../lib/sse";
import {
  loadConversation,
  createConversation,
  updateConversation,
  deleteConversation as deleteConversationApi,
} from "../lib/api";
import type { Message, ChartBlock, SkillBlock, LimitBlock } from "../types";

const ACTIVE_CONV_KEY = "opsblaze_active_conversation";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (plain HTTP from non-localhost)
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let messageCounter = 0;
function nextId(): string {
  return `msg_${++messageCounter}_${Date.now()}`;
}

function deriveTitle(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  const truncated = cleaned.slice(0, 57);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 30 ? truncated.slice(0, lastSpace) : truncated) + "...";
}

function stripStreamingFlags(msgs: Message[]): Message[] {
  return msgs.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m));
}

function appendText(msgs: Message[], id: string, text: string): Message[] {
  const updated = [...msgs];
  const msg = updated.find((m) => m.id === id);
  if (!msg) return msgs;

  const blocks = [...msg.blocks];
  const lastBlock = blocks[blocks.length - 1];

  if (lastBlock && lastBlock.type === "text") {
    blocks[blocks.length - 1] = {
      ...lastBlock,
      content: lastBlock.content + text,
    };
  } else {
    blocks.push({ type: "text", content: text });
  }

  const idx = updated.findIndex((m) => m.id === id);
  updated[idx] = { ...msg, blocks };
  return updated;
}

function appendChart(msgs: Message[], id: string, data: Record<string, unknown>): Message[] {
  const updated = [...msgs];
  const msg = updated.find((m) => m.id === id);
  if (!msg) return msgs;

  const chartBlock: ChartBlock = {
    type: "chart",
    vizType: data.vizType as ChartBlock["vizType"],
    dataSources: data.dataSources as ChartBlock["dataSources"],
    width: data.width as number,
    height: data.height as number,
    spl: data.spl as string | undefined,
    earliest: data.earliest as string | undefined,
    latest: data.latest as string | undefined,
  };

  const blocks = [...msg.blocks, chartBlock];
  const idx = updated.findIndex((m) => m.id === id);
  updated[idx] = { ...msg, blocks };
  return updated;
}

function appendSkill(msgs: Message[], id: string, skill: string): Message[] {
  const updated = [...msgs];
  const msg = updated.find((m) => m.id === id);
  if (!msg) return msgs;

  const alreadyHas = msg.blocks.some(
    (b): b is SkillBlock => b.type === "skill" && b.skill === skill
  );
  if (alreadyHas) return msgs;

  const blocks = [...msg.blocks];
  let insertIdx = 0;
  while (insertIdx < blocks.length && blocks[insertIdx].type === "skill") {
    insertIdx++;
  }
  blocks.splice(insertIdx, 0, { type: "skill" as const, skill });

  const idx = updated.findIndex((m) => m.id === id);
  updated[idx] = { ...msg, blocks };
  return updated;
}

function appendError(msgs: Message[], id: string, errorMsg: string): Message[] {
  const updated = [...msgs];
  const msg = updated.find((m) => m.id === id);
  if (!msg) return msgs;

  const blocks = [...msg.blocks];
  blocks.push({ type: "text", content: `\n\n> **Error:** ${errorMsg}\n\n` });

  const idx = updated.findIndex((m) => m.id === id);
  updated[idx] = { ...msg, blocks };
  return updated;
}

export function appendLimit(
  msgs: Message[],
  id: string,
  data: { reason: string; message: string; setting: string }
): Message[] {
  const updated = [...msgs];
  const msg = updated.find((m) => m.id === id);
  if (!msg) return msgs;

  const blocks = [...msg.blocks];
  blocks.push({
    type: "limit" as const,
    reason: data.reason as LimitBlock["reason"],
    message: data.message,
    setting: data.setting,
  });

  const idx = updated.findIndex((m) => m.id === id);
  updated[idx] = { ...msg, blocks };
  return updated;
}

function markDone(msgs: Message[], id: string): Message[] {
  const updated = [...msgs];
  const msg = updated.find((m) => m.id === id);
  if (!msg) return msgs;

  const idx = updated.findIndex((m) => m.id === id);
  updated[idx] = { ...msg, isStreaming: false };
  return updated;
}

function saveToDisk(
  msgs: Message[],
  convId: string,
  onError?: (message: string) => void
) {
  updateConversation(convId, {
    messages: stripStreamingFlags(msgs),
  }).catch((err) => {
    if (import.meta.env.DEV) console.warn("[OpsBlaze] failed to save conversation:", err);
    onError?.("Could not save this investigation. Check your connection and try again.");
  });
}

export function buildSkillRequest(
  content: string,
  skillScope?: { skills: string[]; strict: boolean }
): {
  apiContent: string;
  apiSkills: string[] | undefined;
  apiSkillsStrict: boolean | undefined;
} {
  const hasSkills = skillScope && skillScope.skills.length > 0;
  const apiContent =
    hasSkills && !skillScope.strict
      ? `[Use skills: ${skillScope.skills.join(", ")}]\n\n${content}`
      : content;
  const apiSkills = hasSkills ? skillScope.skills : undefined;
  const apiSkillsStrict = hasSkills ? skillScope.strict : undefined;
  return { apiContent, apiSkills, apiSkillsStrict };
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [queryUsage, setQueryUsage] = useState<UsageData | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextData | null>(null);
  const [streamingConversationIds, setStreamingConversationIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const convIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const onSaveErrorRef = useRef<(message: string) => void>(() => {});
  // Abort controllers keyed by conversation ID
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const syncStreamingIds = useCallback(() => {
    setStreamingConversationIds([...abortControllers.current.keys()]);
  }, []);

  useEffect(() => {
    onSaveErrorRef.current = (message) => setNotice(message);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    convIdRef.current = conversationId;
  }, [conversationId]);

  // Abort all background streams on unmount
  useEffect(() => {
    const controllers = abortControllers.current;
    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
    };
  }, []);

  const isDisplayed = useCallback((convId: string) => convIdRef.current === convId, []);

  useEffect(() => {
    const stored = localStorage.getItem(ACTIVE_CONV_KEY);
    if (!stored) return;

    loadConversation(stored)
      .then((conv) => {
        setConversationId(conv.id);
        setConversationTitle(conv.title);
        setMessages(conv.messages as Message[]);
      })
      .catch(() => {
        localStorage.removeItem(ACTIVE_CONV_KEY);
      });
  }, []);

  const startNewConversation = useCallback(() => {
    // Flush whatever is on screen, but do NOT abort background streams
    const convId = convIdRef.current;
    if (convId && messagesRef.current.length > 0) {
      saveToDisk(messagesRef.current, convId, (msg) => onSaveErrorRef.current(msg));
    }

    setMessages([]);
    setIsStreaming(false);
    setConversationId(null);
    setConversationTitle(null);
    setQueryUsage(null);
    setContextUsage(null);
    localStorage.removeItem(ACTIVE_CONV_KEY);
  }, []);

  const loadExistingConversation = useCallback(async (id: string) => {
    // Flush current view, but do NOT abort background streams
    const convId = convIdRef.current;
    if (convId && messagesRef.current.length > 0) {
      saveToDisk(messagesRef.current, convId, (msg) => onSaveErrorRef.current(msg));
    }

    setIsStreaming(false);
    setQueryUsage(null);
    setContextUsage(null);

    try {
      const conv = await loadConversation(id);
      setConversationId(conv.id);
      setConversationTitle(conv.title);
      setMessages(conv.messages as Message[]);
      localStorage.setItem(ACTIVE_CONV_KEY, conv.id);

      if (abortControllers.current.has(conv.id)) {
        setIsStreaming(true);
      }
    } catch (err) {
      setMessages([]);
      setConversationId(null);
      setConversationTitle(null);
      setNotice(`Could not load investigation: ${(err as Error).message}`);
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string, skillScope?: { skills: string[]; strict: boolean }) => {
      if (isStreaming) return;

      let activeConvId = conversationId;

      if (!activeConvId) {
        const id = generateUUID();
        const title = deriveTitle(content);
        try {
          await createConversation(id, title);
          activeConvId = id;
          setConversationId(id);
          setConversationTitle(title);
          localStorage.setItem(ACTIVE_CONV_KEY, id);
        } catch {
          setNotice(
            "This investigation could not be saved on the server. Messages may not persist after refresh."
          );
        }
      }

      const userMessage: Message = {
        id: nextId(),
        role: "user",
        blocks: [{ type: "text", content }],
      };

      const assistantId = nextId();
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        blocks: [],
        isStreaming: true,
      };

      const currentMessages = messagesRef.current;

      // Local accumulator — lives in this closure, survives navigation
      let local = [...currentMessages, userMessage, assistantMessage];

      setMessages(local);
      setIsStreaming(true);
      setQueryUsage(null);
      setContextUsage(null);

      const reportSaveError = (msg: string) => onSaveErrorRef.current(msg);

      if (activeConvId) {
        try {
          await updateConversation(activeConvId, {
            messages: stripStreamingFlags([...currentMessages, userMessage]),
          });
        } catch (err) {
          reportSaveError(
            "Could not save this investigation before sending. History may be incomplete."
          );
          if (import.meta.env.DEV) console.warn("[OpsBlaze] pre-chat save failed:", err);
        }
        saveToDisk(local, activeConvId, reportSaveError);
      }

      const abortController = new AbortController();
      if (activeConvId) {
        abortControllers.current.set(activeConvId, abortController);
        syncStreamingIds();
      }

      const { apiContent, apiSkills, apiSkillsStrict } = buildSkillRequest(content, skillScope);

      try {
        await streamChat(
          apiContent,
          {
            onText: (text) => {
              local = appendText(local, assistantId, text);
              if (activeConvId && isDisplayed(activeConvId)) {
                setMessages(local);
              }
            },
            onChart: (data) => {
              local = appendChart(local, assistantId, data);
              if (activeConvId && isDisplayed(activeConvId)) {
                setMessages(local);
              }
            },
            onSkill: (skill) => {
              local = appendSkill(local, assistantId, skill);
              if (activeConvId && isDisplayed(activeConvId)) {
                setMessages(local);
              }
            },
            onUsage: (data) => {
              if (activeConvId && isDisplayed(activeConvId)) {
                setQueryUsage(data);
              }
            },
            onContext: (data) => {
              if (activeConvId && isDisplayed(activeConvId)) {
                setContextUsage(data);
              }
            },
            onError: (errorMsg) => {
              local = appendError(local, assistantId, errorMsg);
              if (activeConvId && isDisplayed(activeConvId)) {
                setMessages(local);
              }
            },
            onLimit: (data) => {
              local = appendLimit(local, assistantId, data);
              if (activeConvId && isDisplayed(activeConvId)) {
                setMessages(local);
              }
            },
            onDone: () => {
              local = markDone(local, assistantId);
              if (activeConvId) {
                saveToDisk(local, activeConvId, reportSaveError);
                abortControllers.current.delete(activeConvId);
                syncStreamingIds();
                if (!isDisplayed(activeConvId)) {
                  setNotice("A background investigation finished.");
                }
              }
              if (activeConvId && isDisplayed(activeConvId)) {
                setMessages(local);
                setIsStreaming(false);
              }
            },
          },
          abortController.signal,
          apiSkills,
          apiSkillsStrict,
          activeConvId ?? undefined
        );
      } catch (err) {
        const isAbort = (err as Error).name === "AbortError";

        if (!isAbort) {
          local = appendError(local, assistantId, `Connection error: ${(err as Error).message}`);
        }
        local = markDone(local, assistantId);

        if (activeConvId) {
          saveToDisk(local, activeConvId, reportSaveError);
          abortControllers.current.delete(activeConvId);
          syncStreamingIds();
        }
        if (activeConvId && isDisplayed(activeConvId)) {
          setMessages(local);
          setIsStreaming(false);
        }
      }
    },
    [isStreaming, conversationId, isDisplayed, syncStreamingIds]
  );

  const stopStreaming = useCallback(() => {
    const convId = convIdRef.current;
    if (convId && abortControllers.current.has(convId)) {
      abortControllers.current.get(convId)!.abort();
      abortControllers.current.delete(convId);
    }
  }, []);

  const renameConversation = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await updateConversation(id, { title: trimmed });
      if (convIdRef.current === id) {
        setConversationTitle(trimmed);
      }
    } catch (err) {
      setNotice(`Could not rename investigation: ${(err as Error).message}`);
      throw err;
    }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    // Abort any running stream for this conversation
    if (abortControllers.current.has(id)) {
      abortControllers.current.get(id)!.abort();
      abortControllers.current.delete(id);
      syncStreamingIds();
    }
    await deleteConversationApi(id);

    if (convIdRef.current === id) {
      setMessages([]);
      setIsStreaming(false);
      setConversationId(null);
      setConversationTitle(null);
      setQueryUsage(null);
      setContextUsage(null);
      localStorage.removeItem(ACTIVE_CONV_KEY);
    }
  }, [syncStreamingIds]);

  const clearNotice = useCallback(() => setNotice(null), []);

  return {
    messages,
    isStreaming,
    conversationId,
    conversationTitle,
    queryUsage,
    contextUsage,
    streamingConversationIds,
    notice,
    clearNotice,
    sendMessage,
    startNewConversation,
    loadExistingConversation,
    renameConversation,
    deleteConversation,
    stopStreaming,
  };
}
