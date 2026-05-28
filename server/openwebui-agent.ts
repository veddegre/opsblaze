import type { Response } from "express";
import type { Logger } from "pino";
import { readFile } from "fs/promises";
import { logger as rootLogger } from "./logger.js";
import { sendSSE } from "./sse-helpers.js";
import { processTextBuffer, chartHasData, type FlushTextState } from "./sse-helpers.js";
import { qualifyToolName, resolveToolInvocation } from "./mcp-runtime.js";
import {
  acquireMcpSession,
  withMcpSessionLock,
  type McpSessionKey,
} from "./mcp-session-pool.js";

export type { McpSessionKey } from "./mcp-session-pool.js";
import { chatCompleteStream, type ChatMessage, OpenWebUiError } from "./openwebui-client.js";
import { listSkills } from "./skills.js";
import { getClaudeModel, getMaxTurns, getStreamTimeoutMs } from "./runtime-settings.js";
import { telemetry } from "./telemetry/index.js";
import { classifyAgentError } from "./pipeline.js";
import type { QueryUsageData } from "./pipeline.js";

interface HistoryMessage {
  role: string;
  content: string;
}

interface SplunkToolResult {
  summary: string;
  chart: {
    vizType: string;
    dataSources: unknown;
    width: number;
    height: number;
  } | null;
  suppressed: boolean;
  queryMeta?: { spl: string; earliest: string; latest: string };
}

const INVESTIGATION_SYSTEM = `You are an expert Splunk analyst conducting narrative investigations in OpsBlaze.

When the user asks about Splunk data, security, or operations:
- Use the available MCP tools (especially splunk_query) to run SPL and ground your analysis in real data.
- Narrate findings in clear prose; interleave analysis with data from tool results.
- Match visualization types to the analytical intent (line/area for trends, bar/column for comparisons, pie for composition, table for detail).
- Use relative Splunk time modifiers (e.g. -7d@d) for earliest/latest — not ISO timestamps.
- Tool results return JSON with a text summary and optional chart dataSources; use the summary for reasoning.

Do not invent data. If a query returns no results, say so and adjust your approach.`;

async function readSkillBody(skillPath: string): Promise<string> {
  const raw = await readFile(skillPath, "utf-8");
  const stripped = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  return stripped;
}

async function buildSystemPrompt(
  requestedSkills?: string[],
  skillsStrict = true
): Promise<{
  prompt: string;
  activeSkillNames: string[];
}> {
  const allSkills = await listSkills();
  let enabled = allSkills.filter((s) => s.enabled);

  if (requestedSkills && requestedSkills.length > 0 && skillsStrict) {
    const allowed = new Set(requestedSkills);
    enabled = enabled.filter((s) => allowed.has(s.name));
  }

  const parts = [INVESTIGATION_SYSTEM];

  if (requestedSkills && requestedSkills.length > 0) {
    if (skillsStrict) {
      parts.push(
        `For this request, apply only these investigation skill(s): ${requestedSkills.join(", ")}.`
      );
    } else {
      parts.push(
        `Prioritize these investigation skill(s): ${requestedSkills.join(", ")}. ` +
          `You may use other loaded skills below only when necessary.`
      );
    }
  }

  for (const skill of enabled) {
    try {
      const body = await readSkillBody(skill.path);
      if (body) {
        parts.push(`## Skill: ${skill.name}\n\n${body}`);
      }
    } catch {
      /* skip unreadable skill */
    }
  }

  return {
    prompt: parts.join("\n\n"),
    activeSkillNames: enabled.map((s) => s.name),
  };
}

function emitSplunkToolResult(text: string, emit: (event: string, data: unknown) => void, log: Logger) {
  try {
    const result = JSON.parse(text) as SplunkToolResult;
    if (result.chart && !result.suppressed && chartHasData(result.chart.dataSources)) {
      log.debug({ vizType: result.chart.vizType }, "emitting chart event");
      emit("chart", {
        vizType: result.chart.vizType,
        dataSources: result.chart.dataSources,
        width: result.chart.width,
        height: result.chart.height,
        spl: result.queryMeta?.spl,
        earliest: result.queryMeta?.earliest,
        latest: result.queryMeta?.latest,
      });
    }
  } catch {
    /* not Splunk JSON */
  }
}

