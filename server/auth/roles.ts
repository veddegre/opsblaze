/** Parse comma-separated env values (groups, emails). */
export function parseCsvEnvSet(raw: string | undefined): Set<string> {
  const set = new Set<string>();
  if (!raw?.trim()) return set;
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (t) set.add(t.toLowerCase());
  }
  return set;
}

export function normalizeGroupName(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Extract group/role names from OIDC claims or UserInfo (IdP-specific shapes).
 */
export function extractGroupsFromClaims(claims: Record<string, unknown>): string[] {
  const found = new Set<string>();

  const addValue = (value: unknown): void => {
    if (typeof value === "string" && value.trim()) {
      found.add(normalizeGroupName(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) addValue(item);
      return;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (typeof obj.name === "string" && obj.name.trim()) {
        found.add(normalizeGroupName(obj.name));
      } else if (typeof obj.id === "string" && obj.id.trim()) {
        found.add(normalizeGroupName(obj.id));
      }
    }
  };

  for (const key of ["groups", "roles", "memberOf", "group"]) {
    if (key in claims) addValue(claims[key]);
  }

  return [...found];
}

export function resolveIsAdmin(opts: {
  adminEmails: Set<string>;
  adminGroups: Set<string>;
  allUsersAdmin: boolean;
  email?: string;
  groups: string[];
}): boolean {
  if (opts.allUsersAdmin) return true;

  const email = opts.email?.trim().toLowerCase();
  if (email && opts.adminEmails.has(email)) return true;

  for (const g of opts.groups) {
    if (opts.adminGroups.has(normalizeGroupName(g))) return true;
  }

  return false;
}
