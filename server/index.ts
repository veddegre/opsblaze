import "dotenv/config";
import crypto from "crypto";
import fs from "fs";

import net from "net";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import type { Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { logger } from "./logger.js";
import { validateEnv, getEnv } from "./env.js";
import { validateDeploymentSecurity } from "./deployment-security.js";
import { runAgent } from "./agent.js";
import { evictMcpSession, evictAllMcpSessions } from "./mcp-session-pool.js";
import { classifyAgentError } from "./pipeline.js";
import {
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  cleanupConversations,
  searchConversations,
  resolveSkillScopeUpdate,
} from "./conversations.js";
import type { StoredConversation } from "./conversations.js";
import {
  listMcpServers,
  getMcpServer,
  addMcpServer,
  updateMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  MCP_CONFIG_PATH,
} from "./mcp-config.js";
import type { McpServerEntry } from "./mcp-config.js";
import { probeMcpServer } from "./mcp-probe.js";
import {
  listSkills,
  getSkillContent,
  updateSkill,
  toggleSkill,
  createSkill,
  deleteSkill,
  validateSkillsParam,
  getSkillsDirPath,
} from "./skills.js";
import { ensureOpsblazeSkillsLayout } from "./skills-path.js";
import { getSplunkGuardrails, getSplunkAdminGuardEnv } from "./splunk-guardrails.js";
import { getThreatIntelSettings } from "./threat-intel-settings.js";
import {
  listPlaybooks,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
  playbookSchema,
} from "./playbooks.js";
import { recordAudit, listAuditEvents } from "./audit-log.js";
import { extractSkill, refineSkill } from "./skill-extractor.js";
import { renderExportHtml } from "./export.js";
import { runHealthChecks } from "./health.js";
import {
  updateRuntimeSettings,
  getClaudeModel,
  getClaudeEffort,
  getMaxTurns,
  getStreamTimeoutMs,
  getRedactionSettings,
  getConfiguredSkillPacks,
} from "./runtime-settings.js";
import {
  redactConversation,
  normalizeExportRedactionTerms,
  MAX_EXPORT_REDACTION_TERM_LEN,
  MAX_EXPORT_REDACTION_TERMS,
  MAX_EXPORT_REDACTION_TOTAL_LEN,
} from "./redaction.js";
import { buildChatHistoryFromMessages } from "./chat-history.js";
import { rateLimitKey } from "./rate-limit-key.js";
import { isOpenWebUiMode } from "./llm-config.js";
import { listOpenWebUiModelOptions } from "./openwebui-models.js";
import { OpenWebUiError } from "./openwebui-client.js";
import {
  getRequestUserId,
  isRequestAdmin,
  requireAdmin,
  setupAuth,
  validateLocalAuthFile,
} from "./auth/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "127.0.0.1";
const MAX_HISTORY = parseInt(process.env.OPSBLAZE_MAX_HISTORY ?? "20", 10);
const MAX_MESSAGE_LEN = parseInt(process.env.OPSBLAZE_MAX_MESSAGE_LEN ?? "10000", 10);
const MAX_HISTORY_ENTRY_LEN = 50_000;
const MAX_MESSAGES_PER_CONVERSATION = 500;
const MAX_SKILL_CONTENT_LEN = 100_000;
const MAX_SEARCH_LEN = 500;
const MIN_CLEANUP_DAYS = 1;

const KNOWN_VALIDATION_PATTERNS = [
  "already exists",
  "built-in",
  "not found",
  "not allowed",
  "requires a",
  "must be",
  "Unknown server type",
  "no SKILL.md",
  "alphanumeric",
  "reserved words",
  "description",
  "blocked for security",
];

function safeErrorMessage(err: unknown): string | null {
  const msg = (err as Error).message ?? "";
  if (KNOWN_VALIDATION_PATTERNS.some((p) => msg.includes(p))) {
    return msg.slice(0, 200);
  }
  return null;
}

const MCP_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const CONVERSATION_ID_RE = /^[a-zA-Z0-9-]+$/;

function validateMcpName(name: string, res: Response): boolean {
  if (!name || name.length > 64 || !MCP_NAME_RE.test(name)) {
    res
      .status(400)
      .json({ error: "name must be 1-64 alphanumeric characters with hyphens/underscores" });
    return false;
  }
  return true;
}

function validateMessages(messages: unknown): messages is Array<unknown> {
  if (!Array.isArray(messages)) return false;
  if (messages.length > MAX_MESSAGES_PER_CONVERSATION) return false;
  return true;
}

const app = express();

const allowedOrigins = (
  process.env.OPSBLAZE_ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "2mb" }));

setupAuth(app);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

const rateLimitKeyGen = (req: import("express").Request) => rateLimitKey(req);

const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: parseInt(process.env.OPSBLAZE_RATE_LIMIT ?? "10", 10),
  keyGenerator: rateLimitKeyGen,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: parseInt(process.env.OPSBLAZE_API_RATE_LIMIT ?? "60", 10),
  keyGenerator: rateLimitKeyGen,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const activeConnections = new Set<{
  res: Response;
  abort: AbortController;
}>();

