import React, { useEffect, useState } from "react";
import { fetchHealth, fetchAuditEvents } from "../../lib/api";
import type { HealthResponse, AuditEvent } from "../../lib/api";
import { getSettings } from "../../lib/settings-api";
import type { AppSettings } from "../../lib/settings-api";
import { InfoBanner, Section, StatusRow } from "./settings-ui";

const AUDIT_CATEGORY_STYLES: Record<string, string> = {
  auth: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  settings: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  mcp: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  skill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  playbook: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  export: "bg-pink-500/15 text-pink-300 border-pink-500/30",
};

function ActionBadge({ action }: { action: string }) {
  const category = action.split(".")[0] ?? "";
  const style =
    AUDIT_CATEGORY_STYLES[category] ?? "bg-surface-3 text-gray-400 border-border-subtle";
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${style}`}
    >
      {action}
    </span>
  );
}

function formatDetail(detail?: Record<string, unknown>): string {
  if (!detail || Object.keys(detail).length === 0) return "";
  return Object.entries(detail)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("  ");
}

function AuditLogSection() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAuditEvents(200)
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load audit log"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Section
      title="Audit log"
      description="Recent authentication, export, and administrative actions (most recent first). Stored on the server in data/audit.jsonl."
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {events ? `${events.length} event${events.length === 1 ? "" : "s"}` : ""}
        </span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs text-accent-light hover:text-accent disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <InfoBanner>{error}</InfoBanner>}

      {events && events.length === 0 && !error && (
        <p className="text-xs text-gray-500">No audit events recorded yet.</p>
      )}

      {events && events.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-border-subtle">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Time</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-b border-border-subtle/50 last:border-b-0">
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap align-top">
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-gray-300 align-top break-all">{e.userId}</td>
                  <td className="px-3 py-2 align-top">
                    <ActionBadge action={e.action} />
                  </td>
                  <td className="px-3 py-2 text-gray-500 align-top break-all font-mono">
                    {formatDetail(e.detail)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export function AdminSystemTab() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {});
    fetchHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  const splunkCheck = health?.checks?.splunk;
  const llmCheck = health?.checks?.openwebui ?? health?.checks?.claude;
  const useOpenWebUi = settings?.system?.llmProvider === "openwebui";
  const llmLabel = useOpenWebUi ? "Open WebUI" : "Claude";

  if (!settings?.system) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-gray-400">
          System configuration details are only visible to administrators.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Section
        title="Service health"
        description="Live status of connections OpsBlaze uses to run investigations."
      >
        <StatusRow
          label="Splunk"
          detail={
            settings
              ? `${settings.system.splunkScheme}://${settings.system.splunkHost}:${settings.system.splunkPort}`
              : undefined
          }
          status={splunkCheck?.status ?? "error"}
          trailing={splunkCheck?.message ?? settings?.system.splunkAuthMethod}
        />
        <StatusRow
          label={llmLabel}
          status={llmCheck?.status ?? "error"}
          trailing={llmCheck?.message ?? settings?.system.claudeAuthMethod}
        />
        <StatusRow
          label="OpsBlaze server"
          detail={
            settings
              ? `Listening on ${settings.system.bindAddress}:${settings.system.serverPort}`
              : undefined
          }
          status="ok"
          trailing={settings?.system.serverMode}
        />
      </Section>

      <Section
        title="Environment configuration"
        description="Infrastructure settings are edited on the server, not in the browser."
      >
        <InfoBanner variant="tip">
          To change Splunk host, credentials, or LLM backend, update the{" "}
          <span className="font-mono">.env</span> file on the server host, then run{" "}
          <span className="font-mono">node bin/opsblaze.cjs restart</span>.
        </InfoBanner>
        {useOpenWebUi ? (
          <InfoBanner variant="tip">
            The active Open WebUI model is selected under{" "}
            <span className="text-gray-300">Settings → Runtime settings</span>. Connection URL and
            API key remain in <span className="font-mono">.env</span>.
          </InfoBanner>
        ) : (
          <InfoBanner>
            To use Open WebUI instead of Claude, set{" "}
            <span className="font-mono">OPENWEBUI_BASE_URL</span> and{" "}
            <span className="font-mono">OPENWEBUI_API_KEY</span> in{" "}
            <span className="font-mono">.env</span>.
          </InfoBanner>
        )}
      </Section>

      <AuditLogSection />
    </div>
  );
}
