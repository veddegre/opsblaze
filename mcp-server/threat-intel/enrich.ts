import {
  getActiveThreatIntelProviders,
  getThreatIntelMaxIps,
  isThreatIntelProviderConfigured,
  type ThreatIntelProvider,
} from "../../server/threat-intel-config.js";
import { classifyIpsForThreatIntel } from "./ip-utils.js";
import { lookupAbuseIpdb } from "./abuseipdb.js";
import { lookupVirustotalIp } from "./virustotal.js";
import type { EnrichIpsResult, ProviderIpResult } from "./types.js";

function resolveProviders(requested?: ThreatIntelProvider[]): ThreatIntelProvider[] {
  const active = getActiveThreatIntelProviders();
  if (!requested?.length) return active;
  return requested.filter((p) => active.includes(p));
}

async function lookupIp(ip: string, providers: ThreatIntelProvider[]): Promise<ProviderIpResult[]> {
  const out: ProviderIpResult[] = [];
  for (const provider of providers) {
    if (provider === "virustotal" && isThreatIntelProviderConfigured("virustotal")) {
      out.push(await lookupVirustotalIp(ip));
    }
    if (provider === "abuseipdb" && isThreatIntelProviderConfigured("abuseipdb")) {
      out.push(await lookupAbuseIpdb(ip));
    }
  }
  return out;
}

export async function enrichIps(
  ips: string[],
  providers?: ThreatIntelProvider[]
): Promise<EnrichIpsResult> {
  const providersUsed = resolveProviders(providers);
  if (providersUsed.length === 0) {
    return {
      providersUsed: [],
      skippedPrivate: [],
      skippedInternal: [],
      skippedInvalid: [],
      truncated: false,
      results: [
        {
          provider: "virustotal",
          ip: "",
          ok: false,
          summary:
            "No threat intelligence providers are enabled. Configure VIRUSTOTAL_API_KEY and/or ABUSEIPDB_API_KEY, or set VIRUSTOTAL_ENABLED / ABUSEIPDB_ENABLED.",
          error: "no_providers",
        },
      ],
    };
  }

  const max = getThreatIntelMaxIps();
  const { queryable, skippedPrivate, skippedInternal, skippedInvalid, truncated } =
    classifyIpsForThreatIntel(ips, max);

  const results: ProviderIpResult[] = [];
  for (const ip of queryable) {
    results.push(...(await lookupIp(ip, providersUsed)));
  }

  return {
    providersUsed,
    skippedPrivate,
    skippedInternal,
    skippedInvalid,
    truncated,
    results,
  };
}

export function formatEnrichSummary(payload: EnrichIpsResult): string {
  const lines: string[] = [];
  lines.push(`Providers: ${payload.providersUsed.join(", ") || "none"}`);
  if (payload.skippedInternal.length) {
    lines.push(`Skipped organization internal: ${payload.skippedInternal.join(", ")}`);
  }
  if (payload.skippedPrivate.length) {
    lines.push(`Skipped private/reserved: ${payload.skippedPrivate.join(", ")}`);
  }
  if (payload.skippedInvalid.length) {
    lines.push(`Skipped invalid: ${payload.skippedInvalid.join(", ")}`);
  }
  if (payload.truncated) {
    lines.push(`Truncated to ${getThreatIntelMaxIps()} public IPs`);
  }
  for (const r of payload.results) {
    if (!r.ip) {
      lines.push(r.summary);
      continue;
    }
    lines.push(`${r.ip} [${r.provider}]: ${r.summary}${r.link ? ` (${r.link})` : ""}`);
  }
  return lines.join("\n");
}