app.post("/api/chat", chatLimiter, async (req, res) => {
  const requestId = crypto.randomUUID();
  const userId = getRequestUserId(req);
  const reqLog = logger.child({ requestId, userId });

  const {
    message,
    conversationId: rawConversationId,
    history: rawHistory,
    skills: rawSkills,
    skillsStrict: rawSkillsStrict,
  } = req.body as {
    message: string;
    conversationId?: string;
    history?: Array<{ role: string; content: string }>;
    skills?: string[];
    skillsStrict?: boolean;
  };

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (message.length > MAX_MESSAGE_LEN) {
    res.status(400).json({ error: `message exceeds ${MAX_MESSAGE_LEN} character limit` });
    return;
  }

  if (rawHistory !== undefined && rawHistory !== null) {
    reqLog.warn("client-sent chat history ignored; use conversationId for server-side history");
  }

  let history: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (typeof rawConversationId === "string" && rawConversationId.trim()) {
    const convId = rawConversationId.trim();
    if (!CONVERSATION_ID_RE.test(convId) || convId.length > 128) {
      res.status(400).json({ error: "Invalid conversationId" });
      return;
    }
    const conv = await getConversation(userId, convId);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    history = buildChatHistoryFromMessages(conv.messages, message, {
      maxEntries: MAX_HISTORY,
      maxEntryLen: MAX_HISTORY_ENTRY_LEN,
    });
  }

  const skillResult = await validateSkillsParam(rawSkills);
  if ("error" in skillResult) {
    res.status(400).json({ error: skillResult.error });
    return;
  }
  const requestedSkills = skillResult.skills;
  const skillsStrict = requestedSkills ? rawSkillsStrict !== false : true;

  reqLog.info(
    {
      messageLen: message.length,
      historyLen: history.length,
      ...(requestedSkills && { skills: requestedSkills, skillsStrict }),
    },
    "chat request received"
  );

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const abortController = new AbortController();
  const conn = { res, abort: abortController };
  activeConnections.add(conn);

  res.on("close", () => {
    activeConnections.delete(conn);
    if (!res.writableFinished) {
      abortController.abort();
    }
  });

  const timeoutMs = await getStreamTimeoutMs();
  const streamTimeout = setTimeout(() => {
    reqLog.error("stream timeout reached, aborting agent");
    abortController.abort("stream_timeout");
  }, timeoutMs);

  const mcpSessionKey =
    typeof rawConversationId === "string" && rawConversationId.trim()
      ? { userId, conversationId: rawConversationId.trim() }
      : undefined;

  try {
    await runAgent(
      message,
      history,
      res,
      abortController.signal,
      reqLog,
      requestedSkills,
      skillsStrict,
      isRequestAdmin(req),
      mcpSessionKey
    );
  } catch (err) {
    if (!abortController.signal.aborted && !res.writableEnded && !res.destroyed) {
      reqLog.error({ err }, "chat error");
      const userMessage = classifyAgentError(err);
      res.write(`event: error\ndata: ${JSON.stringify({ message: userMessage })}\n\n`);
      res.write(`event: done\ndata: {}\n\n`);
    }
  } finally {
    clearTimeout(streamTimeout);
    activeConnections.delete(conn);
  }

  reqLog.info("chat request complete");
  res.end();
});

