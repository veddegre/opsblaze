import React, { useCallback, useEffect, useMemo, useState } from "react";
import { listAuditEvents, type AuditEvent } from "../../lib/playbooks-api";
import { Section } from "./settings-ui";

const inputClass =
  "rounded border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-accent";

// Known audit actions (kept in sync with the server AuditAction union) so the
// dropdown stays complete even when the current result set is filtered down.
const ACTIONS = [
  "auth.login",
  "auth.login.failed",
  "auth.login.locked",
  "auth.logout",
  "export.preview",
  "export.download",
  "settings.update",
  "mcp.create",
  "mcp.update",
  "mcp.delete",
  "mcp.toggle",
  "skill.create",
  "skill.update",
  "skill.delete",
  "skill.toggle",
  "playbook.create",
  "playbook.update",
  "playbook.delete",
];

function rowHighlight(action: string): string {
  if (action === "auth.login.locked") return "bg-red-500/10";
  if (action === "auth.login.failed") return "bg-amber-500/10";
  return "";
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(events: AuditEvent[]): string {
  const header = ["time", "user", "action", "detail"];
  const rows = events.map((ev) =>
    [ev.ts, ev.userId, ev.action, ev.detail ? JSON.stringify(ev.detail) : ""].map(csvCell).join(",")
  );
  return [header.map(csvCell).join(","), ...rows].join("\r\n");
}

function downloadCsv(events: AuditEvent[]) {
  const blob = new Blob([toCsv(events)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AuditLogTab() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [debouncedUser, setDebouncedUser] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Debounce the free-text user filter so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedUser(userFilter), 300);
    return () => clearTimeout(t);
  }, [userFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined;
    listAuditEvents({
      limit: 200,
      action: actionFilter || undefined,
      user: debouncedUser || undefined,
      from,
      to,
    })
      .then((evs) => {
        if (!cancelled) setEvents(evs);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actionFilter, debouncedUser, fromDate, toDate, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  const hasFilters = Boolean(actionFilter || userFilter.trim() || fromDate || toDate);
  const securityCount = useMemo(
    () =>
      events.filter((e) => e.action === "auth.login.failed" || e.action === "auth.login.locked")
        .length,
    [events]
  );

  return (
    <div>
      <Section
        title="Audit log"
        description="Security-relevant actions on this server (auth, exports, admin changes). Filtering runs server-side across rotated archives."
      >
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-[10px] uppercase tracking-wide text-gray-600 mr-1">Quick</span>
          <button
            type="button"
            onClick={() => setActionFilter("auth.login.failed")}
            className={`text-[10px] px-2 py-1 rounded border ${
              actionFilter === "auth.login.failed"
                ? "border-amber-500/50 text-amber-300 bg-amber-500/10"
                : "border-border-subtle text-gray-400 hover:text-gray-200"
            }`}
          >
            Failed logins
          </button>
          <button
            type="button"
            onClick={() => setActionFilter("auth.login.locked")}
            className={`text-[10px] px-2 py-1 rounded border ${
              actionFilter === "auth.login.locked"
                ? "border-red-500/50 text-red-300 bg-red-500/10"
                : "border-border-subtle text-gray-400 hover:text-gray-200"
            }`}
          >
            Lockouts
          </button>
          <button
            type="button"
            onClick={() => setActionFilter("settings.update")}
            className={`text-[10px] px-2 py-1 rounded border ${
              actionFilter === "settings.update"
                ? "border-accent/50 text-accent-light bg-accent/10"
                : "border-border-subtle text-gray-400 hover:text-gray-200"
            }`}
          >
            Settings changes
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2 mb-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-600">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">All actions</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-600">User</label>
            <input
              type="text"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="contains…"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-600">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-600">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={inputClass}
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setActionFilter("");
                setUserFilter("");
                setFromDate("");
                setToDate("");
              }}
              className="text-[10px] px-2 py-1 rounded border border-border-subtle text-gray-400 hover:text-gray-200"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[11px] text-gray-600">
            {events.length} event{events.length === 1 ? "" : "s"}
            {securityCount > 0 && (
              <span className="text-amber-400/80">
                {" "}
                · {securityCount} auth alert{securityCount === 1 ? "" : "s"}
              </span>
            )}{" "}
            (max 200; stored in <span className="font-mono">data/audit.jsonl</span>).
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadCsv(events)}
              disabled={events.length === 0}
              className="text-[10px] px-2 py-1 rounded border border-border-subtle text-gray-400 hover:text-gray-200 disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="text-[10px] px-2 py-1 rounded border border-border-subtle text-gray-400 hover:text-gray-200"
            >
              Refresh
            </button>
          </div>
        </div>
        {loading && events.length === 0 && (
          <p className="text-xs text-gray-500 py-4 text-center">Loading…</p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!loading && events.length === 0 && !error && (
          <p className="text-xs text-gray-500 py-4 text-center">
            {hasFilters ? "No events match the filters." : "No audit events yet."}
          </p>
        )}
        {events.length > 0 && (
          <div className="max-h-[min(60vh,480px)] overflow-y-auto rounded-lg border border-border-subtle">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-surface-2 text-gray-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Time</th>
                  <th className="px-2 py-1.5 font-medium">User</th>
                  <th className="px-2 py-1.5 font-medium">Action</th>
                  <th className="px-2 py-1.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="text-gray-300 divide-y divide-border-subtle/60">
                {events.map((ev, i) => (
                  <tr
                    key={`${ev.ts}-${ev.action}-${ev.userId}-${i}`}
                    className={rowHighlight(ev.action)}
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">
                      {new Date(ev.ts).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px]">{ev.userId}</td>
                    <td className="px-2 py-1.5">{ev.action}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-gray-500 max-w-[200px] truncate">
                      {ev.detail ? JSON.stringify(ev.detail) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
