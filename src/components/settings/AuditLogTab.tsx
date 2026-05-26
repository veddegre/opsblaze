import React, { useCallback, useEffect, useState } from "react";
import { listAuditEvents, type AuditEvent } from "../../lib/playbooks-api";
import { Section } from "./settings-ui";

export function AuditLogTab() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <Section
        title="Audit log"
        description="Security-relevant actions on this server (auth, exports, admin changes)."
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[11px] text-gray-600">
            Stored in <span className="font-mono">data/audit.jsonl</span> on the server.
          </p>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="text-[10px] px-2 py-1 rounded border border-border-subtle text-gray-400 hover:text-gray-200"
          >
            Refresh
          </button>
        </div>
        {loading && events.length === 0 && (
          <p className="text-xs text-gray-500 py-4 text-center">Loading…</p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!loading && events.length === 0 && !error && (
          <p className="text-xs text-gray-500 py-4 text-center">No audit events yet.</p>
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
                {events.map((ev) => (
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
