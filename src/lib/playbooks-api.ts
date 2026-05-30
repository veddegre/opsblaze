function headers(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

function fetchInit(init?: RequestInit): RequestInit {
  return { credentials: "include", ...init };
}

export interface InvestigationPlaybook {
  id: string;
  name: string;
  prompt: string;
  skills: string[];
  strict: boolean;
  updatedAt: string;
}

export async function listPlaybooks(): Promise<InvestigationPlaybook[]> {
  const res = await fetch("/api/playbooks", fetchInit({ headers: headers() }));
  if (!res.ok) throw new Error(`Failed to list playbooks: ${res.status}`);
  const data = (await res.json()) as { playbooks: InvestigationPlaybook[] };
  return data.playbooks ?? [];
}

export async function createPlaybook(input: {
  name: string;
  prompt: string;
  skills?: string[];
  strict?: boolean;
  id?: string;
}): Promise<InvestigationPlaybook> {
  const res = await fetch(
    "/api/playbooks",
    fetchInit({ method: "POST", headers: headers(), body: JSON.stringify(input) })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `Failed to create playbook: ${res.status}`
    );
  }
  return res.json();
}

export async function updatePlaybook(
  id: string,
  input: {
    name: string;
    prompt: string;
    skills?: string[];
    strict?: boolean;
  }
): Promise<InvestigationPlaybook> {
  const res = await fetch(
    `/api/playbooks/${encodeURIComponent(id)}`,
    fetchInit({
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(input),
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `Failed to update playbook: ${res.status}`
    );
  }
  return res.json();
}

export async function deletePlaybook(id: string): Promise<void> {
  const res = await fetch(
    `/api/playbooks/${encodeURIComponent(id)}`,
    fetchInit({ method: "DELETE" })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `Failed to delete playbook: ${res.status}`
    );
  }
}

export interface AuditEvent {
  ts: string;
  userId: string;
  action: string;
  detail?: Record<string, unknown>;
}

export interface AuditQuery {
  limit?: number;
  action?: string;
  /** Case-insensitive substring match on user. */
  user?: string;
  /** ISO datetime lower bound (inclusive). */
  from?: string;
  /** ISO datetime upper bound (inclusive). */
  to?: string;
}

export async function listAuditEvents(arg: number | AuditQuery = 200): Promise<AuditEvent[]> {
  const q: AuditQuery = typeof arg === "number" ? { limit: arg } : arg;
  const params = new URLSearchParams();
  params.set("limit", String(q.limit ?? 200));
  if (q.action) params.set("action", q.action);
  if (q.user?.trim()) params.set("user", q.user.trim());
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  const res = await fetch(`/api/audit?${params.toString()}`, fetchInit({ headers: headers() }));
  if (!res.ok) throw new Error(`Failed to load audit log: ${res.status}`);
  const data = (await res.json()) as { events: AuditEvent[] };
  return data.events ?? [];
}
