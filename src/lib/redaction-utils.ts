/** Mirrors server limits in `server/redaction.ts`. */
export const MAX_EXPORT_REDACTION_TERM_LEN = 200;
export const MAX_EXPORT_REDACTION_TERMS = 100;
export const MAX_EXPORT_REDACTION_TOTAL_LEN = 10_000;

/** Client-side mirror of server parseStringList (kept in sync for textarea editing). */
export function parseStringList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let totalLen = 0;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim().slice(0, MAX_EXPORT_REDACTION_TERM_LEN);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    if (out.length >= MAX_EXPORT_REDACTION_TERMS) break;
    if (totalLen + t.length > MAX_EXPORT_REDACTION_TOTAL_LEN) break;
    seen.add(key);
    out.push(t);
    totalLen += t.length;
  }
  return out;
}

export function formatStringList(items: string[] | undefined): string {
  return (items ?? []).join("\n");
}
