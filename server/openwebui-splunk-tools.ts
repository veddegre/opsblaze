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

/** Normalize model tool args to MCP splunk_query schema (models often send `query` not `spl`). */
export function normalizeSplunkToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };

  if (!out.spl) {
    if (typeof out.query === "string") out.spl = out.query;
    else if (typeof out.SPL === "string") out.spl = out.SPL;
  }
  delete out.query;
  delete out.SPL;

  const viz = out.viz_type ?? out.vizType;
  if (typeof viz === "string") {
    out.viz_type = viz;
  } else if (!out.viz_type) {
    out.viz_type = "table";
  }
  delete out.vizType;

  if (!out.earliest) out.earliest = "-24h";
  if (!out.latest) out.latest = "now";

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
