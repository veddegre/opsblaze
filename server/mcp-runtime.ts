import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "pino";
import { listMcpServersRaw } from "./mcp-config.js";
import {
  resolveSplunkGuardrails,
  validateSplunkQuery,
  type SplunkGuardrailContext,
} from "./splunk-guardrails.js";
import { normalizeSplunkToolArgs, validateSplunkToolArgs } from "./openwebui-splunk-tools.js";
import type {
  HttpServerConfig,
  McpServerEntry,
  SseServerConfig,
  StdioServerConfig,
} from "./mcp-config.js";

export function qualifyToolName(serverName: string, toolName: string): string {
  return `${serverName}__${toolName}`;
}

export function parseQualifiedToolName(
  qualified: string
): { serverName: string; toolName: string } | null {
  const idx = qualified.indexOf("__");
  if (idx <= 0 || idx >= qualified.length - 2) return null;
  return {
    serverName: qualified.slice(0, idx),
    toolName: qualified.slice(idx + 2),
  };
}

function listAvailableToolNames(servers: readonly McpToolServerRef[]): string[] {
  const names: string[] = [];
  for (const s of servers) {
    for (const t of s.tools) {
      names.push(qualifyToolName(s.name, t.name));
    }
  }
  return names;
}

/**
 * Resolve Open WebUI / model tool names to a connected server + tool.
 * Models often emit bare `splunk_query` instead of `opsblaze-splunk__splunk_query`.
 */
export function resolveToolInvocation(
  nameFromModel: string,
  servers: readonly McpToolServerRef[]
): { serverName: string; toolName: string } | { error: string } {
  const trimmed = nameFromModel.trim();
  if (!trimmed) {
    return {
      error: "Tool name was empty — retry the question or check Open WebUI tool-calling support.",
    };
  }

  const parsed = parseQualifiedToolName(trimmed);
  if (parsed) {
    const server = servers.find((s) => s.name === parsed.serverName);
    if (!server) {
      return { error: `MCP server not connected: ${parsed.serverName}` };
    }
    if (!server.tools.some((t) => t.name === parsed.toolName)) {
      return {
        error: `Tool not found on server '${parsed.serverName}': ${parsed.toolName}`,
      };
    }
    return parsed;
  }

  const matches: Array<{ serverName: string; toolName: string }> = [];
  for (const s of servers) {
    if (s.tools.some((t) => t.name === trimmed)) {
      matches.push({ serverName: s.name, toolName: trimmed });
    }
  }
  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    const options = matches.map((m) => qualifyToolName(m.serverName, m.toolName)).join(", ");
    return { error: `Ambiguous tool name '${trimmed}' — use a qualified name: ${options}` };
  }

  const available = listAvailableToolNames(servers);
  const hint =
    available.length > 0
      ? ` Available tools: ${available.join(", ")}.`
      : " No MCP tools are connected.";
  return { error: `Tool not found: '${trimmed}'.${hint}` };
}

export interface OpenAiToolDef {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

interface ConnectedServer {
  name: string;
  client: Client;
  transport: Transport;
  tools: Tool[];
}

/** Minimal server shape for tool name resolution (tests and agent). */
export interface McpToolServerRef {
  name: string;
  tools: Array<{ name: string }>;
}

function createTransport(config: McpServerEntry): Transport {
  const type = config.type ?? "stdio";
  if (type === "stdio") {
    const stdio = config as StdioServerConfig;
    return new StdioClientTransport({
      command: stdio.command,
      args: stdio.args,
      env: stdio.env,
      stderr: "pipe",
    });
  }
  if (type === "http") {
    const http = config as HttpServerConfig;
    return new StreamableHTTPClientTransport(new URL(http.url), {
      requestInit: http.headers ? { headers: http.headers } : undefined,
    });
  }
  const sse = config as SseServerConfig;
  return new SSEClientTransport(new URL(sse.url), {
    requestInit: sse.headers ? { headers: sse.headers } : undefined,
  });
}

function toolToOpenAi(serverName: string, tool: Tool): OpenAiToolDef {
  const schema = tool.inputSchema as Record<string, unknown> | undefined;
  const parameters =
    schema && typeof schema === "object"
      ? schema
      : { type: "object", properties: {}, additionalProperties: true };

  return {
    type: "function",
    function: {
      name: qualifyToolName(serverName, tool.name),
      description: tool.description ?? tool.name,
      parameters,
    },
  };
}

/**
 * Manages MCP server connections for a single agent run.
 */
export class McpRuntime {
  private servers: ConnectedServer[] = [];

