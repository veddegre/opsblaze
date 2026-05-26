import React, { useCallback, useEffect, useState } from "react";
import {
  createPlaybook,
  deletePlaybook,
  listPlaybooks,
  type InvestigationPlaybook,
} from "../../lib/playbooks-api";
import { listSkillsApi, type SkillInfo } from "../../lib/settings-api";
import { SkillMultiSelect } from "./SkillMultiSelect";
import { FieldLabel, inputClass, monoInputClass } from "./settings-ui";

interface PlaybooksEditorProps {
  disabled?: boolean;
}

export function PlaybooksEditor({ disabled }: PlaybooksEditorProps) {
  const [playbooks, setPlaybooks] = useState<InvestigationPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [strict, setStrict] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlaybooks(await listPlaybooks());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    listSkillsApi()
      .then(setAvailableSkills)
      .catch(() => {});
  }, [refresh]);

  const handleCreate = async () => {
    if (!name.trim() || !prompt.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createPlaybook({ name: name.trim(), prompt: prompt.trim(), skills, strict });
      setName("");
      setPrompt("");
      setSkills([]);
      setStrict(true);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePlaybook(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-600">
        Saved prompts investigators can run from the input bar. Each playbook sets the question text
        and optional skills.
      </p>
      {loading && playbooks.length === 0 && (
        <p className="text-xs text-gray-500">Loading playbooks…</p>
      )}
      {playbooks.length > 0 && (
        <ul className="space-y-2">
          {playbooks.map((pb) => (
            <li
              key={pb.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-200">{pb.name}</p>
                <p className="text-[11px] text-gray-500 line-clamp-2">{pb.prompt}</p>
                {pb.skills.length > 0 && (
                  <p className="text-[10px] text-gray-600 mt-1">Skills: {pb.skills.join(", ")}</p>
                )}
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleDelete(pb.id)}
                  className="text-[10px] text-red-400 hover:text-red-300 shrink-0"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="space-y-2 border-t border-border-subtle pt-4">
          <FieldLabel>New playbook</FieldLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Failed auth events (24h)"
            className={inputClass}
          />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Investigate failed authentication events in the last 24 hours…"
            rows={3}
            className={`${monoInputClass} resize-y min-h-[4rem]`}
          />
          <p className="text-[11px] text-gray-500">Skills (optional)</p>
          <SkillMultiSelect
            value={skills}
            onChange={setSkills}
            availableSkills={availableSkills}
          />
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) => setStrict(e.target.checked)}
              className="rounded border-border-subtle"
            />
            Only selected skills (strict)
          </label>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !name.trim() || !prompt.trim()}
            className="text-xs px-3 py-1.5 rounded-md bg-accent text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add playbook"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
