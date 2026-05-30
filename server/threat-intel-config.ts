/**
 * Threat intelligence provider configuration (env-driven).
 * Used by the built-in MCP server registration and health checks.
 */

import { loadThreatIntelSettingsSync } from "./threat-intel-ranges.js";

export type ThreatIntelProvider = "virustotal" | "abuseipdb";

const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

function envFlag(name: string, defaultWhenUnset: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultWhenUnset;
  return !FALSE_VALUES.has(raw);
}

/**
 * Runtime overrides (Settings → Runtime → Threat intelligence) take precedence over
 * the corresponding env vars. Secrets (API keys) remain env-only; the runtime layer
 * only toggles/limits behaviour.
 */
function runtimeOverrides() {
  return loadThreatIntelSettingsSync();
}

export function threatIntelProviderKeyPresent(provider: ThreatIntelProvider): boolean {
  if (provider === "virustotal") {
    return Boolean(process.env.VIRUSTOTAL_API_KEY?.trim());
  }
  return Boolean(process.env.ABUSEIPDB_API_KEY?.trim());
}

function providerKeyConfigured(provider: ThreatIntelProvider): boolean {
  return threatIntelProviderKeyPresent(provider);
}

/** Master switch — runtime `enabled` override, else THREAT_INTEL_ENABLED (default on). */
export function isThreatIntelMasterEnabled(): boolean {
  const override = runtimeOverrides().enabled;
  if (typeof override === "boolean") return override;
  return envFlag("THREAT_INTEL_ENABLED", true);
}

/** Per-provider switch. Runtime override wins; else *_ENABLED env (default on when key present). */
export function isThreatIntelProviderConfigured(provider: ThreatIntelProvider): boolean {
  if (!isThreatIntelMasterEnabled()) return false;
  const keyPresent = providerKeyConfigured(provider);
  const settings = runtimeOverrides();
  const override =
    provider === "virustotal" ? settings.virustotalEnabled : settings.abuseipdbEnabled;
  if (override === false) return false;
  if (override === undefined) {
    const flagName = provider === "virustotal" ? "VIRUSTOTAL_ENABLED" : "ABUSEIPDB_ENABLED";
    if (!envFlag(flagName, keyPresent)) return false;
  }
  return keyPresent;
}

export function getActiveThreatIntelProviders(): ThreatIntelProvider[] {
  const active: ThreatIntelProvider[] = [];
  if (isThreatIntelProviderConfigured("virustotal")) active.push("virustotal");
  if (isThreatIntelProviderConfigured("abuseipdb")) active.push("abuseipdb");
  return active;
}

export function getThreatIntelMaxIps(): number {
  const override = runtimeOverrides().maxIps;
  const raw =
    typeof override === "number" ? override : Number(process.env.THREAT_INTEL_MAX_IPS ?? "25");
  if (!Number.isFinite(raw) || raw < 1) return 25;
  return Math.min(100, Math.floor(raw));
}

export function getThreatIntelCacheHours(): number {
  const override = runtimeOverrides().cacheHours;
  const raw =
    typeof override === "number" ? override : Number(process.env.THREAT_INTEL_CACHE_HOURS ?? "24");
  if (!Number.isFinite(raw) || raw <= 0) return 24;
  return Math.min(168, Math.floor(raw));
}

export function getAbuseIpdbMaxAgeDays(): number {
  const override = runtimeOverrides().abuseipdbMaxAgeDays;
  const raw =
    typeof override === "number"
      ? override
      : parseInt(process.env.ABUSEIPDB_MAX_AGE_DAYS ?? "90", 10);
  if (!Number.isFinite(raw)) return 90;
  return Math.min(365, Math.max(1, Math.floor(raw)));
}

export const THREAT_INTEL_MCP_SERVER_NAME = "opsblaze-threat-intel";

/** Re-export for MCP registration when only IP zones are configured (no VT/AbuseIPDB). */
export { hasOrganizationIpConfig } from "./threat-intel-ranges.js";
