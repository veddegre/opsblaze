import { fetchOpenWebUiModels } from "./openwebui-client.js";

export interface OpenWebUiModelOption {
  id: string;
  label: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractModelArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const root = asRecord(data);
  if (!root) return [];
  for (const key of ["data", "items", "models"] as const) {
    const arr = root[key];
    if (Array.isArray(arr)) return arr;
  }
  return [];
}

function extractModelId(item: unknown): string | null {
  if (typeof item === "string" && item.trim()) return item.trim();
  const rec = asRecord(item);
  if (!rec) return null;
  for (const key of ["id", "model", "name"] as const) {
    const val = rec[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
}

function extractModelLabel(item: unknown, id: string): string {
  const rec = asRecord(item);
  if (!rec) return id;
  const name = rec.name;
  if (typeof name === "string" && name.trim() && name.trim() !== id) {
    return name.trim();
  }
  const title = rec.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return id;
}

/** Normalize Open WebUI / Ollama / OpenAI-style model list responses. */
export function parseOpenWebUiModelsResponse(data: unknown): OpenWebUiModelOption[] {
  const seen = new Set<string>();
  const out: OpenWebUiModelOption[] = [];

  for (const item of extractModelArray(data)) {
    const id = extractModelId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: extractModelLabel(item, id) });
  }

  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return out;
}

export async function listOpenWebUiModelOptions(
  signal?: AbortSignal
): Promise<OpenWebUiModelOption[]> {
  const data = await fetchOpenWebUiModels(signal);
  return parseOpenWebUiModelsResponse(data);
}
