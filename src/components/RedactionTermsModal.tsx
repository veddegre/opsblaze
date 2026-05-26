import React, { useEffect, useState } from "react";
import { loadConversation, updateConversation } from "../lib/api";
import { parseStringList } from "../lib/redaction-utils";

interface RedactionTermsModalProps {
  conversationId: string;
  open: boolean;
  onClose: () => void;
}

export function RedactionTermsModal({ conversationId, open, onClose }: RedactionTermsModalProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaved(false);
    loadConversation(conversationId)
      .then((conv) => {
        if (!cancelled) {
          setText((conv.exportRedactions ?? []).join("\n"));
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const exportRedactions = parseStringList(text);
      await updateConversation(conversationId, { exportRedactions });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="redaction-terms-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-2 shadow-2xl p-5">
        <h2 id="redaction-terms-title" className="text-sm font-semibold text-gray-100">
          Redaction terms for this investigation
        </h2>
        <p className="text-xs text-gray-500 mt-1 mb-3">
          One term per line (hostnames, usernames, ticket IDs, etc.). Applied when you export with
          redaction. Global patterns are configured under Settings → Runtime settings.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading || saving}
          rows={8}
          placeholder={"splunk-sh1.example.edu\njohn.doe\nINC0012345"}
          className="w-full rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-50"
        />
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        {saved && <p className="text-xs text-green-400 mt-2">Saved.</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg border border-border-subtle text-gray-400 hover:text-gray-200 hover:bg-surface-3"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save terms"}
          </button>
        </div>
      </div>
    </div>
  );
}
