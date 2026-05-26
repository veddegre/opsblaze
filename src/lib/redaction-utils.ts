/** Client-side mirror of server parseStringList (kept in sync for textarea editing). */
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

export function formatStringList(items: string[] | undefined): string {
  return (items ?? []).join("\n");
}