app.get("/api/conversations", apiLimiter, async (req, res) => {
  try {
    const conversations = await listConversations(getRequestUserId(req));
    res.json(conversations);
  } catch (err) {
    logger.error({ err }, "failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

app.get("/api/conversations/search", apiLimiter, async (req, res) => {
  try {
    const q = ((req.query.q as string) ?? "").trim();
    if (!q) {
      res.json([]);
      return;
    }
    if (q.length > MAX_SEARCH_LEN) {
      res.status(400).json({ error: `search query exceeds ${MAX_SEARCH_LEN} character limit` });
      return;
    }
    const results = await searchConversations(getRequestUserId(req), q);
    res.json(results);
  } catch (err) {
    logger.error({ err }, "failed to search conversations");
    res.status(500).json({ error: "Failed to search conversations" });
  }
});

app.get("/api/conversations/:id", apiLimiter, async (req, res) => {
  try {
    const conv = await getConversation(getRequestUserId(req), req.params.id as string);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(conv);
  } catch (err) {
    logger.error({ err, id: req.params.id }, "failed to get conversation");
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

app.post("/api/conversations", apiLimiter, async (req, res) => {
  try {
    const { id, title, messages } = req.body as Partial<StoredConversation>;
    if (!id || !title) {
      res.status(400).json({ error: "id and title are required" });
      return;
    }
    if (id.length > 128) {
      res.status(400).json({ error: "id exceeds 128 character limit" });
      return;
    }
    if (!CONVERSATION_ID_RE.test(id)) {
      res.status(400).json({
        error: "id must contain only letters, numbers, and hyphens",
      });
      return;
    }
    if (title.length > 256) {
      res.status(400).json({ error: "title exceeds 256 character limit" });
      return;
    }
    if (messages !== undefined && !validateMessages(messages)) {
      res.status(400).json({
        error: `messages must be an array with at most ${MAX_MESSAGES_PER_CONVERSATION} entries`,
      });
      return;
    }
    const now = new Date().toISOString();
    const conv: StoredConversation = {
      id,
      title,
      messages: (messages as StoredConversation["messages"]) ?? [],
      createdAt: now,
      updatedAt: now,
    };
    const userId = getRequestUserId(req);
    await saveConversation(userId, conv);
    res.status(201).json(conv);
  } catch (err) {
    logger.error({ err }, "failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

app.put("/api/conversations/:id", apiLimiter, async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await getConversation(userId, req.params.id as string);
    if (!existing) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const {
      title,
      messages,
      exportRedactions,
      skillScope: skillScopeRaw,
    } = req.body as Partial<StoredConversation> & { skillScope?: unknown };
    if (messages !== undefined && !validateMessages(messages)) {
      res.status(400).json({
        error: `messages must be an array with at most ${MAX_MESSAGES_PER_CONVERSATION} entries`,
      });
      return;
    }
    if (exportRedactions !== undefined) {
      if (!Array.isArray(exportRedactions) || exportRedactions.some((s) => typeof s !== "string")) {
        res.status(400).json({ error: "exportRedactions must be an array of strings" });
        return;
      }
      if (exportRedactions.length > MAX_EXPORT_REDACTION_TERMS) {
        res
          .status(400)
          .json({ error: `At most ${MAX_EXPORT_REDACTION_TERMS} export redaction terms` });
        return;
      }
      let totalLen = 0;
      for (const s of exportRedactions) {
        if (s.length > MAX_EXPORT_REDACTION_TERM_LEN) {
          res.status(400).json({
            error: `Each export redaction term must be at most ${MAX_EXPORT_REDACTION_TERM_LEN} characters`,
          });
          return;
        }
        totalLen += s.trim().length;
      }
      if (totalLen > MAX_EXPORT_REDACTION_TOTAL_LEN) {
        res.status(400).json({
          error: `Export redaction terms exceed ${MAX_EXPORT_REDACTION_TOTAL_LEN} characters total`,
        });
        return;
      }
    }
    let skillScope = existing.skillScope;
    if (skillScopeRaw !== undefined) {
      try {
        skillScope = resolveSkillScopeUpdate(skillScopeRaw, existing.skillScope);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
    }

    const updated: StoredConversation = {
      ...existing,
      title: title ?? existing.title,
      messages: (messages as StoredConversation["messages"]) ?? existing.messages,
      skillScope,
      exportRedactions:
        exportRedactions !== undefined
          ? normalizeExportRedactionTerms(exportRedactions)
          : existing.exportRedactions,
      updatedAt: new Date().toISOString(),
    };
    await saveConversation(userId, updated);
    res.json(updated);
  } catch (err) {
    logger.error({ err, id: req.params.id }, "failed to update conversation");
    res.status(500).json({ error: "Failed to update conversation" });
  }
});

app.delete("/api/conversations/:id", apiLimiter, async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const convId = req.params.id as string;
    const deleted = await deleteConversation(userId, convId);
    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    await evictMcpSession({ userId, conversationId: convId }, logger);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id: req.params.id }, "failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

app.get("/api/conversations/:id/export", apiLimiter, async (req, res) => {
  try {
    let conv = await getConversation(getRequestUserId(req), req.params.id as string);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const mode = req.query.mode === "findings" ? "findings" : "full";
    const redactionSettings = await getRedactionSettings();
    const redactParam = req.query.redact;
    const shouldRedact =
      redactParam === "1" || redactParam === "true"
        ? true
        : redactParam === "0" || redactParam === "false"
          ? false
          : Boolean(redactionSettings.applyOnExport);

    if (shouldRedact) {
      conv = redactConversation(conv, {
        settings: redactionSettings,
        conversationStrings: conv.exportRedactions ?? [],
      });
    }

    const clean = req.query.clean !== "0" && req.query.clean !== "false";
    const html = renderExportHtml(conv, { mode, redacted: shouldRedact, clean });
    const userId = getRequestUserId(req);
    const isPreview = req.query.preview === "1" || req.query.preview === "true";
    if (isPreview) {
      void recordAudit(userId, "export.preview", {
        conversationId: conv.id,
        mode,
        redacted: shouldRedact,
      });
      res.json({
        html,
        title: conv.title,
        mode,
        redacted: shouldRedact,
        clean,
      });
      return;
    }
    void recordAudit(userId, "export.download", {
      conversationId: conv.id,
      mode,
      redacted: shouldRedact,
    });
    const safeTitle = conv.title
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80);
    const filenamePrefix = [
      mode === "findings" ? "findings" : "investigation",
      shouldRedact ? "redacted" : null,
    ]
      .filter(Boolean)
      .join("-");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filenamePrefix}-${safeTitle}.html"`
    );
    res.send(html);
  } catch (err) {
    logger.error({ err, id: req.params.id }, "failed to export conversation");
    res.status(500).json({ error: "Failed to export conversation" });
  }
});

app.post("/api/conversations/cleanup", apiLimiter, async (req, res) => {
  try {
    const { maxAgeDays } = req.body as { maxAgeDays?: number };
    const days = maxAgeDays && maxAgeDays >= MIN_CLEANUP_DAYS ? maxAgeDays : 90;
    const deleted = await cleanupConversations(getRequestUserId(req), days);
    res.json({ deleted, maxAgeDays: days });
  } catch (err) {
    logger.error({ err }, "failed to cleanup conversations");
    res.status(500).json({ error: "Failed to cleanup conversations" });
  }
});

// --- Config paths ---

app.get("/api/config-paths", apiLimiter, requireAdmin, (_req, res) => {
  res.json({ mcpConfig: MCP_CONFIG_PATH, skillsDir: getSkillsDirPath() });
});

// --- Audit log (admin only) ---

app.get("/api/audit", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const raw = parseInt(String(req.query.limit ?? "200"), 10);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 1000) : 200;
    const events = await listAuditEvents(limit);
    res.json({ events });
  } catch {
    res.status(500).json({ error: "Failed to read audit log" });
  }
});

// --- Runtime settings routes ---

function buildSystemSettingsPayload() {
  const openWebUi = isOpenWebUiMode();
  const adminSplunk = getSplunkAdminGuardEnv();
  return {
    llmProvider: openWebUi ? ("openwebui" as const) : ("claude" as const),
    splunkHost: process.env.SPLUNK_HOST ?? "",
    splunkPort: parseInt(process.env.SPLUNK_PORT ?? "8089", 10),
    splunkScheme: process.env.SPLUNK_SCHEME ?? "https",
    splunkAuthMethod: process.env.SPLUNK_TOKEN ? "Token" : "Basic",
    serverPort: PORT,
    bindAddress: HOST,
    claudeAuthMethod: openWebUi ? "Open WebUI" : process.env.ANTHROPIC_API_KEY ? "API Key" : "CLI",
    serverMode: process.env.NODE_ENV === "production" ? "Prod" : "Dev",
    splunkGuardrailsAdmin: {
      bypassIndexes: adminSplunk.bypassIndexes,
      extraIndexes: adminSplunk.extraIndexes,
    },
  };
}

app.get("/api/settings", apiLimiter, async (req, res) => {
  try {
    const [
      model,
      effort,
      maxTurns,
      streamTimeoutMs,
      redaction,
      skillPacks,
      splunkGuardrails,
      threatIntel,
    ] = await Promise.all([
      getClaudeModel(),
      getClaudeEffort(),
      getMaxTurns(),
      getStreamTimeoutMs(),
      getRedactionSettings(),
      getConfiguredSkillPacks(),
      getSplunkGuardrails(),
      getThreatIntelSettings(),
    ]);
    const openWebUi = isOpenWebUiMode();
    const redactionForClient = isRequestAdmin(req)
      ? redaction
      : { applyOnExport: redaction.applyOnExport ?? false };

    const payload: {
      runtime: {
        claudeModel: string;
        claudeEffort: string;
        maxTurns: number;
        streamTimeoutMs: number;
        llmProvider: "openwebui" | "claude";
        redaction: typeof redactionForClient;
        skillPacks: Awaited<ReturnType<typeof getConfiguredSkillPacks>>;
        splunkGuardrails?: Awaited<ReturnType<typeof getSplunkGuardrails>>;
        threatIntel?: Awaited<ReturnType<typeof getThreatIntelSettings>>;
      };
      system?: ReturnType<typeof buildSystemSettingsPayload>;
    } = {
      runtime: {
        claudeModel: model,
        claudeEffort: effort,
        maxTurns,
        streamTimeoutMs,
        llmProvider: openWebUi ? "openwebui" : "claude",
        redaction: redactionForClient,
        skillPacks,
        ...(isRequestAdmin(req) ? { splunkGuardrails, threatIntel } : {}),
      },
    };
    if (isRequestAdmin(req)) {
      payload.system = buildSystemSettingsPayload();
    }
    res.json(payload);
  } catch (err) {
    logger.error({ err }, "failed to get settings");
    res.status(500).json({ error: "Failed to get settings" });
  }
});

app.get("/api/openwebui/models", apiLimiter, async (_req, res) => {
  if (!isOpenWebUiMode()) {
    res.status(404).json({ error: "Open WebUI is not configured" });
    return;
  }
  try {
    const models = await listOpenWebUiModelOptions(AbortSignal.timeout(15_000));
    res.json({ models });
  } catch (err) {
    const message =
      err instanceof OpenWebUiError
        ? err.message
        : (err as Error).message || "Failed to load models from Open WebUI";
    logger.warn({ err }, "failed to list Open WebUI models");
    res.status(502).json({ error: message.slice(0, 300) });
  }
});

app.patch("/api/settings", apiLimiter, requireAdmin, async (req, res) => {
  try {
    await updateRuntimeSettings(req.body);
    void recordAudit(getRequestUserId(req), "settings.update", {
      keys: Object.keys(req.body ?? {}),
    });
    const [
      model,
      effort,
      maxTurns,
      streamTimeoutMs,
      redaction,
      skillPacks,
      splunkGuardrails,
      threatIntel,
    ] = await Promise.all([
      getClaudeModel(),
      getClaudeEffort(),
      getMaxTurns(),
      getStreamTimeoutMs(),
      getRedactionSettings(),
      getConfiguredSkillPacks(),
      getSplunkGuardrails(),
      getThreatIntelSettings(),
    ]);
    res.json({
      runtime: {
        claudeModel: model,
        claudeEffort: effort,
        maxTurns,
        streamTimeoutMs,
        redaction,
        skillPacks,
        splunkGuardrails,
        threatIntel,
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (
      msg.includes("Expected") ||
      msg.includes("invalid") ||
      msg.includes("Invalid internal") ||
      msg.includes("Zone name") ||
      msg.includes("Duplicate zone")
    ) {
      res.status(400).json({ error: msg });
    } else {
      logger.error({ err }, "failed to update settings");
      res.status(500).json({ error: "Failed to update settings" });
    }
  }
});

// --- MCP Server management routes ---

app.get("/api/mcp-servers", apiLimiter, async (_req, res) => {
  try {
    const servers = await listMcpServers();
    res.json(servers);
  } catch (err) {
    logger.error({ err }, "failed to list MCP servers");
    res.status(500).json({ error: "Failed to list MCP servers" });
  }
});

app.post("/api/mcp-servers", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const { name, config } = req.body as { name: string; config: McpServerEntry };
    if (!name || !config) {
      res.status(400).json({ error: "name and config are required" });
      return;
    }
    if (!validateMcpName(name, res)) return;
    await addMcpServer(name, config);
    void evictAllMcpSessions(logger);
    void recordAudit(getRequestUserId(req), "mcp.create", { name });
    res.status(201).json({ ok: true });
  } catch (err) {
    const safe = safeErrorMessage(err);
    if (safe && (safe.includes("already exists") || safe.includes("built-in"))) {
      res.status(409).json({ error: safe });
    } else if (safe) {
      res.status(400).json({ error: safe });
    } else {
      logger.error({ err }, "failed to add MCP server");
      res.status(500).json({ error: "Failed to add MCP server" });
    }
  }
});

app.put("/api/mcp-servers/:name", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const name = req.params.name as string;
    if (!validateMcpName(name, res)) return;
    const config = req.body as McpServerEntry;
    await updateMcpServer(name, config);
    void evictAllMcpSessions(logger);
    void recordAudit(getRequestUserId(req), "mcp.update", { name });
    res.json({ ok: true });
  } catch (err) {
    const safe = safeErrorMessage(err);
    if (safe?.includes("not found")) {
      res.status(404).json({ error: "MCP server not found" });
    } else if (safe?.includes("built-in")) {
      res.status(403).json({ error: "Cannot modify built-in server" });
    } else if (safe) {
      res.status(400).json({ error: safe });
    } else {
      logger.error({ err, name: req.params.name }, "failed to update MCP server");
      res.status(500).json({ error: "Failed to update MCP server" });
    }
  }
});

app.delete("/api/mcp-servers/:name", apiLimiter, requireAdmin, async (req, res) => {
  try {
    if (!validateMcpName(req.params.name as string, res)) return;
    const name = req.params.name as string;
    await deleteMcpServer(name);
    void evictAllMcpSessions(logger);
    void recordAudit(getRequestUserId(req), "mcp.delete", { name });
    res.json({ ok: true });
  } catch (err) {
    const safe = safeErrorMessage(err);
    if (safe?.includes("not found")) {
      res.status(404).json({ error: "MCP server not found" });
    } else if (safe?.includes("built-in")) {
      res.status(403).json({ error: "Cannot modify built-in server" });
    } else {
      logger.error({ err, name: req.params.name }, "failed to delete MCP server");
      res.status(500).json({ error: "Failed to delete MCP server" });
    }
  }
});

app.post("/api/mcp-servers/:name/toggle", apiLimiter, requireAdmin, async (req, res) => {
  try {
    if (!validateMcpName(req.params.name as string, res)) return;
    const { enabled } = req.body as { enabled: boolean };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled (boolean) is required" });
      return;
    }
    const name = req.params.name as string;
    await toggleMcpServer(name, enabled);
    void recordAudit(getRequestUserId(req), "mcp.toggle", { name, enabled });
    res.json({ ok: true });
  } catch (err) {
    const safe = safeErrorMessage(err);
    if (safe?.includes("not found")) {
      res.status(404).json({ error: "MCP server not found" });
    } else if (safe?.includes("built-in")) {
      res.status(403).json({ error: "Cannot modify built-in server" });
    } else {
      logger.error({ err, name: req.params.name }, "failed to toggle MCP server");
      res.status(500).json({ error: "Failed to toggle MCP server" });
    }
  }
});

app.post("/api/mcp-servers/:name/test", apiLimiter, requireAdmin, async (req, res) => {
  try {
    if (!validateMcpName(req.params.name as string, res)) return;
    const server = await getMcpServer(req.params.name as string);
    if (!server) {
      res.status(404).json({ error: "Server not found" });
      return;
    }
    const result = await probeMcpServer(server.name, server.config);
    res.json(result);
  } catch (err) {
    logger.error({ err, name: req.params.name }, "failed to probe MCP server");
    res.status(500).json({ error: "Failed to test MCP server" });
  }
});

// --- Skills management routes ---

app.get("/api/skills", apiLimiter, async (_req, res) => {
  try {
    const skills = await listSkills();
    res.json(skills);
  } catch (err) {
    logger.error({ err }, "failed to list skills");
    res.status(500).json({ error: "Failed to list skills" });
  }
});

app.get("/api/skills/:name", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const name = req.params.name as string;
    const { content, enabled } = await getSkillContent(name);
    res.json({ name, content, enabled });
  } catch (err) {
    const safe = safeErrorMessage(err);
    if (safe?.includes("not found") || safe?.includes("no SKILL.md")) {
      res.status(404).json({ error: "Skill not found" });
    } else if (safe?.includes("Invalid skill name")) {
      res.status(400).json({ error: safe });
    } else {
      logger.error({ err, name: req.params.name }, "failed to read skill");
      res.status(500).json({ error: "Failed to read skill" });
    }
  }
});

