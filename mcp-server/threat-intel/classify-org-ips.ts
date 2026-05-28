import {
  classifyOrganizationIps,
  getOrganizationZoneNames,
} from "../../server/threat-intel-ranges.js";
import type { IpClassification } from "../../server/threat-intel-ranges.js";

export interface ClassifyOrganizationIpsResult {
  zonesConfigured: string[];
  results: IpClassification[];
  skippedInvalid: string[];
}

export function classifyOrganizationIpsForTool(ips: string[]): ClassifyOrganizationIpsResult {
  return classifyOrganizationIps(ips);
}

export function formatClassifySummary(payload: ClassifyOrganizationIpsResult): string {
  const lines: string[] = [];
  const zoneNames = payload.zonesConfigured.length
    ? payload.zonesConfigured.join(", ")
    : getOrganizationZoneNames().join(", ") || "(none configured)";
  lines.push(`Configured zones: ${zoneNames}`);
  if (payload.skippedInvalid.length) {
    lines.push(`Skipped invalid: ${payload.skippedInvalid.join(", ")}`);
  }
  for (const r of payload.results) {
    const zonePart = r.zone ? `${r.zone} (${r.defaultPosture})` : "external";
    const skipPart = r.threatIntelSkipped ? ", threat-intel skipped" : "";
    lines.push(`${r.ip}: ${zonePart}${skipPart}${r.matchedCidr ? ` [${r.matchedCidr}]` : ""}`);
  }
  return lines.join("\n");
}
