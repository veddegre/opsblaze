import React, { useEffect, useId, useRef, useState } from "react";
import type { SkillInfo } from "../../lib/settings-api";
import { inputClass } from "./settings-ui";

interface SkillMultiSelectProps {
  value: string[];
  onChange: (skills: string[]) => void;
  availableSkills: SkillInfo[];
  loading?: boolean;
  disabled?: boolean;
}

export function SkillMultiSelect({
  value,
  onChange,
  availableSkills,
  loading = false,
  disabled = false,
}: SkillMultiSelectProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const enabledByName = new Map(
    availableSkills.filter((s) => s.enabled).map((s) => [s.name, s])
  );
  const selectedSet = new Set(value);

  const options = availableSkills.filter((s) => {
    if (!s.enabled || selectedSet.has(s.name)) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setActiveIndex(options.length > 0 ? 0 : -1);
  }, [query, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const addSkill = (name: string) => {
    if (disabled || selectedSet.has(name)) return;
    onChange([...value, name]);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  };

  const removeSkill = (name: string) => {
    if (disabled) return;
    onChange(value.filter((s) => s !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else if (options.length > 0) {
        setActiveIndex((i) => (i < options.length - 1 ? i + 1 : i));
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : 0));
      return;
    }
    if (e.key === "Enter" && open && activeIndex >= 0 && activeIndex < options.length) {
      e.preventDefault();
      addSkill(options[activeIndex].name);
      return;
    }
    if (e.key === "Backspace" && !query && value.length > 0) {
      removeSkill(value[value.length - 1]);
    }
  };

  return (
    <div ref={containerRef} className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((name) => {
            const meta = enabledByName.get(name) ?? availableSkills.find((s) => s.name === name);
            const stale = !meta?.enabled;
            return (
              <span
                key={name}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                  stale
                    ? "bg-amber-500/10 text-amber-200 border-amber-500/30"
                    : "bg-accent/15 text-accent-light border-accent/20"
                }`}
                title={
                  stale
                    ? "Skill is disabled or missing — enable it under Settings → Skills"
                    : meta?.description
                }
              >
                <span className="font-mono">{name}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeSkill(name)}
                    className="hover:text-red-400 leading-none"
                    aria-label={`Remove ${name}`}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          placeholder={loading ? "Loading skills…" : "Search skills to add…"}
          className={inputClass}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />

        {open && !disabled && !loading && (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border-subtle bg-surface-2 shadow-xl"
          >
            {options.length === 0 ? (
              <p className="text-xs text-gray-500 px-3 py-3 text-center">
                {query.trim() ? "No matching enabled skills" : "All enabled skills are selected"}
              </p>
            ) : (
              options.map((skill, i) => (
                <button
                  key={skill.name}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => addSkill(skill.name)}
                  className={`w-full text-left px-3 py-2 border-b border-border-subtle/50 last:border-b-0 transition-colors ${
                    i === activeIndex ? "bg-accent/15" : "hover:bg-surface-3"
                  }`}
                >
                  <p className="text-sm font-mono text-gray-200">{skill.name}</p>
                  {skill.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{skill.description}</p>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-600">
        Pick from installed skills. Enable skills under Settings → Skills if one is missing.
      </p>
    </div>
  );
}
