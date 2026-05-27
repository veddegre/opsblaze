import React, { useCallback, useEffect, useState } from "react";
import { fetchSkillContentApi, updateSkillApi } from "../../lib/settings-api";
import { monoInputClass } from "./settings-ui";

const MAX_LEN = 100_000;

interface SkillEditorProps {
  name: string;
  onSaved?: () => void;
}

export function SkillEditor({ name, onSaved }: SkillEditorProps) {
  const [content, setContent] = useState("");
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchSkillContentApi(name);
      setContent(data.content);
      setBaseline(data.content);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = content !== baseline;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateSkillApi(name, content);
      setBaseline(content);
      setSuccess("Saved. New investigations will use the updated skill text.");
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-gray-500">Loading skill file…</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500">
        Edit <span className="font-mono text-gray-400">SKILL.md</span> below. Keep YAML front matter
        at the top (<span className="font-mono">name</span>,{" "}
        <span className="font-mono">description</span>).
      </p>
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setSuccess(null);
        }}
        spellCheck={false}
        rows={16}
        className={`${monoInputClass} w-full resize-y min-h-[12rem] text-[11px] leading-relaxed`}
        aria-label={`Skill content for ${name}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || !dirty || content.length > MAX_LEN}
          onClick={() => void handleSave()}
          className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-dim disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save skill"}
        </button>
        {dirty && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setContent(baseline);
              setSuccess(null);
              setError(null);
            }}
            className="text-xs px-3 py-1.5 rounded-md border border-border-subtle text-gray-400 hover:text-gray-200 transition-colors"
          >
            Discard changes
          </button>
        )}
        <span className="text-[10px] text-gray-600 tabular-nums ml-auto">
          {content.length.toLocaleString()} / {MAX_LEN.toLocaleString()} chars
        </span>
      </div>
      {content.length > MAX_LEN && (
        <p className="text-xs text-red-400">Content exceeds the maximum length.</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-green-400/90">{success}</p>}
    </div>
  );
}
