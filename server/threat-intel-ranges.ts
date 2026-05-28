import { readFileSync } from "fs";
import path from "path";
import { isIPv4 } from "node:net";

export interface ParsedIpv4Range {
  network: number;
  mask: number;
  /** Original entry for error messages */
  source: string;
}

const DATA_ROOT = path.resolve(
  process.env.OPSBLAZE_DATA_DIR ? path.dirname(process.env.OPSBLAZE_DATA_DIR) : "./data"
);
const SETTINGS_PATH = path.join(DATA_ROOT, "runtime-settings.json");

let cachedRanges: { at: number; ranges: ParsedIpv4Range[] } | null = null;
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
  return (((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + parts[3]) >>> 0;
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
  return ranges.some((r) => ((ipInt & r.mask) >>> 0) === r.network);
}

function loadInternalCidrStringsFromDisk(): string[] {
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { threatIntel?: { internalCidrs?: unknown } };
    const list = parsed?.threatIntel?.internalCidrs;
    if (!Array.isArray(list)) return [];
    return list.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  } catch {
    return [];
  }
}

/** Merges env `THREAT_INTEL_INTERNAL_CIDRS` with runtime-settings `threatIntel.internalCidrs`. */
export function loadThreatIntelInternalCidrStrings(): string[] {
  const fromEnv = parseCidrList(process.env.THREAT_INTEL_INTERNAL_CIDRS);
  const fromDisk = loadInternalCidrStringsFromDisk();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of [...fromEnv, ...fromDisk]) {
    const key = entry.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry.trim());
  }
  return out;
}

export function loadParsedThreatIntelInternalRanges(): ParsedIpv4Range[] {
  const parsed: ParsedIpv4Range[] = [];
  for (const entry of loadThreatIntelInternalCidrStrings()) {
    const range = parseInternalRangeEntry(entry);
    if (range) parsed.push(range);
  }
  return parsed;
}

/** Cached parsed ranges (reloads from env + disk every minute). */
export function getParsedThreatIntelInternalRanges(): ParsedIpv4Range[] {
  const now = Date.now();
  if (cachedRanges && now - cachedRanges.at < CACHE_MS) {
    return cachedRanges.ranges;
  }
  const ranges = loadParsedThreatIntelInternalRanges();
  cachedRanges = { at: now, ranges };
  return ranges;
}

export function clearThreatIntelInternalRangesCache(): void {
  cachedRanges = null;
}
