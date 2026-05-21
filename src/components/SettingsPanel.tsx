import React, { useEffect, useState, useCallback } from "react";
import {
  listMcpServers,
  addMcpServer,
  updateMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  testMcpServer,
  listSkillsApi,
  toggleSkillApi,
  deleteSkillApi,
  getConfigPaths,
} from "../lib/settings-api";
import type {
  McpServerInfo,
  McpServerConfig,
  ProbeResult,
  ToolInfo,
  SkillInfo,
  ConfigPaths,
} from "../lib/settings-api";
import type { PublicAuthUser } from "../lib/auth";
import { AccountTab } from "./settings/AccountTab";
import { PreferencesTab } from "./settings/PreferencesTab";
import { AdminSystemTab } from "./settings/AdminSystemTab";
import { NavGroupLabel, NavItem, Section } from "./settings/settings-ui";
import { inputClass, monoInputClass } from "./settings/settings-ui";

export type SettingsSection =
  | "account"
  | "preferences"
  | "admin-system"
  | "admin-mcp"
  | "admin-skills";

const SECTION_LABELS: Record<SettingsSection, string> = {
  account: "My account",
  preferences: "Runtime settings",
  "admin-system": "System health",
  "admin-mcp": "MCP servers",
  "admin-skills": "Skills",
};

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  user: PublicAuthUser;
  initialSection?: SettingsSection;
}

// --- Shared small components ---

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    stdio: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    http: "bg-green-500/20 text-green-300 border-green-500/30",
    sse: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase ${colors[type] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}
    >
      {type}
    </span>
  );
}

function BuiltInBadge() {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-accent/15 text-accent-light border-accent/30 font-medium">
      built-in
    </span>
  );
}

