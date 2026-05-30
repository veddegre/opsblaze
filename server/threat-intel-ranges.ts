import { readFileSync } from "fs";
import path from "path";
import { isIPv4 } from "node:net";
import type { ThreatIntelSettings } from "./threat-intel-settings.js";
import {
  resolveOrganizationIpZones,
  type IpZonePosture,
  type OrganizationIpZoneConfig,
  type ResolvedOrganizationIpZone,
} from "./threat-intel-zones.js";

export interface ParsedIpv4Range {
  network: number;
  mask: number;
  /** Original entry for error messages */
  source: string;
}

export interface IpClassification {
  ip: string;
  zone: string | null;
  defaultPosture: IpZonePosture | null;
  inOrganizationRange: boolean;
  isPrivate: boolean;
  isPublic: boolean;
  threatIntelSkipped: boolean;
  matchedCidr?: string;
}

const DATA_ROOT = path.resolve(
  process.env.OPSBLAZE_DATA_DIR ? path.dirname(process.env.OPSBLAZE_DATA_DIR) : "./data"
);
const SETTINGS_PATH = path.join(DATA_ROOT, "runtime-settings.json");

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
];

let cachedOrgIp: { at: number; zones: ResolvedOrganizationIpZone[] } | null = null;
const CACHE_MS = 60_000;

export function parseCidrList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ipv4ToInt(ip: string): number | null {
  if (!isIPv4(ip)) return null;
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return (
    (((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + parts[3]) >>> 0
  );
}

export function isPrivateIpv4(ip: string): boolean {
  if (!isIPv4(ip)) return false;
  return PRIVATE_V4.some((re) => re.test(ip));
}

export function isPublicIpv4(ip: string): boolean {
  if (!isIPv4(ip)) return false;
  return !isPrivateIpv4(ip);
}

/** Parse IPv4 host or CIDR (e.g. `10.0.0.0/8`, `203.0.113.5`, `203.0.113.5/32`). */
export function parseInternalRangeEntry(entry: string): ParsedIpv4Range | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  const slash = trimmed.indexOf("/");
  const ipPart = slash >= 0 ? trimmed.slice(0, slash).trim() : trimmed;
  const prefixRaw = slash >= 0 ? trimmed.slice(slash + 1).trim() : "32";
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;

  const ipInt = ipv4ToInt(ipPart);
  if (ipInt === null) return null;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ipInt & mask) >>> 0;
  return { network, mask, source: trimmed };
}

export function validateThreatIntelInternalCidrs(entries: string[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      errors.push(`Duplicate internal range: ${trimmed}`);
      continue;
    }
    seen.add(key);
    if (!parseInternalRangeEntry(trimmed)) {
      errors.push(`Invalid internal IPv4 range: ${trimmed}`);
    }
  }
  return errors;
}

export function isIpv4InInternalRanges(ip: string, ranges: ParsedIpv4Range[]): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;
  return ranges.some((r) => (ipInt & r.mask) >>> 0 === r.network);
}

function matchIpToRange(ip: string, ranges: ParsedIpv4Range[]): ParsedIpv4Range | null {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return null;
  for (const range of ranges) {
    if ((ipInt & range.mask) >>> 0 === range.network) return range;
  }
  return null;
}

function loadThreatIntelSettingsFromDisk(): ThreatIntelSettings {
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { threatIntel?: ThreatIntelSettings };
    return parsed?.threatIntel ?? {};
  } catch {
    return {};
  }
}

/**
 * Merge extra CIDRs into a zone by name, creating it if absent. Merging (rather than
 * skipping when the name already exists) guarantees env/legacy internal ranges are never
 * silently dropped — otherwise a user zone named `env`/`internal` would cause those IPs to
 * be sent to third-party threat-intel APIs.
 */
function mergeCidrsIntoZone(
  zones: OrganizationIpZoneConfig[],
  name: string,
  cidrs: string[]
): void {
  if (cidrs.length === 0) return;
  const existing = zones.find((z) => z.name === name);
  if (existing) {
    const seen = new Set(existing.cidrs.map((c) => c.trim().toLowerCase()));
    for (const cidr of cidrs) {
      const key = cidr.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        existing.cidrs.push(cidr.trim());
      }
    }
    return;
  }
  zones.push({ name, defaultPosture: "neutral", cidrs: [...cidrs] });
}

