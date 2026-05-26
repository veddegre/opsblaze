import type { SkillPack, SkillInfo } from "./settings-api";

/** Skill bundles for the chat input — only enabled skills, non-empty bundles. */
export function activeSkillPacks(packs: SkillPack[], skills: SkillInfo[]): SkillPack[] {
  const enabled = new Set(skills.filter((s) => s.enabled).map((s) => s.name));
  return packs
    .map((pack) => ({
      ...pack,
      strict: pack.strict !== false,
      skills: pack.skills.filter((name) => enabled.has(name)),
    }))
    .filter((pack) => pack.skills.length > 0);
}
