/**
 * Recognizes `enrich_ips` tool output and turns it into a structured
 * `threatintel` SSE event. The client carries it as a message block so the
 * enrichment is persisted with the conversation (reproducible reports) instead
 * of only living in the model's prose.
 */

export interface ThreatIntelResult {
  provider: "virustotal" | "abuseipdb";
  ip: string;
  ok: boolean;
  summary: string;
  link?: string;
}

/**
 * Parse an MCP tool-result text payload. Returns the per-provider IP results
 * only when the payload is an `enrich_ips` response (it carries both
 * `providersUsed` and `results`), otherwise `null` so other tool results
 * (Splunk queries, zone classification) are ignored.
 */
export function parseThreatIntelResults(text: string): ThreatIntelResult[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.providersUsed) || !Array.isArray(obj.results)) return null;

  const out: ThreatIntelResult[] = [];
  for (const r of obj.results) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const provider = rec.provider;
    const ip = rec.ip;
    if (provider !== "virustotal" && provider !== "abuseipdb") continue;
    if (typeof ip !== "string" || !ip) continue; // skip the "no providers" placeholder
    out.push({
      provider,
      ip,
      ok: Boolean(rec.ok),
      summary: typeof rec.summary === "string" ? rec.summary : "",
      ...(typeof rec.link === "string" && rec.link ? { link: rec.link } : {}),
    });
  }
  return out.length > 0 ? out : null;
}

export function emitThreatIntelResults(
  text: string,
  emit: (event: string, data: unknown) => void
): void {
  const results = parseThreatIntelResults(text);
  if (results) emit("threatintel", { results });
}
