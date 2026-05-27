import { existsSync } from "fs";
import { cp, mkdir } from "fs/promises";
import path from "path";
import { logger } from "./logger.js";

export const SKILLS_DIR_PRIMARY = path.resolve(process.cwd(), ".opsblaze", "skills");
export const SKILLS_DIR_LEGACY = path.resolve(process.cwd(), ".claude", "skills");

/** Active skills directory (.opsblaze preferred; falls back to legacy .claude). */
export function resolveSkillsDir(): string {
  if (existsSync(SKILLS_DIR_PRIMARY)) return SKILLS_DIR_PRIMARY;
  if (existsSync(SKILLS_DIR_LEGACY)) return SKILLS_DIR_LEGACY;
  return SKILLS_DIR_PRIMARY;
}

/** All skill roots to scan (legacy first, then primary — primary wins on name conflicts). */
export function listSkillsRoots(): string[] {
  const roots: string[] = [];
  if (existsSync(SKILLS_DIR_LEGACY)) roots.push(SKILLS_DIR_LEGACY);
  if (existsSync(SKILLS_DIR_PRIMARY) && !roots.includes(SKILLS_DIR_PRIMARY)) {
    roots.push(SKILLS_DIR_PRIMARY);
  }
  if (roots.length === 0) roots.push(SKILLS_DIR_PRIMARY);
  return roots;
}

/** Copy legacy tree into .opsblaze/skills once if only .claude exists. */
export async function ensureOpsblazeSkillsLayout(): Promise<void> {
  if (existsSync(SKILLS_DIR_PRIMARY)) return;
  if (!existsSync(SKILLS_DIR_LEGACY)) {
    await mkdir(SKILLS_DIR_PRIMARY, { recursive: true });
    return;
  }
  try {
    await cp(SKILLS_DIR_LEGACY, SKILLS_DIR_PRIMARY, { recursive: true });
    logger.info(
      { from: SKILLS_DIR_LEGACY, to: SKILLS_DIR_PRIMARY },
      "migrated skills directory to .opsblaze/skills"
    );
  } catch (err) {
    logger.warn({ err }, "could not migrate skills to .opsblaze/skills");
  }
}