function StatusDot({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${enabled ? "bg-green-400" : "bg-gray-600"}`}
    />
  );
}

function ToolList({ tools }: { tools: ToolInfo[] }) {
  if (tools.length === 0) return <p className="text-xs text-gray-600 italic">No tools</p>;
  return (
    <div className="space-y-1">
      {tools.map((t) => (
        <div key={t.name} className="flex items-start gap-2">
          <span className="text-xs font-mono text-accent-light shrink-0">{t.name}</span>
          {t.description && (
            <span className="text-xs text-gray-500 line-clamp-1">{t.description}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function PathHint({ label, path }: { label: string; path: string | null }) {
  if (!path) return null;
  return (
    <div className="px-4 py-3 border-t border-border-subtle">
      <p className="text-[11px] text-gray-600">
        {label} <span className="font-mono break-all">{path}</span>
      </p>
    </div>
  );
}

// --- Key-Value Editor ---

interface KVEntry {
  key: string;
  value: string;
}

function KeyValueEditor({
  entries,
  onChange,
  keyPlaceholder = "KEY",
  valuePlaceholder = "value",
  addLabel = "+ Add",
}: {
  entries: KVEntry[];
  onChange: (entries: KVEntry[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}) {
  const update = (idx: number, field: "key" | "value", val: string) => {
    const next = entries.map((e, i) => (i === idx ? { ...e, [field]: val } : e));
    onChange(next);
  };

  const remove = (idx: number) => onChange(entries.filter((_, i) => i !== idx));

  const add = () => onChange([...entries, { key: "", value: "" }]);

  return (
    <div className="space-y-1.5">
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-1.5 items-center">
          <input
            value={entry.key}
            onChange={(e) => update(i, "key", e.target.value)}
            placeholder={keyPlaceholder}
            className={`flex-1 text-xs bg-surface-0 border border-border-subtle rounded px-2 py-1 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent/50 font-mono`}
          />
          <input
            value={entry.value}
            onChange={(e) => update(i, "value", e.target.value)}
            onFocus={(e) => {
              if (e.target.value === "••••••") {
                update(i, "value", "");
              }
            }}
            placeholder={valuePlaceholder}
            className={`flex-1 text-xs bg-surface-0 border border-border-subtle rounded px-2 py-1 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent/50 font-mono`}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-gray-600 hover:text-red-400 transition-colors px-1"
            aria-label="Remove entry"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-[11px] text-accent hover:text-accent-light transition-colors"
      >
        {addLabel}
      </button>
    </div>
  );
}

function kvToRecord(entries: KVEntry[]): Record<string, string> | undefined {
  const filtered = entries.filter((e) => e.key.trim());
  if (filtered.length === 0) return undefined;
  const rec: Record<string, string> = {};
  for (const { key, value } of filtered) rec[key.trim()] = value;
  return rec;
}

function recordToKv(rec: Record<string, string> | undefined): KVEntry[] {
  if (!rec) return [];
  return Object.entries(rec).map(([key, value]) => ({ key, value }));
}

// --- MCP Server row ---

function McpServerRow({
  server,
  onToggle,
  onDelete,
  onEdit,
}: {
  server: McpServerInfo;
  onToggle: (name: string, enabled: boolean) => void;
  onDelete: (name: string) => void;
  onEdit: (name: string, config: McpServerConfig) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleTest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTesting(true);
    setProbeResult(null);
    try {
      const result = await testMcpServer(server.name);
      setProbeResult(result);
      if (!expanded) setExpanded(true);
    } catch {
      setProbeResult({ status: "failed", tools: [], error: "Request failed" });
    } finally {
      setTesting(false);
    }
  };

  const type = server.config.type ?? "stdio";

  return (
    <div className="border-b border-border-subtle">
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-surface-3 transition-colors"
      >
        <StatusDot enabled={server.config.enabled} />
        <span className="text-sm text-gray-200 font-medium flex-1 truncate">{server.name}</span>
        <TypeBadge type={type} />
        {server.builtIn && <BuiltInBadge />}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {editing && !server.builtIn ? (
            <EditServerForm
              server={server}
              onSave={async (config) => {
                await onEdit(server.name, config);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <div className="text-xs space-y-1 bg-surface-0 rounded-md p-2.5">
                {type === "stdio" && (
                  <>
                    <div>
                      <span className="text-gray-500">Command: </span>
                      <span className="text-gray-300 font-mono">
                        {server.config.command} {server.config.args?.join(" ")}
                      </span>
                    </div>
                    {server.config.env && Object.keys(server.config.env).length > 0 && (
                      <div>
                        <span className="text-gray-500">Env: </span>
                        <span className="text-gray-400">
                          {Object.keys(server.config.env).join(", ")}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {(type === "http" || type === "sse") && (
                  <>
                    <div>
                      <span className="text-gray-500">URL: </span>
                      <span className="text-gray-300 font-mono break-all">{server.config.url}</span>
                    </div>
                    {server.config.headers && Object.keys(server.config.headers).length > 0 && (
                      <div>
                        <span className="text-gray-500">Headers: </span>
                        <span className="text-gray-400">
                          {Object.keys(server.config.headers).join(", ")}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {probeResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-medium ${probeResult.status === "connected" ? "text-green-400" : "text-red-400"}`}
                    >
                      {probeResult.status === "connected" ? "Connected" : "Failed"}
                    </span>
                    {probeResult.serverInfo && (
                      <span className="text-xs text-gray-500">
                        {probeResult.serverInfo.name} v{probeResult.serverInfo.version}
                      </span>
                    )}
                  </div>
                  {probeResult.error && (
                    <p className="text-xs text-red-400/80">{probeResult.error}</p>
                  )}
                  {probeResult.tools.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">
                        {probeResult.tools.length} tool{probeResult.tools.length !== 1 ? "s" : ""}:
                      </p>
                      <ToolList tools={probeResult.tools} />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="text-xs px-2.5 py-1 rounded border border-border-subtle text-gray-300 hover:bg-surface-3 hover:text-gray-100 transition-colors disabled:opacity-50"
                >
                  {testing ? "Testing..." : "Test Connection"}
                </button>
                {!server.builtIn && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(true);
                      }}
                      className="text-xs px-2.5 py-1 rounded border border-border-subtle text-gray-300 hover:bg-surface-3 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(server.name, !server.config.enabled);
                      }}
                      className="text-xs px-2.5 py-1 rounded border border-border-subtle text-gray-300 hover:bg-surface-3 transition-colors"
                    >
                      {server.config.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(server.name);
                      }}
                      className="text-xs px-2.5 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- Edit Server Form ---