  /** Connected MCP servers (after {@link connect}). */
  get connectedServers(): readonly ConnectedServer[] {
    return this.servers;
  }

  async connect(log: Logger): Promise<OpenAiToolDef[]> {
    const entries = await listMcpServersRaw();
    const openAiTools: OpenAiToolDef[] = [];

    for (const { name, config } of entries) {
      if (!config.enabled) continue;

      const transport = createTransport(config);
      const client = new Client({ name: "opsblaze", version: "0.1.0" }, { capabilities: {} });

      try {
        await client.connect(transport);
        const listed = await client.listTools();
        const tools = listed.tools ?? [];
        this.servers.push({ name, client, transport, tools });
        for (const tool of tools) {
          openAiTools.push(toolToOpenAi(name, tool));
        }
        log.debug({ server: name, toolCount: tools.length }, "MCP server connected");
      } catch (err) {
        log.error({ err, server: name }, "failed to connect MCP server");
        try {
          await client.close();
        } catch {
          /* best-effort */
        }
        throw new Error(`MCP server '${name}' failed to connect: ${(err as Error).message}`);
      }
    }

    return openAiTools;
  }

  async callTool(
    qualifiedName: string,
    args: Record<string, unknown>,
    log: Logger,
    guardrailCtx?: SplunkGuardrailContext
  ): Promise<{ text: string; isError: boolean }> {
    const resolved = resolveToolInvocation(qualifiedName, this.servers);
    if ("error" in resolved) {
      return { text: resolved.error, isError: true };
    }

    const parsed = resolved;
    const server = this.servers.find((s) => s.name === parsed.serverName)!;
    let toolArgs = args;

    log.debug({ server: parsed.serverName, tool: parsed.toolName }, "calling MCP tool");

    if (parsed.toolName === "splunk_query" && parsed.serverName === "opsblaze-splunk") {
      toolArgs = normalizeSplunkToolArgs(toolArgs);
      const argError = validateSplunkToolArgs(toolArgs);
      if (argError) {
        return {
          text: JSON.stringify({
            summary: argError,
            chart: null,
            suppressed: true,
          }),
          isError: true,
        };
      }
      const spl = typeof toolArgs.spl === "string" ? toolArgs.spl : "";
      const earliest = typeof toolArgs.earliest === "string" ? toolArgs.earliest : "-24h";
      const latest = typeof toolArgs.latest === "string" ? toolArgs.latest : "now";
      const guardrails = await resolveSplunkGuardrails(guardrailCtx);
      const violation = validateSplunkQuery(guardrails, spl, earliest, latest);
      if (violation) {
        log.warn({ violation }, "splunk query blocked by guardrails");
        return {
          text: JSON.stringify({
            summary: `Query blocked by Splunk guardrails: ${violation}`,
            chart: null,
            suppressed: true,
          }),
          isError: true,
        };
      }
    }

    const result = await server.client.callTool({
      name: parsed.toolName,
      arguments: toolArgs,
    });

    const parts: string[] = [];
    let isError = Boolean(result.isError);

    const content = result.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>).type === "text" &&
          typeof (block as Record<string, unknown>).text === "string"
        ) {
          parts.push((block as Record<string, unknown>).text as string);
        }
      }
    } else if (typeof content === "string") {
      parts.push(content);
    }

    return { text: parts.join("\n") || "(empty tool result)", isError };
  }

  async close(): Promise<void> {
    for (const { client } of this.servers) {
      try {
        await client.close();
      } catch {
        /* best-effort */
      }
    }
    this.servers = [];
  }
}
