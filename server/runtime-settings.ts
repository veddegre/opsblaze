import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { z } from "zod";
import { logger } from "./logger.js";
import {
  defaultRedactionSettings,
  normalizeRedactionSettings,
  validateCustomPatterns,
  type RedactionSettings,
} from "./redaction.js";
import { skillPackSchema, validateSkillPacks, type SkillPack } from "./skill-packs.js";
import { splunkGuardrailsSchema } from "./splunk-guardrails.js";
import { threatIntelSettingsSchema } from "./threat-intel-settings.js";
import {
  clearThreatIntelInternalRangesCache,
  validateThreatIntelInternalCidrs,
} from "./threat-intel-ranges.js";
import { validateOrganizationIpZones } from "./threat-intel-zones.js";

const redactionBuiltinSchema = z.object({
  email: z.boolean().optional(),
  ipv4: z.boolean().optional(),
  mac: z.boolean().optional(),
});

const redactionSchema = z.object({
  applyOnExport: z.boolean().optional(),
  builtin: redactionBuiltinSchema.optional(),
  customStrings: z.array(z.string().max(500)).max(200).optional(),
  customPatterns: z.array(z.string().max(200)).max(20).optional(),
});

const runtimeSettingsSchema = z.object({
  claudeModel: z.string().min(1).optional(),
  claudeEffort: z.enum(["low", "medium", "high", "max"]).optional(),
  maxTurns: z.number().int().min(1).max(200).optional(),
  streamTimeoutMs: z.number().int().min(30_000).max(1_800_000).optional(),
  maxHistory: z.number().int().min(1).max(100).optional(),
  maxMessageLen: z.number().int().min(500).max(100_000).optional(),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
  redaction: redactionSchema.optional(),
  skillPacks: z.array(skillPackSchema).max(24).optional(),
  splunkGuardrails: splunkGuardrailsSchema.optional(),
  threatIntel: threatIntelSettingsSchema.optional(),
});

export type { SkillPack };

export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

const DATA_ROOT = path.resolve(
  process.env.OPSBLAZE_DATA_DIR ? path.dirname(process.env.OPSBLAZE_DATA_DIR) : "./data"
);
const SETTINGS_PATH = path.join(DATA_ROOT, "runtime-settings.json");

async function ensureDir() {
  await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
}

export async function loadRuntimeSettings(): Promise<RuntimeSettings> {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return runtimeSettingsSchema.parse(parsed);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      logger.error({ err }, "failed to read runtime settings");
    }
    return {};
  }
}

export async function updateRuntimeSettings(
  partial: Partial<RuntimeSettings>
): Promise<RuntimeSettings> {
  const current = await loadRuntimeSettings();
  const merged: Record<string, unknown> = { ...current, ...partial };

  if (partial.redaction !== undefined) {
    const nextRedaction = {
      ...(current.redaction ?? {}),
      ...partial.redaction,
      builtin: {
        ...(current.redaction?.builtin ?? {}),
        ...(partial.redaction.builtin ?? {}),
      },
    };
    merged.redaction = nextRedaction;
    const patternErrors = validateCustomPatterns(nextRedaction.customPatterns ?? []);
    if (patternErrors.length > 0) {
      throw new Error(patternErrors[0]);
    }
  }

  if (partial.skillPacks !== undefined) {
    merged.skillPacks = validateSkillPacks(partial.skillPacks);
  }

  if (partial.threatIntel !== undefined) {
    const nextThreatIntel = {
      ...(current.threatIntel ?? {}),
      ...partial.threatIntel,
    };
    merged.threatIntel = nextThreatIntel;
    const zoneErrors = validateOrganizationIpZones(nextThreatIntel.zones ?? []);
    if (zoneErrors.length > 0) {
      throw new Error(zoneErrors[0]);
    }
    if (nextThreatIntel.internalCidrs?.length) {
      const cidrErrors = validateThreatIntelInternalCidrs(nextThreatIntel.internalCidrs);
      if (cidrErrors.length > 0) {
        throw new Error(cidrErrors[0]);
      }
    }
  }

  // Remove keys that are explicitly set to undefined
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) delete merged[key];
  }

  const validated = runtimeSettingsSchema.parse(merged);
  await ensureDir();
  await writeFile(SETTINGS_PATH, JSON.stringify(validated, null, 2), "utf-8");
  clearThreatIntelInternalRangesCache();
  if (validated.logLevel) logger.level = validated.logLevel;
  logger.info({ settings: validated }, "runtime settings updated");
  return validated;
}

export async function getClaudeModel(): Promise<string> {
  const settings = await loadRuntimeSettings();
  if (process.env.OPENWEBUI_BASE_URL?.trim()) {
    return (
      process.env.OPENWEBUI_MODEL?.trim() || settings.claudeModel || process.env.CLAUDE_MODEL || ""
    );
  }
  return settings.claudeModel || process.env.CLAUDE_MODEL || "claude-opus-4-6";
}

export async function getClaudeEffort(): Promise<"low" | "medium" | "high" | "max"> {
  const settings = await loadRuntimeSettings();
  const effort = settings.claudeEffort || process.env.CLAUDE_EFFORT;
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "max") {
    return effort;
  }
  return "high";
}

export async function getMaxTurns(): Promise<number> {
  const settings = await loadRuntimeSettings();
  return settings.maxTurns || parseInt(process.env.OPSBLAZE_MAX_TURNS ?? "30", 10);
}

export async function getStreamTimeoutMs(): Promise<number> {
  const settings = await loadRuntimeSettings();
  return (
    settings.streamTimeoutMs || parseInt(process.env.OPSBLAZE_STREAM_TIMEOUT_MS ?? "300000", 10)
  );
}

export async function getMaxHistory(): Promise<number> {
  const settings = await loadRuntimeSettings();
  return settings.maxHistory || parseInt(process.env.OPSBLAZE_MAX_HISTORY ?? "20", 10);
}

export async function getMaxMessageLen(): Promise<number> {
  const settings = await loadRuntimeSettings();
  return settings.maxMessageLen || parseInt(process.env.OPSBLAZE_MAX_MESSAGE_LEN ?? "10000", 10);
}

export async function getLogLevel(): Promise<string> {
  const settings = await loadRuntimeSettings();
  return settings.logLevel || process.env.LOG_LEVEL || "info";
}

export async function getRedactionSettings(): Promise<RedactionSettings> {
  const settings = await loadRuntimeSettings();
  return normalizeRedactionSettings(settings.redaction ?? defaultRedactionSettings());
}

export async function getConfiguredSkillPacks(): Promise<SkillPack[]> {
  const { getStoredSkillPacks } = await import("./skill-packs.js");
  const settings = await loadRuntimeSettings();
  return getStoredSkillPacks(settings.skillPacks);
}
