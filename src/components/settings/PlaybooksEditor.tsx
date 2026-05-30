import React, { useCallback, useEffect, useRef, useState } from "react";
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

interface PlaybookFormState {
  name: string;
  prompt: string;
  skills: string[];
  strict: boolean;
}

const emptyForm = (): PlaybookFormState => ({
  name: "",
  prompt: "",
  skills: [],
  strict: true,
});

function PlaybookFormFields({
  form,
  onChange,
  availableSkills,
  skillsLoading,
  idPrefix,
}: {
  form: PlaybookFormState;
  onChange: (patch: Partial<PlaybookFormState>) => void;
  availableSkills: SkillInfo[];
  skillsLoading: boolean;
  idPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
      <input
        id={`${idPrefix}-name`}
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Failed auth events (24h)"
        className={inputClass}
      />
      <FieldLabel htmlFor={`${idPrefix}-prompt`}>Investigation prompt</FieldLabel>
      <textarea
        id={`${idPrefix}-prompt`}
        value={form.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        placeholder="Investigate failed authentication events in the last 24 hours…"
        rows={3}
        className={`${monoInputClass} resize-y min-h-[4rem]`}
      />
      <p className="text-[11px] text-gray-500">
        Skills (optional) — includes deploy-only skills from{" "}
        <span className="font-mono">_local/</span>
      </p>
      <SkillMultiSelect
        value={form.skills}
        onChange={(skills) => onChange({ skills })}
        availableSkills={availableSkills}
        loading={skillsLoading}
      />
      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input
          type="checkbox"
          checked={form.strict}
          onChange={(e) => onChange({ strict: e.target.checked })}
          className="rounded border-border-subtle"
        />
        Only selected skills (strict)
      </label>
    </div>
  );
}

export function PlaybooksEditor({ disabled, onPlaybooksChanged }: PlaybooksEditorProps) {
  const [playbooks, setPlaybooks] = useState<InvestigationPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PlaybookFormState>(emptyForm);
  const [newForm, setNewForm] = useState<PlaybookFormState>(emptyForm);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const editSectionRef = useRef<HTMLLIElement>(null);

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
    setSkillsLoading(true);
    listSkillsApi()
      .then(setAvailableSkills)
      .catch(() => setAvailableSkills([]))
      .finally(() => setSkillsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    loadSkills();
  }, [refresh, loadSkills]);

  const startEdit = (pb: InvestigationPlaybook) => {
    setEditingId(pb.id);
    setEditForm({
      name: pb.name,
      prompt: pb.prompt,
      skills: pb.skills,
      strict: pb.strict,
    });
    setSuccess(null);
    setError(null);
    loadSkills();
    requestAnimationFrame(() => {
      editSectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm());
  };

  const handleUpdate = async () => {
    if (!editingId || !editForm.name.trim() || !editForm.prompt.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updatePlaybook(editingId, {
        name: editForm.name.trim(),
        prompt: editForm.prompt.trim(),
        skills: editForm.skills,
        strict: editForm.strict,
      });
      setSuccess("Playbook updated.");
      cancelEdit();
      await refresh();
      onPlaybooksChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newForm.name.trim() || !newForm.prompt.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createPlaybook({
        name: newForm.name.trim(),
        prompt: newForm.prompt.trim(),
        skills: newForm.skills,
        strict: newForm.strict,
      });
      setSuccess("Playbook created. Use the Playbooks menu below the chat box.");
      setNewForm(emptyForm());
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
      if (editingId === id) cancelEdit();
      await refresh();
      onPlaybooksChanged?.();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const canSaveEdit = Boolean(
    editingId && editForm.name.trim() && editForm.prompt.trim() && !saving
  );
  const canSaveNew = Boolean(newForm.name.trim() && newForm.prompt.trim() && !saving && !editingId);

  return (
    <div className="space-y-4">
      <InfoBanner variant="tip">
        Use <strong className="text-gray-300">Save playbook</strong> or{" "}
        <strong className="text-gray-300">Update playbook</strong> on each form — changes save
        immediately. Investigators load playbooks from the{" "}
        <strong className="text-gray-300">Playbooks</strong> menu under the message box.
      </InfoBanner>

      {loading && playbooks.length === 0 && (
        <p className="text-xs text-gray-500">Loading playbooks…</p>
      )}

      {!loading && playbooks.length === 0 && (
        <p className="text-xs text-gray-500 italic">No playbooks yet — create one below.</p>
      )}

      {playbooks.length > 0 && (
        <ul className="space-y-2">
          {playbooks.map((pb) => {
            const isEditing = editingId === pb.id;
            return (
              <li
                key={pb.id}
                ref={isEditing ? editSectionRef : undefined}
                className={`rounded-lg border ${
                  isEditing ? "border-accent/40 bg-accent/5" : "border-border-subtle"
                }`}
              >
                {isEditing && !disabled ? (
                  <div className="px-3 py-3 space-y-3">
                    <p className="text-xs font-medium text-accent-light">Editing playbook</p>
                    <PlaybookFormFields
                      idPrefix={`edit-${pb.id}`}
                      form={editForm}
                      onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
                      availableSkills={availableSkills}
                      skillsLoading={skillsLoading}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleUpdate()}
                        disabled={!canSaveEdit}
                        className="text-sm px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Update playbook"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={saving}
                        className="text-xs text-gray-400 hover:text-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-200">{pb.name}</p>
                      <p className="text-[11px] text-gray-500 line-clamp-2">{pb.prompt}</p>
                      {pb.skills.length > 0 ? (
                        <p className="text-[10px] text-gray-600 mt-1 font-mono">
                          Skills: {pb.skills.join(", ")}
                          {pb.strict ? " · strict" : ""}
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
                          disabled={Boolean(editingId && editingId !== pb.id)}
                          className="text-[10px] text-accent hover:text-accent-light disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(pb.id)}
                          className="text-[10px] text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!disabled && !editingId && (
        <div className="space-y-2 border-t border-border-subtle pt-4">
          <FieldLabel>New playbook</FieldLabel>
          <PlaybookFormFields
            idPrefix="new-playbook"
            form={newForm}
            onChange={(patch) => setNewForm((prev) => ({ ...prev, ...patch }))}
            availableSkills={availableSkills}
            skillsLoading={skillsLoading}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!canSaveNew}
            className="text-sm px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save playbook"}
          </button>
        </div>
      )}

      {!disabled && editingId && (
        <p className="text-[11px] text-gray-600">
          Finish editing above, or cancel to create a new playbook.
        </p>
      )}

      {success && <p className="text-xs text-green-400">{success}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
