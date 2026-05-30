export const UNCATEGORIZED_LABEL = "Uncategorized";

/**
 * Map a leading name token to a display label so legacy playbooks (created
 * before the explicit `category` field) still group sensibly. Keyed by the
 * lowercased first word of the playbook name.
 */
const PREFIX_LABELS: Record<string, string> = {
  duo: "Duo",
  okta: "Okta",
  workday: "Workday",
  splunk: "Splunk",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  o365: "Microsoft 365",
  m365: "Microsoft 365",
};

interface CategorizablePlaybook {
  category?: string;
  name: string;
}

/** Explicit category wins; otherwise derive from the name prefix; else "Uncategorized". */
export function getPlaybookCategory(pb: CategorizablePlaybook): string {
  const explicit = pb.category?.trim();
  if (explicit) return explicit;
  const match = pb.name
    .trim()
    .toLowerCase()
    .match(/^([a-z0-9]+)[\s:_-]/);
  if (match) {
    const label = PREFIX_LABELS[match[1]];
    if (label) return label;
  }
  return UNCATEGORIZED_LABEL;
}

export interface PlaybookGroup<T> {
  category: string;
  items: T[];
}

/**
 * Group playbooks by (explicit or derived) category. Categories are sorted
 * alphabetically with "Uncategorized" pinned last. Item order within each
 * group is preserved from the input.
 */
export function groupPlaybooksByCategory<T extends CategorizablePlaybook>(
  playbooks: T[]
): PlaybookGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const pb of playbooks) {
    const cat = getPlaybookCategory(pb);
    const arr = groups.get(cat);
    if (arr) arr.push(pb);
    else groups.set(cat, [pb]);
  }
  return [...groups.entries()]
    .sort((a, b) => {
      if (a[0] === UNCATEGORIZED_LABEL) return 1;
      if (b[0] === UNCATEGORIZED_LABEL) return -1;
      return a[0].localeCompare(b[0]);
    })
    .map(([category, items]) => ({ category, items }));
}
