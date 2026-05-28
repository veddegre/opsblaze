import React, { useEffect, useState } from "react";
import { listSkillsApi, type SkillInfo, type SkillPack } from "../../lib/settings-api";
import { SkillMultiSelect } from "./SkillMultiSelect";
import { FieldLabel, inputClass, monoInputClass } from "./settings-ui";

interface SkillBundlesEditorProps {
  packs: SkillPack[];
  onChange: (packs: SkillPack[]) => void;
  disabled?: boolean;
}

function emptyPack(): SkillPack {
  return {
    id: "new-bundle",
    name: "New bundle",
    description: "",
    skills: [],
    strict: true,
  };
}

export function SkillBundlesEditor({ packs, onChange, disabled }: SkillBundlesEditorProps) {
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listSkillsApi()
      .then((skills) => {
        if (!cancelled) setAvailableSkills(skills);
      })
      .catch(() => {
        if (!cancelled) setAvailableSkills([]);
      })
      .finally(() => {
        if (!cancelled) setSkillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePack = (index: number, patch: Partial<SkillPack>) => {
    const next = packs.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange(next);
  };

  const removePack = (index: number) => {
    onChange(packs.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {packs.length === 0 && (
        <p className="text-xs text-gray-500 italic">
          No custom bundles — built-in defaults are shown in the chat UI.
        </p>
      )}

      {packs.map((pack, index) => (
        <div
          key={`${pack.id}-${index}`}
          className="rounded-lg border border-border-subtle bg-surface-0/50 p-3 space-y-2"
        >
          <div className="flex gap-2 items-start">
            <div className="flex-1 grid gap-2 grid-cols-1">
              <div>
                <FieldLabel>Display name</FieldLabel>
                <input
                  value={pack.name}
                  onChange={(e) => updatePack(index, { name: e.target.value })}
                  disabled={disabled}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>Id (slug)</FieldLabel>
                <input
                  value={pack.id}
                  onChange={(e) =>
                    updatePack(index, {
                      id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                    })
                  }
                  disabled={disabled}
                  className={monoInputClass}
                />
              </div>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => removePack(index)}
                className="text-xs text-red-400 hover:text-red-300 mt-6 shrink-0"
              >
                Remove
              </button>
            )}
          </div>

          <div>
            <FieldLabel>Description (optional)</FieldLabel>
            <input
              value={pack.description ?? ""}
              onChange={(e) => updatePack(index, { description: e.target.value })}
              disabled={disabled}
              className={inputClass}
            />
          </div>

          <div>
            <FieldLabel>Skills in this bundle</FieldLabel>
            <SkillMultiSelect
              value={pack.skills}
              onChange={(skills) => updatePack(index, { skills })}
              availableSkills={availableSkills}
              loading={skillsLoading}
              disabled={disabled}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={pack.strict !== false}
              onChange={(e) => updatePack(index, { strict: e.target.checked })}
              disabled={disabled}
              className="rounded border-border-subtle"
            />
            Only selected skills (strict mode)
          </label>
        </div>
      ))}

      {!disabled && (
        <button
          type="button"
          onClick={() => onChange([...packs, emptyPack()])}
          className="text-xs px-3 py-1.5 rounded border border-border-subtle text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
        >
          Add bundle
        </button>
      )}
    </div>
  );
}
