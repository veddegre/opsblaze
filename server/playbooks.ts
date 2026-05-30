import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { z } from "zod";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";

export const playbookSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(128),
  prompt: z.string().min(1).max(10_000),
  skills: z.array(z.string().min(1).max(64)).max(12).optional(),
  strict: z.boolean().optional(),
});

export type InvestigationPlaybook = {
  id: string;
  name: string;
  prompt: string;
  skills: string[];
  strict: boolean;
  updatedAt: string;
};

const DATA_ROOT = path.resolve(
  process.env.OPSBLAZE_DATA_DIR ? path.dirname(process.env.OPSBLAZE_DATA_DIR) : "./data"
);
const PLAYBOOKS_PATH = path.join(DATA_ROOT, "playbooks.json");

interface PlaybooksFile {
  playbooks: InvestigationPlaybook[];
}

async function ensureDir() {
  await mkdir(path.dirname(PLAYBOOKS_PATH), { recursive: true });
}

async function readPlaybooks(): Promise<InvestigationPlaybook[]> {
  try {
    const raw = await readFile(PLAYBOOKS_PATH, "utf-8");
    const data = JSON.parse(raw) as PlaybooksFile;
    return Array.isArray(data.playbooks) ? data.playbooks : [];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    logger.error({ err }, "failed to read playbooks");
    return [];
  }
}

async function writePlaybooks(playbooks: InvestigationPlaybook[]): Promise<void> {
  await ensureDir();
  await writeFile(PLAYBOOKS_PATH, JSON.stringify({ playbooks }, null, 2), "utf-8");
}

export async function listPlaybooks(): Promise<InvestigationPlaybook[]> {
  const all = await readPlaybooks();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createPlaybook(
  input: z.infer<typeof playbookSchema>
): Promise<InvestigationPlaybook> {
  const parsed = playbookSchema.parse(input);
  const playbooks = await readPlaybooks();
  const id = parsed.id?.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 64) || randomUUID().slice(0, 8);
  if (playbooks.some((p) => p.id === id)) {
    throw new Error(`Playbook id '${id}' already exists`);
  }
  const entry: InvestigationPlaybook = {
    id,
    name: parsed.name.trim(),
    prompt: parsed.prompt.trim(),
    skills: parsed.skills ?? [],
    strict: parsed.strict !== false,
    updatedAt: new Date().toISOString(),
  };
  playbooks.push(entry);
  await writePlaybooks(playbooks);
  logger.info({ id: entry.id, name: entry.name }, "playbook created");
  return entry;
}

export async function updatePlaybook(
  id: string,
  input: z.infer<typeof playbookSchema>
): Promise<InvestigationPlaybook | null> {
  const parsed = playbookSchema.parse({ ...input, id });
  const playbooks = await readPlaybooks();
  const index = playbooks.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const entry: InvestigationPlaybook = {
    id,
    name: parsed.name.trim(),
    prompt: parsed.prompt.trim(),
    skills: parsed.skills ?? playbooks[index].skills,
    strict: parsed.strict !== false,
    updatedAt: new Date().toISOString(),
  };
  playbooks[index] = entry;
  await writePlaybooks(playbooks);
  logger.info({ id: entry.id, name: entry.name }, "playbook updated");
  return entry;
}

export async function deletePlaybook(id: string): Promise<boolean> {
  const playbooks = await readPlaybooks();
  const next = playbooks.filter((p) => p.id !== id);
  if (next.length === playbooks.length) return false;
  await writePlaybooks(next);
  logger.info({ id }, "playbook deleted");
  return true;
}
