import React, { useCallback, useEffect, useState } from "react";
import { getSettings, updateSettings, type SkillPack } from "../../lib/settings-api";
import { SkillBundlesEditor } from "./SkillBundlesEditor";
import { InfoBanner, Section } from "./settings-ui";

interface SkillBundlesSectionProps {
  onBundlesChanged?: () => void;
}

export function SkillBundlesSection({ onBundlesChanged }: SkillBundlesSectionProps) {
  const [packs, setPacks] = useState<SkillPack[]>([]);
  const [baseline, setBaseline] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await getSettings();
      const next = settings.runtime.skillPacks ?? [];
      setPacks(next);
      setBaseline(JSON.stringify(next));
    } catch (err) {
      setError((err as Error).message || "Failed to load skill bundles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(packs) !== baseline;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateSettings({ skillPacks: packs });
      const next = updated.runtime.skillPacks ?? packs;
      setPacks(next);
      setBaseline(JSON.stringify(next));
      setSaved(true);
      onBundlesChanged?.();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message || "Failed to save skill bundles");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title="Skill bundles"
      description="One-click skill presets in the Skill bundles menu under the message box. Built-in defaults always appear; add custom bundles here."
    >
      <InfoBanner variant="tip">
        Use <strong className="text-gray-300">Save skill bundles</strong> below — not{" "}
        <strong className="text-gray-300">Save runtime settings</strong> in the Runtime settings
        section.
      </InfoBanner>

      {loading && packs.length === 0 && (
        <p className="text-xs text-gray-500">Loading skill bundles…</p>
      )}

      {!loading && (
        <SkillBundlesEditor
          packs={packs}
          onChange={(next) => {
            setPacks(next);
            setSaved(false);
          }}
        />
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loading || !dirty}
          className="text-sm px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save skill bundles"}
        </button>
        {saved && <span className="text-xs text-green-400">Saved</span>}
        {!dirty && !saved && !loading && (
          <span className="text-xs text-gray-600">No unsaved changes</span>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </Section>
  );
}