app.put("/api/skills/:name", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const name = req.params.name as string;
    const { content } = req.body as { content: string };
    if (typeof content !== "string") {
      res.status(400).json({ error: "content (string) is required" });
      return;
    }
    if (content.length > MAX_SKILL_CONTENT_LEN) {
      res.status(400).json({
        error: `content exceeds ${MAX_SKILL_CONTENT_LEN} character limit`,
      });
      return;
    }
    await updateSkill(name, content);
    void recordAudit(getRequestUserId(req), "skill.update", { name });
    res.json({ ok: true });
  } catch (err) {
    const safe = safeErrorMessage(err);
    if (safe?.includes("not found") || safe?.includes("no SKILL.md")) {
      res.status(404).json({ error: "Skill not found" });
    } else if (safe) {
      res.status(400).json({ error: safe });
    } else {
      logger.error({ err, name: req.params.name }, "failed to update skill");
      res.status(500).json({ error: "Failed to update skill" });
    }
  }
});

app.post("/api/skills/:name/toggle", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled (boolean) is required" });
      return;
    }
    const name = req.params.name as string;
    await toggleSkill(name, enabled);
    void recordAudit(getRequestUserId(req), "skill.toggle", { name, enabled });
    res.json({ ok: true });
  } catch (err) {
    const safe = safeErrorMessage(err);
    if (safe?.includes("not found") || safe?.includes("no SKILL.md")) {
      res.status(404).json({ error: "Skill not found" });
    } else {
      logger.error({ err, name: req.params.name }, "failed to toggle skill");
      res.status(500).json({ error: "Failed to toggle skill" });
    }
  }
});