function buildZoneConfigsFromSettings(settings: ThreatIntelSettings): OrganizationIpZoneConfig[] {
  const zones: OrganizationIpZoneConfig[] = (settings.zones ?? []).map((z) => ({
    ...z,
    cidrs: [...z.cidrs],
  }));

  mergeCidrsIntoZone(zones, "internal", settings.internalCidrs ?? []);
  mergeCidrsIntoZone(zones, "env", parseCidrList(process.env.THREAT_INTEL_INTERNAL_CIDRS));

  return zones;
}

export function getResolvedOrganizationIpZones(): ResolvedOrganizationIpZone[] {
  const now = Date.now();
  if (cachedOrgIp && now - cachedOrgIp.at < CACHE_MS) {
    return cachedOrgIp.zones;
  }
  const settings = loadThreatIntelSettingsFromDisk();
  const zones = resolveOrganizationIpZones(buildZoneConfigsFromSettings(settings));
  cachedOrgIp = { at: now, zones };
  return zones;
}

export function hasOrganizationIpConfig(): boolean {
  if (parseCidrList(process.env.THREAT_INTEL_INTERNAL_CIDRS).length > 0) return true;
  const settings = loadThreatIntelSettingsFromDisk();
  return (settings.internalCidrs?.length ?? 0) > 0 || (settings.zones?.length ?? 0) > 0;
}

export function getOrganizationZoneNames(): string[] {
  return getResolvedOrganizationIpZones().map((z) => z.name);
}

export function loadThreatIntelInternalCidrStrings(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const zone of getResolvedOrganizationIpZones()) {
    for (const cidr of zone.cidrs) {
      const key = cidr.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(cidr.trim());
    }
  }
  return out;
}

export function loadParsedThreatIntelInternalRanges(): ParsedIpv4Range[] {
  const parsed: ParsedIpv4Range[] = [];
  for (const zone of getResolvedOrganizationIpZones()) {
    parsed.push(...zone.parsedRanges);
  }
  return parsed;
}

/** Cached parsed ranges (reloads from env + disk every minute). */
export function getParsedThreatIntelInternalRanges(): ParsedIpv4Range[] {
  return loadParsedThreatIntelInternalRanges();
}

export function clearThreatIntelInternalRangesCache(): void {
  cachedOrgIp = null;
}

export function classifyOrganizationIp(raw: string): IpClassification | null {
  const ip = raw.trim();
  if (!isIPv4(ip)) return null;

  const isPrivate = isPrivateIpv4(ip);
  const isPublic = !isPrivate;

  for (const zone of getResolvedOrganizationIpZones()) {
    const matched = matchIpToRange(ip, zone.parsedRanges);
    if (matched) {
      return {
        ip,
        zone: zone.name,
        defaultPosture: zone.defaultPosture,
        inOrganizationRange: true,
        isPrivate,
        isPublic,
        threatIntelSkipped: true,
        matchedCidr: matched.source,
      };
    }
  }

  return {
    ip,
    zone: null,
    defaultPosture: null,
    inOrganizationRange: false,
    isPrivate,
    isPublic,
    threatIntelSkipped: isPrivate,
  };
}

export function classifyOrganizationIps(ips: string[]): {
  zonesConfigured: string[];
  results: IpClassification[];
  skippedInvalid: string[];
} {
  const zonesConfigured = getOrganizationZoneNames();
  const results: IpClassification[] = [];
  const skippedInvalid: string[] = [];
  const seen = new Set<string>();

  for (const raw of ips) {
    const classification = classifyOrganizationIp(raw);
    if (!classification) {
      skippedInvalid.push(raw);
      continue;
    }
    if (seen.has(classification.ip)) continue;
    seen.add(classification.ip);
    results.push(classification);
  }

  return { zonesConfigured, results, skippedInvalid };
}
