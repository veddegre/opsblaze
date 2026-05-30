import { z } from "zod";
import {
  parseInternalRangeEntry,
  validateThreatIntelInternalCidrs,
  type ParsedIpv4Range,
} from "./threat-intel-ranges.js";

export const ipZonePostureSchema = z.enum(["trusted", "neutral", "sensitive"]);

export type IpZonePosture = z.infer<typeof ipZonePostureSchema>;

export const organizationIpZoneSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(
      /^[a-z][a-z0-9-]*$/,
      "Zone name must start with a letter and use lowercase letters, digits, and hyphens"
    ),
  defaultPosture: ipZonePostureSchema.optional(),
  cidrs: z.array(z.string().max(64)).min(1).max(50),
});

export type OrganizationIpZoneConfig = z.infer<typeof organizationIpZoneSchema>;

export interface ResolvedOrganizationIpZone {
  name: string;
  defaultPosture: IpZonePosture;
  cidrs: string[];
  parsedRanges: ParsedIpv4Range[];
}

export function validateOrganizationIpZones(zones: OrganizationIpZoneConfig[]): string[] {
  const errors: string[] = [];
  const names = new Set<string>();
  for (const zone of zones) {
    const parsed = organizationIpZoneSchema.safeParse(zone);
    if (!parsed.success) {
      errors.push(parsed.error.issues[0]?.message ?? "Invalid IP zone");
      continue;
    }
    if (names.has(parsed.data.name)) {
      errors.push(`Duplicate zone name: ${parsed.data.name}`);
      continue;
    }
    names.add(parsed.data.name);
    errors.push(
      ...validateThreatIntelInternalCidrs(parsed.data.cidrs).map((e) => `${parsed.data.name}: ${e}`)
    );
  }
  return errors;
}

export function resolveOrganizationIpZones(
  zones: OrganizationIpZoneConfig[]
): ResolvedOrganizationIpZone[] {
  const resolved: ResolvedOrganizationIpZone[] = [];
  for (const zone of zones) {
    const parsedRanges: ParsedIpv4Range[] = [];
    for (const cidr of zone.cidrs) {
      const range = parseInternalRangeEntry(cidr);
      if (range) parsedRanges.push(range);
    }
    if (parsedRanges.length === 0) continue;
    resolved.push({
      name: zone.name,
      defaultPosture: zone.defaultPosture ?? "neutral",
      cidrs: zone.cidrs,
      parsedRanges,
    });
  }
  return resolved;
}
