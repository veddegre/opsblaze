import React, { useCallback, useEffect, useMemo, useState } from "react";
import { listAuditEvents, type AuditEvent } from "../../lib/playbooks-api";
import { Section } from "./settings-ui";

const inputClass =
  "rounded border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-accent";

function csvCell(value: string): string {
  // Quote everything and escape embedded quotes so commas/newlines are safe.
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

  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await listAuditEvents(200));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const actions = useMemo(() => Array.from(new Set(events.map((e) => e.action))).sort(), [events]);

  const filtered = useMemo(() => {
    const user = userFilter.trim().toLowerCase();
    // Inclusive day bounds: fromDate at 00:00, toDate at end-of-day.
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    return events.filter((e) => {
      if (actionFilter && e.action !== actionFilter) return false;
      if (user && !e.userId.toLowerCase().includes(user)) return false;
      const t = new Date(e.ts).getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      return true;
    });
  }, [events, actionFilter, userFilter, fromDate, toDate]);

  const hasFilters = Boolean(actionFilter || userFilter.trim() || fromDate || toDate);

  return (
    <div>
      <Section
        title="Audit log"
        description="Security-relevant actions on this server (auth, exports, admin changes)."
      >
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-600">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">All actions</option>
              {actions.map((a) => (
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
            Showing {filtered.length} of {events.length} (stored in{" "}
            <span className="font-mono">data/audit.jsonl</span>).
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadCsv(filtered)}
              disabled={filtered.length === 0}
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
          <p className="text-xs text-gray-500 py-4 text-center">No audit events yet.</p>
        )}
        {events.length > 0 && filtered.length === 0 && (
          <p className="text-xs text-gray-500 py-4 text-center">No events match the filters.</p>
        )}
        {filtered.length > 0 && (
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
                {filtered.map((ev) => (
                  <tr key={`${ev.ts}-${ev.action}-${ev.userId}`}>
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
