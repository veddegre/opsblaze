import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "pino";
import { listMcpServersRaw } from "./mcp-config.js";
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
      description: tool.description,
      parameters,
    },
  };
}

/**
 * Manages MCP server connections for a single agent run.
 */
export class McpRuntime {
  private servers: ConnectedServer[] = [];

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
    log: Logger
  ): Promise<{ text: string; isError: boolean }> {
    const parsed = parseQualifiedToolName(qualifiedName);
    if (!parsed) {
      return { text: `Unknown tool: ${qualifiedName}`, isError: true };
    }

    const server = this.servers.find((s) => s.name === parsed.serverName);
    if (!server) {
      return { text: `MCP server not connected: ${parsed.serverName}`, isError: true };
    }

    const tool = server.tools.find((t) => t.name === parsed.toolName);
    if (!tool) {
      return { text: `Tool not found: ${parsed.toolName}`, isError: true };
    }

    log.debug({ server: parsed.serverName, tool: parsed.toolName }, "calling MCP tool");

    const result = await server.client.callTool({
      name: parsed.toolName,
      arguments: args,
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