app.delete("/api/skills/:name", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const name = req.params.name as string;
    await deleteSkill(name);
    void recordAudit(getRequestUserId(req), "skill.delete", { name });
    res.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("not found")) {
      res.status(404).json({ error: msg });
    } else if (msg.includes("Invalid")) {
      res.status(400).json({ error: msg });
    } else {
      logger.error({ err, name: req.params.name }, "failed to delete skill");
      res.status(500).json({ error: "Failed to delete skill" });
    }
  }
});

app.post("/api/skills", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const { name, content } = req.body as { name: string; content: string };
    if (!name || !content) {
      res.status(400).json({ error: "name and content are required" });
      return;
    }
    if (name.length > 64) {
      res.status(400).json({ error: "name exceeds 64 character limit" });
      return;
    }
    if (content.length > MAX_SKILL_CONTENT_LEN) {
      res.status(400).json({
        error: `content exceeds ${MAX_SKILL_CONTENT_LEN} character limit`,
      });
      return;
    }
    await createSkill(name, content);
    void recordAudit(getRequestUserId(req), "skill.create", { name });
    res.status(201).json({ ok: true });
  } catch (err) {
    const safe = safeErrorMessage(err);
    if (safe?.includes("already exists")) {
      res.status(409).json({ error: "A skill with that name already exists" });
    } else if (safe) {
      res.status(400).json({ error: safe });
    } else {
      logger.error({ err }, "failed to create skill");
      res.status(500).json({ error: "Failed to create skill" });
    }
  }
});

const extractLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  keyGenerator: rateLimitKeyGen,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many extraction requests, please try again later" },
});

app.post("/api/skills/extract", extractLimiter, async (req, res) => {
  const ac = new AbortController();
  req.on("close", () => ac.abort());

  try {
    const { conversationId } = req.body as { conversationId: string };
    if (!conversationId) {
      res.status(400).json({ error: "conversationId is required" });
      return;
    }
    const conv = await getConversation(getRequestUserId(req), conversationId);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const draft = await extractSkill(
      conv.messages as Array<{
        role: string;
        blocks: Array<{
          type: string;
          content?: string;
          vizType?: string;
          spl?: string;
        }>;
      }>,
      ac.signal
    );
    if (!res.headersSent) res.json(draft);
  } catch (err) {
    if ((err as Error).name === "AbortedError") {
      logger.debug("skill extraction cancelled by client");
      if (!res.headersSent) res.status(499).end();
      return;
    }
    logger.error({ err }, "failed to extract skill");
    if (!res.headersSent) res.status(500).json({ error: "Skill extraction failed" });
  }
});

app.post("/api/skills/refine", extractLimiter, async (req, res) => {
  const ac = new AbortController();
  req.on("close", () => ac.abort());

  try {
    const { draft, instruction, conversationSummary } = req.body as {
      draft: string;
      instruction: string;
      conversationSummary: string;
    };
    if (!draft || !instruction) {
      res.status(400).json({ error: "draft and instruction are required" });
      return;
    }
    if (draft.length > MAX_SKILL_CONTENT_LEN) {
      res.status(400).json({ error: "draft is too large" });
      return;
    }
    if (instruction.length > MAX_MESSAGE_LEN) {
      res.status(400).json({ error: "instruction is too large" });
      return;
    }
    const updated = await refineSkill(draft, instruction, conversationSummary ?? "", ac.signal);
    if (!res.headersSent) res.json(updated);
  } catch (err) {
    if ((err as Error).name === "AbortedError") {
      logger.debug("skill refinement cancelled by client");
      if (!res.headersSent) res.status(499).end();
      return;
    }
    logger.error({ err }, "failed to refine skill");
    if (!res.headersSent) res.status(500).json({ error: "Skill refinement failed" });
  }
});

