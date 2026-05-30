/**
 * Threat intelligence provider configuration (env-driven).
 * Used by the built-in MCP server registration and health checks.
 */

export type ThreatIntelProvider = "virustotal" | "abuseipdb";

const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

function envFlag(name: string, defaultWhenUnset: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultWhenUnset;
  return !FALSE_VALUES.has(raw);
}

function providerKeyConfigured(provider: ThreatIntelProvider): boolean {
  if (provider === "virustotal") {
    return Boolean(process.env.VIRUSTOTAL_API_KEY?.trim());
  }
  return Boolean(process.env.ABUSEIPDB_API_KEY?.trim());
}

/** Master switch — set THREAT_INTEL_ENABLED=false to disable the built-in MCP server entirely. */
export function isThreatIntelMasterEnabled(): boolean {
  return envFlag("THREAT_INTEL_ENABLED", true);
}

/** Per-provider switch. Defaults to true when an API key is present. */
export function isThreatIntelProviderConfigured(provider: ThreatIntelProvider): boolean {
  if (!isThreatIntelMasterEnabled()) return false;
  const flagName = provider === "virustotal" ? "VIRUSTOTAL_ENABLED" : "ABUSEIPDB_ENABLED";
  if (!envFlag(flagName, providerKeyConfigured(provider))) return false;
  return providerKeyConfigured(provider);
}

export function getActiveThreatIntelProviders(): ThreatIntelProvider[] {
  const active: ThreatIntelProvider[] = [];
  if (isThreatIntelProviderConfigured("virustotal")) active.push("virustotal");
  if (isThreatIntelProviderConfigured("abuseipdb")) active.push("abuseipdb");
  return active;
}

export function getThreatIntelMaxIps(): number {
  const raw = Number(process.env.THREAT_INTEL_MAX_IPS ?? "25");
  if (!Number.isFinite(raw) || raw < 1) return 25;
  return Math.min(100, Math.floor(raw));
}

export const THREAT_INTEL_MCP_SERVER_NAME = "opsblaze-threat-intel";

/** Re-export for MCP registration when only IP zones are configured (no VT/AbuseIPDB). */
export { hasOrganizationIpConfig } from "./threat-intel-ranges.js";
