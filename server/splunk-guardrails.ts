import { z } from "zod";
import { parseCsvEnvSet } from "./auth/roles.js";

const splunkGuardrailsSchema = z.object({
  /** Empty = allow any index (default). */
  allowedIndexes: z.array(z.string().min(1).max(128)).max(50).optional(),
  /** Max search window in hours (earliest→latest). Default 168 (7 days). */
  maxTimeRangeHours: z.number().int().min(1).max(8760).optional(),
});

export type SplunkGuardrails = z.infer<typeof splunkGuardrailsSchema>;

const DEFAULT_MAX_HOURS = 168;

export interface SplunkGuardrailContext {
  isAdmin?: boolean;
}

/** Server-wide guardrails from runtime settings (before admin env overrides). */
export async function getSplunkGuardrails(): Promise<Required<SplunkGuardrails>> {
  const { loadRuntimeSettings } = await import("./runtime-settings.js");
  const settings = await loadRuntimeSettings();
  const parsed = splunkGuardrailsSchema.safeParse(settings.splunkGuardrails ?? {});
  const g = parsed.success ? parsed.data : {};
  return {
    allowedIndexes: g.allowedIndexes ?? [],
    maxTimeRangeHours: g.maxTimeRangeHours ?? DEFAULT_MAX_HOURS,
  };
}

export interface SplunkAdminGuardEnv {
  /** When true, admins are not restricted by the index allowlist (time window still applies). */
  bypassIndexes: boolean;
  /** Extra indexes unioned into the allowlist for admins (ignored if bypassIndexes). */
  extraIndexes: string[];
}

export function getSplunkAdminGuardEnv(): SplunkAdminGuardEnv {
  const bypassRaw = process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_BYPASS_INDEXES?.trim().toLowerCase();
  const bypassIndexes = bypassRaw === "true" || bypassRaw === "1" || bypassRaw === "yes";
  const extra = [...parseCsvEnvSet(process.env.OPSBLAZE_SPLUNK_GUARD_ADMIN_EXTRA_INDEXES)];
  return { bypassIndexes, extraIndexes: extra };
}

/** Effective guardrails for a user (global settings + optional admin env break-glass). */
export async function resolveSplunkGuardrails(
  ctx?: SplunkGuardrailContext
): Promise<Required<SplunkGuardrails>> {
  const base = await getSplunkGuardrails();
  return applySplunkGuardrailsForUser(base, ctx);
}

export function applySplunkGuardrailsForUser(
  base: Required<SplunkGuardrails>,
  ctx?: SplunkGuardrailContext
): Required<SplunkGuardrails> {
  if (!ctx?.isAdmin) return base;

  const admin = getSplunkAdminGuardEnv();
  if (admin.bypassIndexes) {
    return { ...base, allowedIndexes: [] };
  }

  if (admin.extraIndexes.length > 0 && base.allowedIndexes.length > 0) {
    const merged = new Set(
      [...base.allowedIndexes, ...admin.extraIndexes].map((i) => i.toLowerCase())
    );
    return { ...base, allowedIndexes: [...merged] };
  }

  return base;
}

export function parseIndexesFromSpl(spl: string): string[] {
  const indexes = new Set<string>();
  const re = /\bindex\s*=\s*([^\s|]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(spl)) !== null) {
    let raw = m[1].trim();
    if (raw.startsWith("(")) continue;
    raw = raw.replace(/^["']|["']$/g, "");
    if (raw === "*") {
      indexes.add("*");
    } else if (raw) {
      indexes.add(raw.toLowerCase());
    }
  }
  return [...indexes];
}

/** Rough relative-time → hours for guardrail checks. */
export function estimateTimeRangeHours(earliest: string, latest: string): number | null {
  const e = earliest.trim().toLowerCase();
  const l = latest.trim().toLowerCase();

  if (e === "0" && (l === "now" || l === "")) {
    return 8760;
  }

  const parseOffset = (token: string): number | null => {
    const m = token.match(/^(-?)(\d+)([smhdw])(?:@([dh]))?$/);
    if (!m) return null;
    const sign = m[1] === "-" ? -1 : 1;
    const n = parseInt(m[2], 10);
    const unit = m[3];
    const mult =
      unit === "s" ? 1 / 3600 : unit === "m" ? 1 / 60 : unit === "h" ? 1 : unit === "d" ? 24 : 168;
    return sign * n * mult;
  };

  if (e.startsWith("-") && (l === "now" || l.startsWith("+") || l === "")) {
    const hours = parseOffset(e);
    return hours === null ? null : Math.abs(hours);
  }

  const eEpoch = /^\d{9,11}$/.test(e) ? parseInt(e, 10) : null;
  const lEpoch = /^\d{9,11}$/.test(l) ? parseInt(l, 10) : l === "now" ? Math.floor(Date.now() / 1000) : null;
  if (eEpoch !== null && lEpoch !== null && lEpoch >= eEpoch) {
    return (lEpoch - eEpoch) / 3600;
  }

  return null;
}

export function validateSplunkQuery(
  guardrails: Required<SplunkGuardrails>,
  spl: string,
  earliest: string,
  latest: string
): string | null {
  const allowed = guardrails.allowedIndexes.map((i) => i.toLowerCase());
  if (allowed.length > 0) {
    const used = parseIndexesFromSpl(spl);
    if (used.length === 0) {
      return `SPL must include an allowed index (e.g. index=${allowed[0]}). Allowed: ${allowed.join(", ")}`;
    }
    for (const idx of used) {
      if (idx === "*") {
        return `index=* is not allowed. Use one of: ${allowed.join(", ")}`;
      }
      if (!allowed.includes(idx)) {
        return `index=${idx} is not allowed. Allowed indexes: ${allowed.join(", ")}`;
      }
    }
  }

  const hours = estimateTimeRangeHours(earliest, latest);
  if (hours !== null && hours > guardrails.maxTimeRangeHours) {
    return `Time range (~${Math.round(hours)}h) exceeds the maximum of ${guardrails.maxTimeRangeHours} hours. Narrow earliest/latest.`;
  }

  return null;
}

export { splunkGuardrailsSchema };
