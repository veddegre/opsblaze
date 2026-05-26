import type { StoredConversation } from "./conversations.js";

export const REDACTION_PLACEHOLDER = "[REDACTED]";

export interface RedactionBuiltinFlags {
  email?: boolean;
  ipv4?: boolean;
  mac?: boolean;
}

export interface RedactionSettings {
  /** When true, exports include redaction unless `?redact=0`. */
  applyOnExport?: boolean;
  builtin?: RedactionBuiltinFlags;
  /** Literal strings (case-insensitive), longest matched first. */
  customStrings?: string[];
  /** Additional regex patterns (max 20, validated at save time). */
  customPatterns?: string[];
}

export interface RedactionApplyOptions {
  settings: RedactionSettings;
  /** Per-investigation literals merged with settings.customStrings. */
  conversationStrings?: string[];
}

const EMAIL_RE =
  /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;

const MAC_RE = /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseStringList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function validateCustomPatterns(patterns: string[]): string[] {
  const errors: string[] = [];
  if (patterns.length > 20) {
    errors.push("At most 20 custom regex patterns are allowed");
  }
  for (const p of patterns) {
    if (p.length > 200) {
      errors.push("Each custom pattern must be at most 200 characters");
      return errors;
    }
    try {
      // eslint-disable-next-line no-new
      new RegExp(p);
    } catch {
      errors.push(`Invalid regex pattern: ${p.slice(0, 40)}`);
    }
  }
  return errors;
}

function buildBuiltinPatterns(flags: RedactionBuiltinFlags): RegExp[] {
  const patterns: RegExp[] = [];
  if (flags.email !== false) patterns.push(EMAIL_RE);
  if (flags.ipv4 !== false) patterns.push(IPV4_RE);
  if (flags.mac) patterns.push(MAC_RE);
  return patterns;
}

function buildLiteralPatterns(strings: string[]): RegExp[] {
  const sorted = [...strings].filter(Boolean).sort((a, b) => b.length - a.length);
  const patterns: RegExp[] = [];
  for (const s of sorted) {
    patterns.push(new RegExp(escapeRegexLiteral(s), "gi"));
  }
  return patterns;
}

function buildCustomRegexPatterns(patterns: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const p of patterns) {
    if (!p.trim()) continue;
    try {
      out.push(new RegExp(p, "gi"));
    } catch {
      /* validated at save */
    }
  }
  return out;
}

export function compileRedactionPatterns(options: RedactionApplyOptions): RegExp[] {
  const { settings, conversationStrings = [] } = options;
  const builtin = settings.builtin ?? { email: true, ipv4: true, mac: false };
  const globals = settings.customStrings ?? [];
  const literals = [...globals, ...conversationStrings];

  return [
    ...buildBuiltinPatterns(builtin),
    ...buildLiteralPatterns(literals),
    ...buildCustomRegexPatterns(settings.customPatterns ?? []),
  ];
}

export function redactText(text: string, patterns: RegExp[]): string {
  if (!text || patterns.length === 0) return text;
  let out = text;
  for (const pattern of patterns) {
    out = out.replace(pattern, REDACTION_PLACEHOLDER);
  }
  return out;
}

function redactUnknown(value: unknown, patterns: RegExp[]): unknown {
  if (typeof value === "string") return redactText(value, patterns);
  if (Array.isArray(value)) return value.map((v) => redactUnknown(v, patterns));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      next[k] = redactUnknown(v, patterns);
    }
    return next;
  }
  return value;
}

/** Returns a deep-cloned conversation with redaction applied (does not mutate input). */
export function redactConversation(
  conv: StoredConversation,
  options: RedactionApplyOptions
): StoredConversation {
  const patterns = compileRedactionPatterns(options);
  if (patterns.length === 0) return conv;

  return {
    ...conv,
    title: redactText(conv.title, patterns),
    messages: redactUnknown(conv.messages, patterns) as StoredConversation["messages"],
  };
}

export function defaultRedactionSettings(): RedactionSettings {
  return {
    applyOnExport: false,
    builtin: { email: true, ipv4: true, mac: false },
    customStrings: [],
    customPatterns: [],
  };
}

export function normalizeRedactionSettings(
  partial?: RedactionSettings | null
): RedactionSettings {
  const base = defaultRedactionSettings();
  if (!partial) return base;
  return {
    applyOnExport: partial.applyOnExport ?? base.applyOnExport,
    builtin: { ...base.builtin, ...partial.builtin },
    customStrings: partial.customStrings ?? base.customStrings,
    customPatterns: partial.customPatterns ?? base.customPatterns,
  };
}
