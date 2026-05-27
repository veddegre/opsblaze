import React, { useCallback, useEffect, useState } from "react";
import { createSkillApi } from "../../lib/settings-api";
import {
  buildDefaultSkillContent,
  normalizeSkillName,
  validateSkillName,
} from "../../lib/skill-template";
import { FieldLabel, InfoBanner, inputClass, monoInputClass } from "./settings-ui";

const MAX_LEN = 100_000;

interface SkillCreatorProps {
  existingNames: string[];
  onCreated: (name: string) => void;
}

export function SkillCreator({ existingNames, onCreated }: SkillCreatorProps) {
  const [skillId, setSkillId] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState(() => buildDefaultSkillContent("my-skill", ""));
  const [contentTouched, setContentTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const normalizedId = normalizeSkillName(skillId);
  const nameError = validateSkillName(normalizedId);
  const nameTaken = normalizedId.length > 0 && existingNames.includes(normalizedId);

  const syncTemplate = useCallback(
    (id: string, desc: string) => {
      if (!contentTouched) {
        setContent(buildDefaultSkillContent(id || "my-skill", desc));
      }
    },
    [contentTouched]
  );

  useEffect(() => {
    syncTemplate(normalizedId || skillId.trim().toLowerCase(), description);
  }, [normalizedId, skillId, description, syncTemplate]);

  const handleCreate = async () => {
    setError(null);
    setSuccess(null);

    if (nameError) {
      setError(nameError);
      return;
    }
    if (nameTaken) {
      setError("A skill with this ID already exists");
      return;
    }
    if (!content.trim()) {
      setError("Skill content cannot be empty");
      return;
    }
    if (content.length > MAX_LEN) {
      setError("Content exceeds the maximum length");
      return;
    }

    setSaving(true);
    try {
      await createSkillApi(normalizedId, content);
      setSuccess(`Created “${normalizedId}”. Enable it in the list above if needed.`);
      setSkillId("");
      setDescription("");
      setContent("");
      setContentTouched(false);
      onCreated(normalizedId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const canCreate =
    !saving && !nameError && !nameTaken && content.trim().length > 0 && content.length <= MAX_LEN;

  return (
    <div className="space-y-3 border-t border-border-subtle pt-4 mt-2">
      <FieldLabel hint="Lowercase ID used in the skill picker (e.g. investigating-okta-events)">
        New skill
      </FieldLabel>
      <InfoBanner variant="tip">
        New skills are saved under <span className="font-mono">_local/</span> on the server. You can
        also distill a skill from a completed investigation using{" "}
        <strong className="text-gray-300">Distill skill</strong> in the header.
      </InfoBanner>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="new-skill-id">Skill ID</FieldLabel>
          <input
            id="new-skill-id"
            value={skillId}
            onChange={(e) => setSkillId(e.target.value)}
            placeholder="investigating-login-events"
            className={inputClass}
            spellCheck={false}
            autoComplete="off"
          />
          {skillId && normalizedId !== skillId.trim().toLowerCase() && (
            <p className="text-[10px] text-gray-500 mt-1">
              Will save as <span className="font-mono text-gray-400">{normalizedId || "…"}</span>
            </p>
          )}
        </div>
        <div>
          <FieldLabel htmlFor="new-skill-desc">Short description</FieldLabel>
          <input
            id="new-skill-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown in the skill picker"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="new-skill-content">SKILL.md content</FieldLabel>
        <textarea
          id="new-skill-content"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setContentTouched(true);
            setSuccess(null);
          }}
          spellCheck={false}
          rows={14}
          className={`${monoInputClass} w-full resize-y min-h-[10rem] text-[11px] leading-relaxed`}
        />
        <p className="text-[10px] text-gray-600 mt-1 tabular-nums">
          {content.length.toLocaleString()} / {MAX_LEN.toLocaleString()} chars
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => void handleCreate()}
          className="text-sm px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create skill"}
        </button>
      </div>

      {nameTaken && <p className="text-xs text-amber-400/90">This skill ID is already in use.</p>}
      {nameError && skillId.trim() && <p className="text-xs text-amber-400/90">{nameError}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-green-400/90">{success}</p>}
    </div>
  );
}
