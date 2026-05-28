import type { ProviderIpResult } from "./types.js";
import { getCached, setCached } from "./cache.js";

const VT_BASE = "https://www.virustotal.com/api/v3";

export async function lookupVirustotalIp(ip: string): Promise<ProviderIpResult> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY?.trim();
  if (!apiKey) {
    return {
      provider: "virustotal",
      ip,
      ok: false,
      summary: "VirusTotal is not configured",
      error: "VIRUSTOTAL_API_KEY is not set",
    };
  }

  const cacheKey = `vt:${ip}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return JSON.parse(cached) as ProviderIpResult;
  }

  try {
    const res = await fetch(`${VT_BASE}/ip_addresses/${encodeURIComponent(ip)}`, {
      headers: { "x-apikey": apiKey, Accept: "application/json" },
    });

    if (res.status === 429) {
      return {
        provider: "virustotal",
        ip,
        ok: false,
        summary: "VirusTotal rate limit exceeded",
        error: "HTTP 429",
      };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        provider: "virustotal",
        ip,
        ok: false,
        summary: `VirusTotal lookup failed (${res.status})`,
        error: body.slice(0, 200) || `HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      data?: {
        attributes?: {
          last_analysis_stats?: Record<string, number>;
          reputation?: number;
          country?: string;
          as_owner?: string;
          network?: string;
        };
      };
    };

    const attrs = data.data?.attributes ?? {};
    const stats = attrs.last_analysis_stats ?? {};
    const malicious = Number(stats.malicious ?? 0);
    const suspicious = Number(stats.suspicious ?? 0);
    const harmless = Number(stats.harmless ?? 0);
    const undetected = Number(stats.undetected ?? 0);

    const result: ProviderIpResult = {
      provider: "virustotal",
      ip,
      ok: true,
      summary:
        `VT: ${malicious} malicious, ${suspicious} suspicious, ${harmless} harmless, ${undetected} undetected` +
        (attrs.country ? ` · ${attrs.country}` : "") +
        (attrs.as_owner ? ` · ${attrs.as_owner}` : ""),
      link: `https://www.virustotal.com/gui/ip-address/${ip}`,
      details: {
        malicious,
        suspicious,
        harmless,
        undetected,
        reputation: attrs.reputation,
        country: attrs.country,
        as_owner: attrs.as_owner,
        network: attrs.network,
      },
    };

    setCached(cacheKey, JSON.stringify(result));
    return result;
  } catch (err) {
    return {
      provider: "virustotal",
      ip,
      ok: false,
      summary: "VirusTotal request failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