function flushAssistantText(
  state: FlushTextState,
  force: boolean,
  emit: (event: string, data: unknown) => void
): FlushTextState {
  return processTextBuffer(state, force, emit);
}

function processStreamTextChunk(
  state: FlushTextState,
  chunk: string,
  emit: (event: string, data: unknown) => void
): FlushTextState {
  if (!chunk) return state;
  let bufState = { ...state, textBuffer: state.textBuffer + chunk };
  if (bufState.inChartTag) {
    if (bufState.textBuffer.includes("</chart>")) {
      bufState = flushAssistantText(bufState, false, emit);
    }
  } else if (bufState.textBuffer.includes("<chart")) {
    if (bufState.textBuffer.includes("</chart>")) {
      bufState = flushAssistantText(bufState, false, emit);
    }
  } else {
    bufState = flushAssistantText(bufState, false, emit);
  }
  return bufState;
}

function splPreviewFromArgs(args: Record<string, unknown>): string | undefined {
  const raw = args.query ?? args.spl;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
}

function toolActivityLabel(toolName: string, args: Record<string, unknown>): string {
  const bare = toolName.includes("__") ? toolName.split("__").pop()! : toolName;
  if (bare === "splunk_query") return "Running Splunk search";
  return `Running ${bare}`;
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function runOpenWebUiAgent(
  userMessage: string,
  history: HistoryMessage[],
  res: Response,
  abortSignal?: AbortSignal,
  log?: Logger,
  requestedSkills?: string[],
  skillsStrict = true,
  isAdmin = false,
  mcpSessionKey?: McpSessionKey
): Promise<void> {
  const agentLog = log ?? rootLogger;
  const emit = (event: string, data: unknown) => sendSSE(res, event, data);

  const model = await getClaudeModel();
  const maxTurns = await getMaxTurns();
  const streamTimeoutMs = await getStreamTimeoutMs();

  emit("activity", { id: "skills", label: "Loading investigation skills…", status: "active" });
  const { prompt: systemPrompt, activeSkillNames } = await buildSystemPrompt(
    requestedSkills,
    skillsStrict
  );
  emit("activity", { id: "skills", label: "Skills loaded", status: "done" });

  for (const skill of activeSkillNames) {
    emit("skill", { skill });
  }

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];
  for (const entry of history) {
    if (entry.role === "user" || entry.role === "assistant") {
      messages.push({ role: entry.role, content: entry.content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  let mcpRelease: (() => void) | null = null;
  let turnCount = 0;
  let bufState: FlushTextState = { textBuffer: "", inChartTag: false };
  let lastUsage: QueryUsageData | null = null;

  const bindings = agentLog.bindings?.() ?? {};
  const requestId = String((bindings as Record<string, unknown>).requestId ?? "unknown");
  const startTime = Date.now();

  if (telemetry.enabled) {
    telemetry.emit({
      type: "query_start",
      timestamp: startTime,
      requestId,
      model,
      promptLength: userMessage.length,
      skills: requestedSkills,
    });
  }

  let mcp: Awaited<ReturnType<typeof acquireMcpSession>>["runtime"];

  try {
    emit("activity", {
      id: "mcp",
      label: "Connecting to Splunk tools…",
      status: "active",
    });
    const session = await acquireMcpSession(agentLog, mcpSessionKey);
    mcp = session.runtime;
    mcpRelease = session.release;
    const tools = session.tools;
    emit("activity", {
      id: "mcp",
      label: session.reused ? "Splunk tools ready (reused)" : "Splunk tools ready",
      status: "done",
    });
    agentLog.debug(
      { toolCount: tools.length, reused: session.reused, pooled: Boolean(mcpSessionKey) },
      "MCP tools registered for Open WebUI"
    );

    while (turnCount < maxTurns) {
      if (abortSignal?.aborted) break;

      const turnActivityId = `llm-${turnCount}`;
      emit("activity", {
        id: turnActivityId,
        label: "Thinking…",
        status: "active",
      });

      const stream = await chatCompleteStream(
        {
          model,
          messages,
          chatId: requestId,
          tools: tools.length > 0 ? tools : undefined,
          signal: abortSignal,
        },
        {
          onContentDelta: (delta) => {
            bufState = processStreamTextChunk(bufState, delta, emit);
          },
        }
      );

      emit("activity", { id: turnActivityId, label: "Thinking…", status: "done" });

      if (stream.usage) {
        lastUsage = {
          inputTokens: stream.usage.inputTokens,
          outputTokens: stream.usage.outputTokens,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalCostUsd: 0,
          modelUsage: {
            [model]: {
              costUSD: 0,
              inputTokens: stream.usage.inputTokens,
              outputTokens: stream.usage.outputTokens,
              contextWindow: 0,
            },
          },
        };
      }

      const toolCalls = stream.toolCalls;
      if (toolCalls.length === 0) {
        if (stream.content) {
          messages.push({ role: "assistant", content: stream.content });
        }
        turnCount++;
        break;
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        tool_calls: toolCalls,
      };
      if (stream.content) assistantMessage.content = stream.content;
      messages.push(assistantMessage);

      for (const call of toolCalls) {
        if (abortSignal?.aborted) break;

        const args = parseToolArguments(call.function.arguments);
        const toolActivityId = `tool-${call.id}`;
        const label = toolActivityLabel(call.function.name, args);
        const detail = splPreviewFromArgs(args);

        const resolved = resolveToolInvocation(call.function.name, mcp.connectedServers);
        if ("error" in resolved) {
          emit("activity", {
            id: toolActivityId,
            label: "Tool error",
            status: "error",
            detail: resolved.error,
          });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: resolved.error,
          });
          continue;
        }

        emit("activity", {
          id: toolActivityId,
          label,
          status: "active",
          detail,
        });

        const { text, isError } = await withMcpSessionLock(mcp, () =>
          mcp.callTool(call.function.name, args, agentLog, {
            isAdmin,
          })
        );

        emit("activity", {
          id: toolActivityId,
          label: isError ? `${label} failed` : `${label} complete`,
          status: isError ? "error" : "done",
          detail: isError ? text.slice(0, 200) : detail,
        });

        if (!isError) {
          emitSplunkToolResult(text, emit, agentLog);
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: qualifyToolName(resolved.serverName, resolved.toolName),
          content: text,
        });
      }

      bufState = flushAssistantText(bufState, true, emit);
      emit("text", { content: "\n\n" });
      turnCount++;
    }

    bufState = flushAssistantText(bufState, true, emit);

    if (lastUsage) {
      emit("usage", lastUsage);
    }
  } catch (err) {
    if (!abortSignal?.aborted) {
      agentLog.error({ err }, "Open WebUI agent error");
      const message =
        err instanceof OpenWebUiError
          ? err.message
          : classifyAgentError(err).replace(/Claude/g, "Open WebUI");
      emit("error", { message });
    }
  } finally {
    mcpRelease?.();
  }

  const durationMs = Date.now() - startTime;

  agentLog.info(
    {
      turns: turnCount,
      durationMs,
      ...(lastUsage && {
        inputTokens: lastUsage.inputTokens,
        outputTokens: lastUsage.outputTokens,
      }),
    },
    "Open WebUI agent run complete"
  );

  if (telemetry.enabled) {
    telemetry.emit({
      type: turnCount === 0 && !lastUsage ? "query_error" : "query_complete",
      timestamp: Date.now(),
      requestId,
      model,
      turnCount,
      durationMs,
      ...(lastUsage && {
        inputTokens: lastUsage.inputTokens,
        outputTokens: lastUsage.outputTokens,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalCostUsd: 0,
      }),
    });
  }

  if (abortSignal?.aborted && abortSignal.reason === "stream_timeout") {
    const timeoutMinutes = Math.round(streamTimeoutMs / 60_000);
    emit("limit", {
      reason: "stream_timeout",
      message: `This investigation timed out after ${timeoutMinutes} minute${timeoutMinutes !== 1 ? "s" : ""}.`,
      setting: "Time limit",
    });
  } else if (turnCount >= maxTurns) {
    emit("limit", {
      reason: "max_turns",
      message: `This investigation reached the ${maxTurns}-turn limit.`,
      setting: "Max steps per investigation",
    });
  }

  emit("done", {});
}
