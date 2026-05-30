import React, { useEffect, useState } from "react";
import { classifyIpZones } from "../lib/api";
import type { IpZoneClassification } from "../lib/api";

const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const MAX_IPS = 100;

function extractIps(text: string): string[] {
  const found = text.match(IPV4_RE) ?? [];
  return Array.from(new Set(found)).slice(0, MAX_IPS);
}

const POSTURE_STYLES: Record<string, string> = {
  trusted: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  neutral: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  sensitive: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

/**
 * Surfaces organization IP-zone context inline beneath an assistant message:
 * any IPv4 addresses that fall inside a configured zone are shown with their
 * zone name and default risk posture, so analysts see *why* a source is
 * lower/higher risk without re-running classification by hand.
 */
export function IpContextStrip({ text }: { text: string }) {
  const [orgIps, setOrgIps] = useState<IpZoneClassification[]>([]);
  const [externalCount, setExternalCount] = useState(0);

  const ips = React.useMemo(() => extractIps(text), [text]);
  const ipsKey = ips.join(",");

  useEffect(() => {
    if (ips.length === 0) {
      setOrgIps([]);
      setExternalCount(0);
      return;
    }
    let cancelled = false;
    classifyIpZones(ips)
      .then((resp) => {
        if (cancelled) return;
        if (resp.zonesConfigured.length === 0) {
          setOrgIps([]);
          setExternalCount(0);
          return;
        }
        setOrgIps(resp.results.filter((r) => r.inOrganizationRange));
        setExternalCount(resp.results.filter((r) => r.isPublic && !r.inOrganizationRange).length);
      })
      .catch(() => {
        if (!cancelled) {
          setOrgIps([]);
          setExternalCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
    // ipsKey is derived from ips; classifying only when the set of IPs changes.
  }, [ipsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (orgIps.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-gray-600">IP context</span>
      {orgIps.map((r) => (
        <span
          key={r.ip}
          className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${
            POSTURE_STYLES[r.defaultPosture ?? "neutral"] ?? POSTURE_STYLES.neutral
          }`}
          title={`${r.ip} is in organization zone "${r.zone}"${
            r.defaultPosture ? ` (default posture: ${r.defaultPosture})` : ""
          }`}
        >
          {r.ip}
          <span className="opacity-70">
            {r.zone}
            {r.defaultPosture ? ` · ${r.defaultPosture}` : ""}
          </span>
        </span>
      ))}
      {externalCount > 0 && (
        <span className="text-[10px] text-gray-500">
          +{externalCount} external IP{externalCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