function EditServerForm({
  server,
  onSave,
  onCancel,
}: {
  server: McpServerInfo;
  onSave: (config: McpServerConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const type = server.config.type ?? "stdio";
  const [command, setCommand] = useState(server.config.command ?? "");
  const [args, setArgs] = useState(server.config.args?.join(" ") ?? "");
  const [url, setUrl] = useState(server.config.url ?? "");
  const [envVars, setEnvVars] = useState<KVEntry[]>(recordToKv(server.config.env));
  const [hdrs, setHdrs] = useState<KVEntry[]>(recordToKv(server.config.headers));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const config: McpServerConfig = { type, enabled: server.config.enabled };
      if (type === "stdio") {
        config.command = command;
        config.args = args
          .split(/\s+/)
          .map((a) => a.trim())
          .filter(Boolean);
        const env = kvToRecord(envVars);
        if (env) config.env = env;
      } else {
        config.url = url;
        const h = kvToRecord(hdrs);
        if (h) config.headers = h;
      }
      await onSave(config);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {type === "stdio" ? (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Command</label>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className={monoInputClass}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Arguments (space-separated)</label>
            <input
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              className={monoInputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Environment Variables</label>
            <KeyValueEditor
              entries={envVars}
              onChange={setEnvVars}
              keyPlaceholder="VARIABLE_NAME"
              valuePlaceholder="value"
              addLabel="+ Add Variable"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
              className={monoInputClass}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Headers</label>
            <KeyValueEditor
              entries={hdrs}
              onChange={setHdrs}
              keyPlaceholder="Header-Name"
              valuePlaceholder="value"
              addLabel="+ Add Header"
            />
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="text-xs px-3 py-1.5 rounded bg-accent/20 border border-accent/30 text-accent-light hover:bg-accent/30 transition-colors disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded border border-border-subtle text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// --- Add Server Form ---

function AddServerForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, config: McpServerConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"stdio" | "http" | "sse">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [envVars, setEnvVars] = useState<KVEntry[]>([]);
  const [hdrs, setHdrs] = useState<KVEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const config: McpServerConfig = { enabled: true };
      if (type === "stdio") {
        config.type = "stdio";
        config.command = command;
        config.args = args
          .split(/\s+/)
          .map((a) => a.trim())
          .filter(Boolean);
        const env = kvToRecord(envVars);
        if (env) config.env = env;
      } else {
        config.type = type;
        config.url = url;
        const h = kvToRecord(hdrs);
        if (h) config.headers = h;
      }
      await onAdd(name, config);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-3 space-y-3 border-b border-border-subtle bg-surface-0/50"
    >
      <div>
        <label className="block text-xs text-gray-500 mb-1">Server Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-server"
          className={inputClass}
          required
          pattern="[a-zA-Z0-9_-]+"
          title="Alphanumeric, hyphens, underscores"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Transport</label>
        <div className="flex gap-2">
          {(["stdio", "http", "sse"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                type === t
                  ? "border-accent/50 bg-accent/10 text-accent-light"
                  : "border-border-subtle text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {type === "stdio" ? (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Command</label>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx"
              className={monoInputClass}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Arguments (space-separated)</label>
            <input
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="-y @my/mcp-server"
              className={monoInputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Environment Variables (optional)
            </label>
            <KeyValueEditor
              entries={envVars}
              onChange={setEnvVars}
              keyPlaceholder="VARIABLE_NAME"
              valuePlaceholder="value"
              addLabel="+ Add Variable"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/server"
              type="url"
              className={monoInputClass}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Headers (optional)</label>
            <KeyValueEditor
              entries={hdrs}
              onChange={setHdrs}
              keyPlaceholder="Header-Name"
              valuePlaceholder="Bearer token..."
              addLabel="+ Add Header"
            />
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="text-xs px-3 py-1.5 rounded bg-accent/20 border border-accent/30 text-accent-light hover:bg-accent/30 transition-colors disabled:opacity-50"
        >
          {submitting ? "Adding..." : "Add Server"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded border border-border-subtle text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// --- MCP Servers Tab ---

function McpServersTab({ configPath }: { configPath: string | null }) {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setServers(await listMcpServers());
    } catch (err) {
      setError((err as Error).message || "Failed to load servers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      await toggleMcpServer(name, enabled);
      await refresh();
    } catch (err) {
      setError(`Toggle failed: ${(err as Error).message}`);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteMcpServer(name);
      await refresh();
    } catch (err) {
      setError(`Delete failed: ${(err as Error).message}`);
    }
  };

  const handleEdit = async (name: string, config: McpServerConfig) => {
    try {
      await updateMcpServer(name, config);
      await refresh();
    } catch (err) {
      setError(`Edit failed: ${(err as Error).message}`);
    }
  };

  const handleAdd = async (name: string, config: McpServerConfig) => {
    await addMcpServer(name, config);
    setShowAdd(false);
    await refresh();
  };

  return (
    <div>
      <Section
        title="MCP servers"
        description="Tool servers the agent can call during investigations (Splunk, charts, etc.)."
      >
        <div className="flex items-center justify-between -mt-1">
          <span className="text-xs text-gray-500">
            {servers.length} server{servers.length !== 1 ? "s" : ""} configured
          </span>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="text-xs text-accent hover:text-accent-light px-2 py-1 rounded hover:bg-surface-3 transition-colors"
          >
            {showAdd ? "Cancel" : "+ Add server"}
          </button>
        </div>
      </Section>

      {showAdd && <AddServerForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded">
          {error}
        </div>
      )}

      {loading && servers.length === 0 && (
        <div className="px-4 py-8 text-center text-gray-600 text-sm">Loading...</div>
      )}

      {!loading && servers.length === 0 && !error && (
        <div className="px-4 py-8 text-center text-gray-600 text-sm">No MCP servers configured</div>
      )}

      {servers.map((s) => (
        <McpServerRow
          key={s.name}
          server={s}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onEdit={handleEdit}
        />
      ))}

      <PathHint label="Config file:" path={configPath} />
    </div>
  );
}

// --- Skills Tab ---

function SkillsTab({ skillsDir }: { skillsDir: string | null }) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSkills(await listSkillsApi());
    } catch (err) {
      setError((err as Error).message || "Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      await toggleSkillApi(name, enabled);
      await refresh();
    } catch (err) {
      setError(`Toggle failed: ${(err as Error).message}`);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteSkillApi(name);
      await refresh();
    } catch (err) {
      setError(`Delete failed: ${(err as Error).message}`);
    }
  };

  return (
    <div>
      <Section
        title="Investigation skills"
        description="Optional playbooks users can attach to a question for focused analysis."
      >
        <p className="text-xs text-gray-500 -mt-1">
          {skills.filter((s) => s.enabled).length} of {skills.length} skill
          {skills.length !== 1 ? "s" : ""} active
        </p>
      </Section>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded">
          {error}
        </div>
      )}

      {loading && skills.length === 0 && (
        <div className="px-4 py-8 text-center text-gray-600 text-sm">Loading...</div>
      )}

      {!loading && skills.length === 0 && !error && (
        <div className="px-4 py-8 text-center text-gray-600 text-sm">
          <p>No skills found</p>
          <p className="mt-1 text-gray-700 text-xs">
            Add skills to <span className="font-mono">.claude/skills/</span>
          </p>
        </div>
      )}

      {skills.map((skill) => (
        <SkillRow key={skill.name} skill={skill} onToggle={handleToggle} onDelete={handleDelete} />
      ))}

      <PathHint label="Add skills to:" path={skillsDir} />
    </div>
  );
}

function SkillRow({
  skill,
  onToggle,
  onDelete,
}: {
  skill: SkillInfo;
  onToggle: (name: string, enabled: boolean) => void;
  onDelete: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="border-b border-border-subtle">
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-3 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 font-medium">{skill.name}</p>
          {skill.description && !expanded && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{skill.description}</p>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(skill.name, !skill.enabled);
          }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
            skill.enabled ? "bg-accent" : "bg-gray-700"
          }`}
          aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              skill.enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {skill.description && (
            <p className="text-xs text-gray-400 leading-relaxed">{skill.description}</p>
          )}

          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Remove skill file from disk?</span>
              <button
                onClick={() => {
                  onDelete(skill.name);
                  setConfirmDelete(false);
                }}
                className="text-xs px-2.5 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2.5 py-1 rounded border border-border-subtle text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs px-2.5 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Panel ---

function renderSection(
  section: SettingsSection,
  user: PublicAuthUser,
  paths: ConfigPaths | null
): React.ReactNode {
  switch (section) {
    case "account":
      return <AccountTab user={user} />;
    case "preferences":
      return <PreferencesTab isAdmin={user.isAdmin} />;
    case "admin-system":
      return <AdminSystemTab />;
    case "admin-mcp":
      return <McpServersTab configPath={paths?.mcpConfig ?? null} />;
    case "admin-skills":
      return <SkillsTab skillsDir={paths?.skillsDir ?? null} />;
    default:
      return null;
  }
}

export function SettingsPanel({
  isOpen,
  onClose,
  user,
  initialSection = "account",
}: SettingsPanelProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [paths, setPaths] = useState<ConfigPaths | null>(null);
  const isAdmin = user.isAdmin;

  useEffect(() => {
    if (!isOpen) return;
    setSection(initialSection);
  }, [isOpen, initialSection]);

  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    getConfigPaths()
      .then(setPaths)
      .catch(() => {});
  }, [isOpen, isAdmin]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isAdmin && section.startsWith("admin-")) {
      setSection("account");
    }
  }, [isAdmin, section]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 top-[49px] bg-black/40 z-20 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-[49px] right-0 bottom-0 w-full max-w-[min(100%,32rem)] bg-surface-1 border-l border-border-subtle z-30 transform transition-transform duration-200 ease-out flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border-subtle shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Settings</h2>
            <p className="text-xs text-gray-500 mt-0.5">Account, preferences, and administration</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-colors"
            aria-label="Close settings"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav
            className="w-[148px] shrink-0 border-r border-border-subtle py-2 overflow-y-auto"
            aria-label="Settings sections"
          >
            <NavGroupLabel>Personal</NavGroupLabel>
            <NavItem active={section === "account"} onClick={() => setSection("account")}>
              My account
            </NavItem>
            <NavItem
              active={section === "preferences"}
              onClick={() => setSection("preferences")}
            >
              Runtime settings
            </NavItem>

            {isAdmin && (
              <>
                <NavGroupLabel>Administration</NavGroupLabel>
                <NavItem
                  active={section === "admin-system"}
                  onClick={() => setSection("admin-system")}
                  indent
                >
                  System health
                </NavItem>
                <NavItem
                  active={section === "admin-mcp"}
                  onClick={() => setSection("admin-mcp")}
                  indent
                >
                  MCP servers
                </NavItem>
                <NavItem
                  active={section === "admin-skills"}
                  onClick={() => setSection("admin-skills")}
                  indent
                >
                  Skills
                </NavItem>
              </>
            )}
          </nav>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-border-subtle shrink-0 md:hidden">
              <p className="text-sm font-medium text-gray-200">{SECTION_LABELS[section]}</p>
            </div>
            <div className="flex-1 overflow-y-auto">{renderSection(section, user, paths)}</div>
          </div>
        </div>
      </div>
    </>
  );
}
