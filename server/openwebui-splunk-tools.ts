/**
 * Splunk MCP helpers for the Open WebUI agent loop — argument normalization,
 * compact tool results for the LLM, and duplicate-query detection.
 */

export interface SplunkToolResultShape {
  summary: string;
  chart?: unknown;
  suppressed?: boolean;
  queryMeta?: { spl: string; earliest: string; latest: string };
}

const SYNTHESIS_NUDGE =
  "Stop calling splunk_query. You already have Splunk tool results above. " +
  "Write a clear narrative summary of findings for the analyst. Do not run more searches.";

/** Max agent↔LLM rounds that only execute tools before forcing a no-tools synthesis turn. */
export const DEFAULT_MAX_TOOL_ROUNDS = 6;

export function synthesisNudgeMessage(): string {
  return SYNTHESIS_NUDGE;
}

/** Strip wrapping quotes models sometimes include in SPL strings. */
export function stripSplWrapping(s: string): string {
  let t = s.trim();
  while (
    (t.startsWith("'") && t.endsWith("'") && t.length > 1) ||
    (t.startsWith('"') && t.endsWith('"') && t.length > 1)
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** True when a value is a time bound, not SPL (models often put these in `spl`). */
export function isTimeOnlyMisplacedAsSpl(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (t === "0" || t === "now") return true;
  if (/^[-+]?\d+[smhdw]?(@[dh])?$/.test(t)) return true;
  if (/^\d{9,11}$/.test(t)) return true;
  return false;
}

const SPL_ARG_KEYS = ["spl", "query", "SPL", "search", "spl_query"] as const;

/** Pull SPL from tool args; ignores numeric-only and time-token mistakes. */
export function extractSplFromToolArgs(args: Record<string, unknown>): string | null {
  const candidates: string[] = [];
  for (const key of SPL_ARG_KEYS) {
    const v = args[key];
    if (typeof v === "string") {
      const s = stripSplWrapping(v);
      if (s) candidates.push(s);
    }
  }
  for (const s of candidates) {
    if (!isTimeOnlyMisplacedAsSpl(s)) return s;
  }
  return candidates[0] ?? null;
}

/** User-facing validation before calling Splunk. */
export function validateSplunkToolArgs(args: Record<string, unknown>): string | null {
  const spl = extractSplFromToolArgs(args);
  if (!spl) {
    return (
      'Missing SPL. The spl (or query) field must be a search such as index=_audit | stats count — not a number or empty value.'
    );
  }
  if (isTimeOnlyMisplacedAsSpl(spl)) {
    return (
      `SPL must be a search pipeline, not a time value ("${spl}"). ` +
      'Use earliest="0" and latest="now" on the tool for all-time, or earliest="-7d" for the last 7 days.'
    );
  }
  return null;
}

/** Normalize model tool args to MCP splunk_query schema (models often send `query` not `spl`). */
export function normalizeSplunkToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };

  const spl = extractSplFromToolArgs(out);
  if (spl) out.spl = spl;
  else delete out.spl;

  for (const key of SPL_ARG_KEYS) {
    if (key !== "spl") delete out[key];
  }

  const viz = out.viz_type ?? out.vizType;
  if (typeof viz === "string") {
    out.viz_type = viz;
  } else if (!out.viz_type) {
    out.viz_type = "table";
  }
  delete out.vizType;

  if (out.earliest == null || String(out.earliest).trim() === "") {
    out.earliest = "-24h";
  } else {
    out.earliest = String(out.earliest);
  }
  if (out.latest == null || String(out.latest).trim() === "") {
    out.latest = "now";
  } else {
    out.latest = String(out.latest);
  }

  return out;
}

/** Stable key for duplicate detection. */
export function splQueryFingerprint(args: Record<string, unknown>): string {
  const normalized = normalizeSplunkToolArgs(args);
  const spl = String(normalized.spl ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const earliest = String(normalized.earliest ?? "-24h").trim();
  const latest = String(normalized.latest ?? "now").trim();
  return `${earliest}\0${latest}\0${spl.toLowerCase()}`;
}

/**
 * Strip large chart payloads before sending tool output back to Open WebUI.
 * Charts are already streamed to the browser via SSE.
 */
export function compactSplunkToolResultForModel(text: string, maxLen = 12_000): string {
  try {
    const parsed = JSON.parse(text) as SplunkToolResultShape;
    const compact: Record<string, unknown> = {
      summary: parsed.summary,
      suppressed: parsed.suppressed ?? false,
      hasChartForUi: Boolean(parsed.chart && !parsed.suppressed),
      queryMeta: parsed.queryMeta,
    };
    if (parsed.chart && !parsed.suppressed) {
      compact.note =
        "Chart data was rendered in the OpsBlaze UI. Use the summary field for analysis.";
    }
    const out = JSON.stringify(compact);
    return out.length > maxLen ? `${out.slice(0, maxLen)}…[truncated]` : out;
  } catch {
    return text.length > maxLen ? `${text.slice(0, maxLen)}…[truncated]` : text;
  }
}

export function duplicateSplunkToolContent(priorCompactJson: string): string {
  try {
    const prior = JSON.parse(priorCompactJson) as SplunkToolResultShape;
    return JSON.stringify({
      summary:
        `Duplicate query (not re-run). Prior result: ${prior.summary}`.slice(0, 4000),
      suppressed: prior.suppressed,
      hasChartForUi: false,
      queryMeta: prior.queryMeta,
      duplicate: true,
    });
  } catch {
    return JSON.stringify({
      summary: "Duplicate query (not re-run). Use the prior tool result in the conversation.",
      duplicate: true,
    });
  }
}

export function buildFallbackInvestigationSummary(executed: Map<string, string>): string {
  if (executed.size === 0) {
    return (
      "The investigation hit the search step limit without collecting Splunk results. " +
      "Try narrowing the time range or simplifying the question."
    );
  }

  const parts = [
    "### Investigation results\n",
    "The assistant kept requesting Splunk searches without finishing the analysis. ",
    "Here is what was collected:\n",
  ];

  let i = 1;
  for (const text of executed.values()) {
    try {
      const parsed = JSON.parse(text) as SplunkToolResultShape;
      const spl = parsed.queryMeta?.spl ?? "(unknown SPL)";
      parts.push(`\n#### Search ${i}\n\`\`\`\n${spl}\n\`\`\`\n\n${parsed.summary}\n`);
    } catch {
      parts.push(`\n#### Search ${i}\n\n${text.slice(0, 2000)}\n`);
    }
    i++;
  }

  return parts.join("");
}
