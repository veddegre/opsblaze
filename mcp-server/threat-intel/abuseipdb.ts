import type { ProviderIpResult } from "./types.js";
import { getCached, setCached } from "./cache.js";
import { getAbuseIpdbMaxAgeDays } from "../../server/threat-intel-config.js";

const AIPDB_BASE = "https://api.abuseipdb.com/api/v2";

export async function lookupAbuseIpdb(ip: string): Promise<ProviderIpResult> {
  const apiKey = process.env.ABUSEIPDB_API_KEY?.trim();
  if (!apiKey) {
    return {
      provider: "abuseipdb",
      ip,
      ok: false,
      summary: "AbuseIPDB is not configured",
      error: "ABUSEIPDB_API_KEY is not set",
    };
  }

  const cacheKey = `aipdb:${ip}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return JSON.parse(cached) as ProviderIpResult;
  }

  const maxAge = getAbuseIpdbMaxAgeDays();

  try {
    const url = new URL(`${AIPDB_BASE}/check`);
    url.searchParams.set("ipAddress", ip);
    url.searchParams.set("maxAgeInDays", String(maxAge));

    const res = await fetch(url, {
      headers: { Key: apiKey, Accept: "application/json" },
    });

    if (res.status === 429) {
      return {
        provider: "abuseipdb",
        ip,
        ok: false,
        summary: "AbuseIPDB rate limit exceeded",
        error: "HTTP 429",
      };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        provider: "abuseipdb",
        ip,
        ok: false,
        summary: `AbuseIPDB lookup failed (${res.status})`,
        error: body.slice(0, 200) || `HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      data?: {
        ipAddress?: string;
        abuseConfidenceScore?: number;
        totalReports?: number;
        numDistinctUsers?: number;
        countryCode?: string;
        isp?: string;
        domain?: string;
        isWhitelisted?: boolean;
        usageType?: string;
      };
    };

    const row = data.data ?? {};
    const score = Number(row.abuseConfidenceScore ?? 0);
    const reports = Number(row.totalReports ?? 0);

    const result: ProviderIpResult = {
      provider: "abuseipdb",
      ip,
      ok: true,
      summary:
        `AbuseIPDB: confidence ${score}% · ${reports} report(s)` +
        (row.countryCode ? ` · ${row.countryCode}` : "") +
        (row.isp ? ` · ${row.isp}` : "") +
        (row.isWhitelisted ? " · whitelisted" : ""),
      link: `https://www.abuseipdb.com/check/${ip}`,
      details: {
        abuseConfidenceScore: score,
        totalReports: reports,
        numDistinctUsers: row.numDistinctUsers,
        countryCode: row.countryCode,
        isp: row.isp,
        domain: row.domain,
        isWhitelisted: row.isWhitelisted,
        usageType: row.usageType,
        maxAgeInDays: maxAge,
      },
    };

    setCached(cacheKey, JSON.stringify(result));
    return result;
  } catch (err) {
    return {
      provider: "abuseipdb",
      ip,
      ok: false,
      summary: "AbuseIPDB request failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
