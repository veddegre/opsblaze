import React, { useEffect, useState } from "react";
import { getSettings, updateSettings } from "../../lib/settings-api";
import type { AppSettings } from "../../lib/settings-api";
import {
  FieldLabel,
  InfoBanner,
  Section,
  inputClass,
  monoInputClass,
} from "./settings-ui";

export function PreferencesTab({ isAdmin }: { isAdmin: boolean }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [maxTurns, setMaxTurns] = useState(30);
  const [streamTimeout, setStreamTimeout] = useState(300000);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setModel(s.runtime.claudeModel);
        setEffort(s.runtime.claudeEffort);
        setMaxTurns(s.runtime.maxTurns);
        setStreamTimeout(s.runtime.streamTimeoutMs);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const partial: Record<string, unknown> = {};
      if (model !== settings?.runtime.claudeModel) partial.claudeModel = model;
      if (effort !== settings?.runtime.claudeEffort) partial.claudeEffort = effort;
      if (maxTurns !== settings?.runtime.maxTurns) partial.maxTurns = maxTurns;
      if (streamTimeout !== settings?.runtime.streamTimeoutMs)
        partial.streamTimeoutMs = streamTimeout;
      if (Object.keys(partial).length === 0) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return;
      }
      const updated = await updateSettings(partial);
      setSettings((prev) => (prev ? { ...prev, runtime: updated.runtime } : prev));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const useOpenWebUi =
    settings?.runtime.llmProvider === "openwebui" ||
    settings?.system?.llmProvider === "openwebui";

  return (
    <div>
      <Section
        title="Investigation defaults"
        description={
          isAdmin
            ? "These apply to new queries for everyone using this server. Changes take effect on the next message."
            : "Current defaults for investigations on this server (set by an administrator)."
        }
      >
        {!isAdmin && (
          <InfoBanner>
            Contact an administrator if you need a different model, timeout, or turn limit.
          </InfoBanner>
        )}

        <FieldLabel
          hint={
            useOpenWebUi
              ? "The model ID from your Open WebUI instance."
              : "Which Claude model powers investigations."
          }
        >
          {useOpenWebUi ? "AI model" : "Claude model"}
        </FieldLabel>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!isAdmin}
          placeholder={useOpenWebUi ? "e.g. gemma4:31b" : "claude-opus-4-6"}
          className={monoInputClass}
        />

        {!useOpenWebUi && (
          <>
            <FieldLabel hint="Higher effort uses more reasoning before answering.">
              Thinking effort
            </FieldLabel>
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              disabled={!isAdmin}
              className={inputClass}
            >
              <option value="low">Low — faster, lighter analysis</option>
              <option value="medium">Medium</option>
              <option value="high">High — recommended</option>
              <option value="max">Max — deepest reasoning</option>
            </select>
          </>
        )}

        <FieldLabel hint="How many back-and-forth tool steps the agent may take per question.">
          Max steps per investigation
        </FieldLabel>
        <input
          type="number"
          value={maxTurns}
          onChange={(e) =>
            setMaxTurns(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))
          }
          disabled={!isAdmin}
          min={1}
          max={200}
          className={inputClass}
        />

        <FieldLabel hint="Investigations stop automatically after this duration.">
          Time limit
        </FieldLabel>
        <select
          value={streamTimeout}
          onChange={(e) => setStreamTimeout(parseInt(e.target.value))}
          disabled={!isAdmin}
          className={inputClass}
        >
          <option value={120000}>2 minutes</option>
          <option value={300000}>5 minutes</option>
          <option value={600000}>10 minutes</option>
          <option value={900000}>15 minutes</option>
          <option value={1800000}>30 minutes</option>
        </select>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {isAdmin && (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save preferences"}
            </button>
            {saved && <span className="text-xs text-green-400">Saved</span>}
          </div>
        )}
      </Section>
    </div>
  );
}
