import { isIPv4 } from "node:net";
import { classifyOrganizationIp, isPublicIpv4 } from "../../server/threat-intel-ranges.js";

export function normalizeIp(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !isIPv4(trimmed)) return null;
  return trimmed;
}

export { isPublicIpv4 };

export function isOrganizationInternalIpv4(ip: string): boolean {
  const c = classifyOrganizationIp(ip);
  return Boolean(c?.inOrganizationRange);
}

export function classifyIpsForThreatIntel(
  ips: string[],
  max: number
): {
  queryable: string[];
  skippedPrivate: string[];
  skippedInternal: string[];
  skippedInvalid: string[];
  truncated: boolean;
} {
  const skippedPrivate: string[] = [];
  const skippedInternal: string[] = [];
  const skippedInvalid: string[] = [];
  const seen = new Set<string>();
  const queryable: string[] = [];

  for (const raw of ips) {
    const classification = classifyOrganizationIp(raw);
    if (!classification) {
      skippedInvalid.push(raw);
      continue;
    }
    if (classification.inOrganizationRange) {
      skippedInternal.push(classification.ip);
      continue;
    }
    if (!classification.isPublic) {
      skippedPrivate.push(classification.ip);
      continue;
    }
    if (seen.has(classification.ip)) continue;
    seen.add(classification.ip);
    queryable.push(classification.ip);
  }

  const truncated = queryable.length > max;
  return {
    queryable: queryable.slice(0, max),
    skippedPrivate,
    skippedInternal,
    skippedInvalid,
    truncated,
  };
}

/** @deprecated Use classifyIpsForThreatIntel */
export function dedupePublicIps(
  ips: string[],
  max: number
): {
  publicIps: string[];
  skippedPrivate: string[];
  skippedInvalid: string[];
  truncated: boolean;
} {
  const result = classifyIpsForThreatIntel(ips, max);
  return {
    publicIps: result.queryable,
    skippedPrivate: result.skippedPrivate,
    skippedInvalid: result.skippedInvalid,
    truncated: result.truncated,
  };
}

export type ThreatIntelIpSkipReason = "invalid" | "internal" | "private";

export function classifyIpForThreatIntel(raw: string): {
  skip: boolean;
  reason?: ThreatIntelIpSkipReason;
  ip?: string;
  summary?: string;
  zone?: string | null;
  defaultPosture?: string | null;
} {
  const classification = classifyOrganizationIp(raw);
  if (!classification) {
    return {
      skip: true,
      reason: "invalid",
      summary: `Invalid IPv4 address: ${raw}`,
    };
  }
  if (classification.inOrganizationRange) {
    return {
      skip: true,
      reason: "internal",
      ip: classification.ip,
      zone: classification.zone,
      defaultPosture: classification.defaultPosture,
      summary: `Skipped ${classification.ip}: organization zone "${classification.zone}" (${classification.defaultPosture}) — not sent to threat intelligence APIs`,
    };
  }
  if (!classification.isPublic) {
    return {
      skip: true,
      reason: "private",
      ip: classification.ip,
      summary: `Skipped ${classification.ip}: private or reserved address`,
    };
  }
  return { skip: false, ip: classification.ip };
}