// --- Investigation playbooks ---

app.get("/api/playbooks", apiLimiter, async (_req, res) => {
  try {
    res.json({ playbooks: await listPlaybooks() });
  } catch (err) {
    logger.error({ err }, "failed to list playbooks");
    res.status(500).json({ error: "Failed to list playbooks" });
  }
});

app.post("/api/playbooks", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const parsed = playbookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid playbook" });
      return;
    }
    const playbook = await createPlaybook(parsed.data);
    void recordAudit(getRequestUserId(req), "playbook.create", {
      id: playbook.id,
      name: playbook.name,
    });
    res.status(201).json(playbook);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("already exists")) {
      res.status(409).json({ error: msg });
    } else {
      logger.error({ err }, "failed to create playbook");
      res.status(500).json({ error: "Failed to create playbook" });
    }
  }
});

app.patch("/api/playbooks/:id", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id as string;
    const parsed = playbookSchema.safeParse({ ...req.body, id });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid playbook" });
      return;
    }
    const playbook = await updatePlaybook(id, parsed.data);
    if (!playbook) {
      res.status(404).json({ error: "Playbook not found" });
      return;
    }
    void recordAudit(getRequestUserId(req), "playbook.update", {
      id: playbook.id,
      name: playbook.name,
    });
    res.json(playbook);
  } catch (err) {
    logger.error({ err, id: req.params.id }, "failed to update playbook");
    res.status(500).json({ error: "Failed to update playbook" });
  }
});

app.delete("/api/playbooks/:id", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id as string;
    const deleted = await deletePlaybook(id);
    if (!deleted) {
      res.status(404).json({ error: "Playbook not found" });
      return;
    }
    void recordAudit(getRequestUserId(req), "playbook.delete", { id });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id: req.params.id }, "failed to delete playbook");
    res.status(500).json({ error: "Failed to delete playbook" });
  }
});

// --- Audit log (admin) ---

app.get("/api/audit", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const limitRaw = parseInt(String(req.query.limit ?? "200"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, limitRaw)) : 200;
    const events = await listAuditEvents(limit);
    res.json({ events });
  } catch (err) {
    logger.error({ err }, "failed to list audit events");
    res.status(500).json({ error: "Failed to list audit events" });
  }
});

app.get("/api/health", async (_req, res) => {
  const result = await runHealthChecks();
  res.status(result.status === "error" ? 503 : 200).json(result);
});

const clientDist = path.resolve(__dirname, "../client");
app.use(express.static(clientDist));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

function validateStartup(): boolean {
  const envResult = validateEnv();
  if (!envResult.ok) {
    for (const err of envResult.errors) {
      logger.error(`env: ${err}`);
    }
    return false;
  }

  const deploymentErrors = validateDeploymentSecurity(getEnv());
  if (deploymentErrors.length > 0) {
    for (const err of deploymentErrors) {
      logger.error(`security: ${err}`);
    }
    return false;
  }

  let ok = true;

  const envPath = path.resolve(process.cwd(), ".env");
  try {
    const stat = fs.statSync(envPath);
    const mode = stat.mode & 0o777;
    if (mode & 0o077) {
      const msg = ".env file is readable by other users — run: chmod 600 .env";
      if (process.env.NODE_ENV === "production") {
        logger.error({ path: envPath, mode: `0${mode.toString(8)}` }, msg);
        ok = false;
      } else {
        logger.warn({ path: envPath, mode: `0${mode.toString(8)}` }, msg);
      }
    }
  } catch {
    /* .env may not exist */
  }

  const openWebUiUrl = process.env.OPENWEBUI_BASE_URL?.trim();
  if (openWebUiUrl) {
    if (!process.env.OPENWEBUI_API_KEY?.trim()) {
      logger.error("OPENWEBUI_API_KEY is required when OPENWEBUI_BASE_URL is set");
      ok = false;
    } else {
      const model = process.env.OPENWEBUI_MODEL?.trim();
      if (!model) {
        logger.warn(
          "OPENWEBUI_MODEL is not set — set it to a model ID from Open WebUI (Settings or GET /api/models)"
        );
      }
      logger.info(
        { baseUrl: openWebUiUrl, model: model || "(configure OPENWEBUI_MODEL)" },
        "LLM: Open WebUI"
      );
    }
  } else if (process.env.ANTHROPIC_API_KEY) {
    logger.info("Claude auth: API key");
  } else {
    try {
      const authOutput = execFileSync("claude", ["auth", "status", "--json"], {
        encoding: "utf-8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      try {
        const authStatus = JSON.parse(authOutput);
        if (authStatus.loggedIn) {
          logger.info("Claude auth: CLI OAuth");
        } else {
          logger.error(
            "Claude CLI is installed but not logged in. Run 'claude auth login' to authenticate."
          );
          ok = false;
        }
      } catch {
        logger.error("Claude CLI returned unexpected output from 'claude auth status --json'");
        ok = false;
      }
    } catch {
      logger.error(
        "Claude CLI not found. Install with 'npm i -g @anthropic-ai/claude-code' then run 'claude auth login' to authenticate."
      );
      ok = false;
    }
  }

  return ok;
}

if (!validateStartup()) {
  logger.fatal("Startup validation failed — fix the errors above and restart");
  process.exit(1);
}

const localAuthStartupError = await validateLocalAuthFile();
if (localAuthStartupError) {
  logger.fatal({ error: localAuthStartupError }, "local authentication configuration invalid");
  process.exit(1);
}

const PORT_CONFLICT_EXIT = 98;

function identifyPortSquatter(port: number): { pid: string; command: string } | null {
  try {
    const pids = execFileSync("lsof", ["-i", `:${port}`, "-t"], { encoding: "utf-8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    if (pids.length === 0) return null;
    const pid = pids[0];
    let command = "(unknown)";
    try {
      command = execFileSync("ps", ["-p", pid, "-o", "command="], { encoding: "utf-8" }).trim();
    } catch {
      /* ps may fail on some systems */
    }
    return { pid, command };
  } catch {
    return null;
  }
}

function probePort(port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (err: NodeJS.ErrnoException) => reject(err));
    probe.listen(port, host, () => {
      probe.close(() => resolve());
    });
  });
}

