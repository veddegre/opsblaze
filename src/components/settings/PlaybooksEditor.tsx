import React, { useCallback, useEffect, useState } from "react";
import {
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
  listPlaybooks,
  type InvestigationPlaybook,
} from "../../lib/playbooks-api";
import { listSkillsApi, type SkillInfo } from "../../lib/settings-api";
import { SkillMultiSelect } from "./SkillMultiSelect";
import { FieldLabel, InfoBanner, inputClass, monoInputClass } from "./settings-ui";

interface PlaybooksEditorProps {
  disabled?: boolean;
  onPlaybooksChanged?: () => void;
}

export function PlaybooksEditor({ disabled, onPlaybooksChanged }: PlaybooksEditorProps) {
  const [playbooks, setPlaybooks] = useState<InvestigationPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [strict, setStrict] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const loadSkills = useCallback(() => {
    listSkillsApi()
      .then(setAvailableSkills)
      .catch(() => setAvailableSkills([]));
  }, []);

  useEffect(() => {
    refresh();
    loadSkills();
  }, [refresh, loadSkills]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPrompt("");
    setSkills([]);
    setStrict(true);
  };

  const startEdit = (pb: InvestigationPlaybook) => {
    setEditingId(pb.id);
    setName(pb.name);
    setPrompt(pb.prompt);
    setSkills(pb.skills);
    setStrict(pb.strict);
    setSuccess(null);
    setError(null);
    loadSkills();
  };

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingId) {
        await updatePlaybook(editingId, {
          name: name.trim(),
          prompt: prompt.trim(),
          skills,
          strict,
        });
        setSuccess("Playbook updated. Use the Playbooks menu below the chat box.");
      } else {
        await createPlaybook({ name: name.trim(), prompt: prompt.trim(), skills, strict });
        setSuccess("Playbook saved. Use the Playbooks menu below the chat box.");
      }
      resetForm();
      await refresh();
      onPlaybooksChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePlaybook(id);
      if (editingId === id) resetForm();
      await refresh();
      onPlaybooksChanged?.();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <InfoBanner>
        Investigation playbooks are saved with the <strong className="text-gray-300">Save playbook</strong>{" "}
        button here — not <strong className="text-gray-300">Save runtime settings</strong> above. After saving,
        close Settings and open the <strong className="text-gray-300">Playbooks</strong> menu under the message
        box.
      </InfoBanner>

      {loading && playbooks.length === 0 && (
        <p className="text-xs text-gray-500">Loading playbooks…</p>
      )}

      {!loading && playbooks.length === 0 && (
        <p className="text-xs text-gray-500 italic">No playbooks yet — create one below.</p>
      )}

      {playbooks.length > 0 && (
        <ul className="space-y-2">
          {playbooks.map((pb) => (
            <li
              key={pb.id}
              className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 ${
                editingId === pb.id
                  ? "border-accent/40 bg-accent/5"
                  : "border-border-subtle"
              }`}
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-200">{pb.name}</p>
                <p className="text-[11px] text-gray-500 line-clamp-2">{pb.prompt}</p>
                {pb.skills.length > 0 ? (
                  <p className="text-[10px] text-gray-600 mt-1 font-mono">
                    Skills: {pb.skills.join(", ")}
                  </p>
                ) : (
                  <p className="text-[10px] text-amber-500/80 mt-1">No skills attached</p>
                )}
              </div>
              {!disabled && (
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(pb)}
                    className="text-[10px] text-accent hover:text-accent-light"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(pb.id)}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="space-y-2 border-t border-border-subtle pt-4">
          <FieldLabel>{editingId ? "Edit playbook" : "New playbook"}</FieldLabel>
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
          <p className="text-[11px] text-gray-500">
            Skills (optional) — includes deploy-only skills from <span className="font-mono">_local/</span>
          </p>
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !name.trim() || !prompt.trim()}
              className="text-sm px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId ? "Save playbook" : "Save playbook"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                Cancel edit
              </button>
            )}
          </div>
        </div>
      )}

      {success && <p className="text-xs text-green-400">{success}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
