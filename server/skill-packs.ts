import { z } from "zod";
import { listSkills } from "./skills.js";

export const skillPackSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Pack id must be lowercase letters, numbers, and hyphens"),
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  skills: z.array(z.string().min(1).max(64)).min(1).max(12),
  /** When true, only listed skills are loaded (maps to skillsStrict). Default true. */
  strict: z.boolean().optional(),
});

export type SkillPack = z.infer<typeof skillPackSchema>;

export const DEFAULT_SKILL_PACKS: SkillPack[] = [
  {
    id: "okta-authentication",
    name: "Okta authentication",
    description: "Auth and session events on index=okta (excludes group membership sync).",
    skills: ["investigating-okta-events"],
    strict: true,
  },
  {
    id: "splunk-login-activity",
    name: "Splunk login activity",
    description: "User logins and sessions via Splunk _audit.",
    skills: ["investigating-splunk-login-activity", "splunk-analyst"],
    strict: true,
  },
  {
    id: "splunk-data-discovery",
    name: "Splunk data discovery",
    description: "Map indexes and sourcetypes before a focused investigation.",
    skills: ["splunk-data-discovery"],
    strict: true,
  },
  {
    id: "splunk-search-load",
    name: "Splunk search & license",
    description: "Search activity and license capacity investigations.",
    skills: ["splunk-search-activity", "splunk-license-capacity"],
    strict: true,
  },
];

export function validateSkillPacks(packs: unknown): SkillPack[] {
  if (packs === undefined || packs === null) return [];
  const arr = z.array(skillPackSchema).max(24).parse(packs);
  const ids = new Set<string>();
  for (const p of arr) {
    if (ids.has(p.id)) {
      throw new Error(`Duplicate skill pack id: ${p.id}`);
    }
    ids.add(p.id);
  }
  return arr;
}

/** Stored packs if any, otherwise built-in defaults. Filters to enabled skills only. */
export async function getSkillPacks(stored?: SkillPack[] | null): Promise<SkillPack[]> {
  const source = stored && stored.length > 0 ? stored : DEFAULT_SKILL_PACKS;
  const allSkills = await listSkills();
  const enabled = new Set(allSkills.filter((s) => s.enabled).map((s) => s.name));

  return source
    .map((pack) => ({
      ...pack,
      strict: pack.strict !== false,
      skills: pack.skills.filter((name) => enabled.has(name)),
    }))
    .filter((pack) => pack.skills.length > 0);
}