const PORT_RETRY_DELAYS = [200, 400, 800, 1600, 2000];

async function waitForPort(port: number, host: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await probePort(port, host);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
      if (attempt >= PORT_RETRY_DELAYS.length) {
        const squatter = identifyPortSquatter(port);
        if (squatter) {
          logger.fatal(
            { port, squatterPid: squatter.pid, squatterCommand: squatter.command },
            `Port ${port} is already in use by PID ${squatter.pid}\n` +
              `  Command: ${squatter.command}\n` +
              `  Action:  kill ${squatter.pid}   (or use: node bin/opsblaze.cjs stop)`
          );
        } else {
          logger.fatal({ port }, `Port ${port} is already in use (could not identify process)`);
        }
        throw err;
      }
      const delay = PORT_RETRY_DELAYS[attempt];
      logger.info({ port, attempt: attempt + 1 }, `Port ${port} busy, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

try {
  await waitForPort(PORT, HOST);
} catch {
  process.exit(PORT_CONFLICT_EXIT);
}

const server = app.listen(PORT, HOST, async () => {
  try {
    await ensureOpsblazeSkillsLayout();
  } catch (err) {
    logger.warn({ err }, "skills directory layout check failed");
  }
  logger.info({ port: PORT, host: HOST }, "OpsBlaze server running");
  const openWebUi = process.env.OPENWEBUI_BASE_URL?.trim();
  logger.info(
    openWebUi
      ? {
          provider: "openwebui",
          baseUrl: openWebUi,
          model: process.env.OPENWEBUI_MODEL || process.env.CLAUDE_MODEL || "(unset)",
        }
      : {
          provider: "claude",
          model: process.env.CLAUDE_MODEL || "claude-opus-4-6",
          effort: process.env.CLAUDE_EFFORT || "high",
        },
    openWebUi ? "Open WebUI LLM configured" : "Claude Agent SDK configured"
  );

  try {
    const { telemetry } = await import("./telemetry/index.js");
    await telemetry.initialize();
  } catch (err) {
    logger.debug({ err }, "telemetry initialization skipped");
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    const squatter = identifyPortSquatter(PORT);
    logger.fatal(
      { port: PORT, squatterPid: squatter?.pid, squatterCommand: squatter?.command },
      `Port ${PORT} became unavailable (race condition). ` +
        (squatter
          ? `In use by PID ${squatter.pid}: ${squatter.command}`
          : "Could not identify process.")
    );
    process.exit(PORT_CONFLICT_EXIT);
  }
  logger.fatal({ err }, "server error");
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) {
    logger.info({ signal }, "duplicate shutdown signal ignored");
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, "shutdown signal received");
  server.close();

  const telemetryDone = import("./telemetry/index.js")
    .then(({ telemetry }) => telemetry.shutdown())
    .catch(() => {});

  for (const conn of activeConnections) {
    conn.abort.abort();
  }
  void evictAllMcpSessions(logger);

  const drainTimeout = setTimeout(() => {
    logger.info("drain timeout reached, forcing exit");
    process.exit(0);
  }, 10_000);
  drainTimeout.unref();

  const check = setInterval(() => {
    if (activeConnections.size === 0) {
      clearInterval(check);
      clearTimeout(drainTimeout);
      telemetryDone.then(() => {
        logger.info("all connections drained, exiting");
        process.exit(0);
      });
    }
  }, 250);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception — shutting down");
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
});
