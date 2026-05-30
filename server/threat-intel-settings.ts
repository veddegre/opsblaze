import { z } from "zod";
import { loadRuntimeSettings } from "./runtime-settings.js";
import { organizationIpZoneSchema } from "./threat-intel-zones.js";

export const threatIntelSettingsSchema = z.object({
  internalCidrs: z.array(z.string().max(64)).max(200).optional(),
  zones: z.array(organizationIpZoneSchema).max(24).optional(),
  /** Master switch override for the built-in threat-intel MCP. Falls back to THREAT_INTEL_ENABLED. */
  enabled: z.boolean().optional(),
  /** Per-provider override (key must still be present in .env). Falls back to *_ENABLED env flags. */
  virustotalEnabled: z.boolean().optional(),
  abuseipdbEnabled: z.boolean().optional(),
  /** Max public IPs per enrich_ips call. Falls back to THREAT_INTEL_MAX_IPS (default 25). */
  maxIps: z.number().int().min(1).max(100).optional(),
  /** Lookup cache TTL in hours. Falls back to THREAT_INTEL_CACHE_HOURS (default 24). */
  cacheHours: z.number().int().min(1).max(168).optional(),
  /** AbuseIPDB report window. Falls back to ABUSEIPDB_MAX_AGE_DAYS (default 90). */
  abuseipdbMaxAgeDays: z.number().int().min(1).max(365).optional(),
});

export type ThreatIntelSettings = z.infer<typeof threatIntelSettingsSchema>;

export async function getThreatIntelSettings(): Promise<ThreatIntelSettings> {
  const settings = await loadRuntimeSettings();
  return settings.threatIntel ?? {};
}
