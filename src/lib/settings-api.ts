function headers(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

function fetchInit(init?: RequestInit): RequestInit {
  return { credentials: "include", ...init };
}

// --- App settings types ---

export interface RedactionBuiltinFlags {
  email?: boolean;
  ipv4?: boolean;
  mac?: boolean;
}

export interface RedactionSettings {
  applyOnExport?: boolean;
  builtin?: RedactionBuiltinFlags;
  customStrings?: string[];
  customPatterns?: string[];
}

export interface AppSettings {
  runtime: {
    claudeModel: string;
    claudeEffort: string;
    maxTurns: number;
    streamTimeoutMs: number;
    llmProvider?: "openwebui" | "claude";
    redaction?: RedactionSettings;
  };
  system?: {
    llmProvider: "openwebui" | "claude";
    splunkHost: string;
    splunkPort: number;
    splunkScheme: string;
    splunkAuthMethod: string;
    serverPort: number;
    bindAddress: string;
    claudeAuthMethod: string;
    serverMode: string;
  };
}

// --- App settings API ---

export async function getSettings(): Promise<AppSettings> {
  const res = await fetch("/api/settings", fetchInit({ headers: headers() }));
  if (!res.ok) throw new Error(`Failed to get settings: ${res.status}`);
  return res.json();
}

export interface OpenWebUiModelOption {
  id: string;
  label: string;
}

export async function fetchOpenWebUiModels(): Promise<OpenWebUiModelOption[]> {
  const res = await fetch("/api/openwebui/models", fetchInit({ headers: headers() }));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `Failed to load Open WebUI models: ${res.status}`
    );
  }
  const data = (await res.json()) as { models: OpenWebUiModelOption[] };
  return data.models ?? [];
}

export async function updateSettings(
  partial: Record<string, unknown>
): Promise<{ runtime: AppSettings["runtime"] }> {
  const res = await fetch(
    "/api/settings",
    fetchInit({
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(partial),
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to update settings: ${res.status}`);
  }
  return res.json();
}

// --- Config paths ---

export interface ConfigPaths {
  mcpConfig: string;
  skillsDir: string;
}

export async function getConfigPaths(): Promise<ConfigPaths> {
  const res = await fetch("/api/config-paths", fetchInit({ headers: headers() }));
  if (!res.ok) throw new Error(`Failed to get config paths: ${res.status}`);
  return res.json();
}

// --- MCP Server types ---

export interface McpServerConfig {
  type?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export interface McpServerInfo {
  name: string;
  config: McpServerConfig;
  builtIn: boolean;
}

export interface ToolInfo {
  name: string;
  description?: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface ProbeResult {
  status: "connected" | "failed";
  serverInfo?: { name: string; version: string };
  tools: ToolInfo[];
  error?: string;
}

// --- Skills types ---

export interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
  path: string;
}

// --- MCP Server API ---

export async function listMcpServers(): Promise<McpServerInfo[]> {
  const res = await fetch("/api/mcp-servers", fetchInit({ headers: headers() }));
  if (!res.ok) throw new Error(`Failed to list MCP servers: ${res.status}`);
  return res.json();
}

export async function addMcpServer(name: string, config: McpServerConfig): Promise<void> {
  const res = await fetch(
    "/api/mcp-servers",
    fetchInit({
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name, config }),
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to add MCP server: ${res.status}`);
  }
}

export async function updateMcpServer(name: string, config: McpServerConfig): Promise<void> {
  const res = await fetch(
    `/api/mcp-servers/${encodeURIComponent(name)}`,
    fetchInit({
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(config),
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to update MCP server: ${res.status}`);
  }
}

export async function deleteMcpServer(name: string): Promise<void> {
  const res = await fetch(
    `/api/mcp-servers/${encodeURIComponent(name)}`,
    fetchInit({ method: "DELETE", headers: headers() })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to delete MCP server: ${res.status}`);
  }
}

export async function toggleMcpServer(name: string, enabled: boolean): Promise<void> {
  const res = await fetch(
    `/api/mcp-servers/${encodeURIComponent(name)}/toggle`,
    fetchInit({
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ enabled }),
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to toggle MCP server: ${res.status}`);
  }
}

export async function testMcpServer(name: string): Promise<ProbeResult> {
  const res = await fetch(
    `/api/mcp-servers/${encodeURIComponent(name)}/test`,
    fetchInit({ method: "POST", headers: headers() })
  );
  if (!res.ok) throw new Error(`Failed to test MCP server: ${res.status}`);
  return res.json();
}

// --- Skill Distillation types ---

export interface SkillDraft {
  name: string;
  description: string;
  content: string;
}

// --- Skills API ---

export async function listSkillsApi(): Promise<SkillInfo[]> {
  const res = await fetch("/api/skills", fetchInit({ headers: headers() }));
  if (!res.ok) throw new Error(`Failed to list skills: ${res.status}`);
  return res.json();
}

export async function toggleSkillApi(name: string, enabled: boolean): Promise<void> {
  const res = await fetch(
    `/api/skills/${encodeURIComponent(name)}/toggle`,
    fetchInit({
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ enabled }),
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to toggle skill: ${res.status}`);
  }
}

export async function deleteSkillApi(name: string): Promise<void> {
  const res = await fetch(
    `/api/skills/${encodeURIComponent(name)}`,
    fetchInit({ method: "DELETE", headers: headers() })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to delete skill: ${res.status}`);
  }
}

export async function createSkillApi(name: string, content: string): Promise<void> {
  const res = await fetch(
    "/api/skills",
    fetchInit({
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name, content }),
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to create skill: ${res.status}`);
  }
}

export async function extractSkillApi(
  conversationId: string,
  signal?: AbortSignal
): Promise<SkillDraft> {
  const res = await fetch(
    "/api/skills/extract",
    fetchInit({
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ conversationId }),
      signal,
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Skill extraction failed: ${res.status}`);
  }
  return res.json();
}

export async function refineSkillApi(
  draft: string,
  instruction: string,
  conversationSummary: string,
  signal?: AbortSignal
): Promise<SkillDraft> {
  const res = await fetch(
    "/api/skills/refine",
    fetchInit({
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ draft, instruction, conversationSummary }),
      signal,
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Skill refinement failed: ${res.status}`);
  }
  return res.json();
}
