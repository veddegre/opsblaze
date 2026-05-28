import { isIPv4 } from "node:net";
import {
  getParsedThreatIntelInternalRanges,
  isIpv4InInternalRanges,
} from "../../server/threat-intel-ranges.js";

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
];

export function normalizeIp(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !isIPv4(trimmed)) return null;
  return trimmed;
}

export function isPublicIpv4(ip: string): boolean {
  if (!isIPv4(ip)) return false;
  return !PRIVATE_V4.some((re) => re.test(ip));
}

export function isOrganizationInternalIpv4(ip: string): boolean {
  const ranges = getParsedThreatIntelInternalRanges();
  return isIpv4InInternalRanges(ip, ranges);
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
    const ip = normalizeIp(raw);
    if (!ip) {
      skippedInvalid.push(raw);
      continue;
    }
    if (isOrganizationInternalIpv4(ip)) {
      skippedInternal.push(ip);
      continue;
    }
    if (!isPublicIpv4(ip)) {
      skippedPrivate.push(ip);
      continue;
    }
    if (seen.has(ip)) continue;
    seen.add(ip);
    queryable.push(ip);
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
export function dedupePublicIps(ips: string[], max: number): {
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
} {
  const ip = normalizeIp(raw);
  if (!ip) {
    return {
      skip: true,
      reason: "invalid",
      summary: `Invalid IPv4 address: ${raw}`,
    };
  }
  if (isOrganizationInternalIpv4(ip)) {
    return {
      skip: true,
      reason: "internal",
      ip,
      summary: `Skipped ${ip}: organization internal range (not sent to threat intelligence APIs)`,
    };
  }
  if (!isPublicIpv4(ip)) {
    return {
      skip: true,
      reason: "private",
      ip,
      summary: `Skipped ${ip}: private or reserved address`,
    };
  }
  return { skip: false, ip };
}
