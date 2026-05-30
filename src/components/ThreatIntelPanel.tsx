import React from "react";
import type { ThreatIntelResult } from "../types";

const PROVIDER_LABEL: Record<string, string> = {
  virustotal: "VirusTotal",
  abuseipdb: "AbuseIPDB",
};

/**
 * Renders persisted threat-intel enrichment (from the `enrich_ips` tool) as a
 * structured panel grouped by IP. Because this is a message block it is saved
 * with the conversation and restored on reload, so the verdicts that informed
 * an investigation stay attached to the report.
 */
export function ThreatIntelPanel({ results }: { results: ThreatIntelResult[] }) {
  if (results.length === 0) return null;

  const byIp = new Map<string, ThreatIntelResult[]>();
  for (const r of results) {
    const list = byIp.get(r.ip);
    if (list) list.push(r);
    else byIp.set(r.ip, [r]);
  }

  return (
    <div className="my-4 rounded-lg border border-border-subtle bg-surface-2/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-2">
        <span className="text-xs font-medium text-gray-200">Threat intelligence</span>
        <span className="text-[10px] text-gray-500">
          {byIp.size} IP{byIp.size === 1 ? "" : "s"} checked
        </span>
      </div>
      <div className="divide-y divide-border-subtle/60">
        {Array.from(byIp.entries()).map(([ip, rows]) => (
          <div key={ip} className="px-3 py-2">
            <div className="font-mono text-xs text-gray-200 mb-1">{ip}</div>
            <div className="space-y-1">
              {rows.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center px-1.5 py-0.5 rounded border font-medium ${
                      r.ok
                        ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                        : "bg-red-500/15 text-red-300 border-red-500/30"
                    }`}
                  >
                    {PROVIDER_LABEL[r.provider] ?? r.provider}
                  </span>
                  <span className="text-gray-400 flex-1 min-w-0 break-words">
                    {r.summary}
                    {r.link && (
                      <>
                        {" "}
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-light hover:text-accent underline"
                        >
                          report
                        </a>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
