import type { IpZoneConfig, IpZonePosture } from "./settings-api";

const POSTURES = new Set<IpZonePosture>(["trusted", "neutral", "sensitive"]);

/** Text format for Settings → Runtime IP zones editor. */
export function formatIpZonesText(zones: IpZoneConfig[] | undefined): string {
  if (!zones?.length) return "";
  const lines: string[] = [];
  for (const zone of zones) {
    lines.push(`${zone.name} ${zone.defaultPosture ?? "neutral"}`);
    for (const cidr of zone.cidrs) {
      lines.push(cidr);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function parseIpZonesText(raw: string): IpZoneConfig[] {
  const zones: IpZoneConfig[] = [];
  let current: IpZoneConfig | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const header = trimmed.match(/^([a-z][a-z0-9-]*)\s+(trusted|neutral|sensitive)$/i);
    if (header) {
      if (current && current.cidrs.length > 0) zones.push(current);
      current = {
        name: header[1].toLowerCase(),
        defaultPosture: header[2].toLowerCase() as IpZonePosture,
        cidrs: [],
      };
      continue;
    }

    if (!current) {
      current = { name: "internal", defaultPosture: "neutral", cidrs: [] };
    }
    current.cidrs.push(trimmed);
  }

  if (current && current.cidrs.length > 0) zones.push(current);
  return zones;
}

export function zonesFromLegacyInternalCidrs(cidrs: string[] | undefined): IpZoneConfig[] {
  if (!cidrs?.length) return [];
  return [{ name: "internal", defaultPosture: "neutral", cidrs }];
}

export function isValidPosture(value: string): value is IpZonePosture {
  return POSTURES.has(value as IpZonePosture);
}
