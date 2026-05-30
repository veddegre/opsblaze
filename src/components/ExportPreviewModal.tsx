import React, { useEffect, useState } from "react";
import { fetchInit, headers } from "../lib/api";

interface ExportPreviewModalProps {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  mode?: "full" | "findings";
  redact?: "default" | "yes" | "no";
  clean?: boolean;
  onDownload?: () => void;
}

export function ExportPreviewModal({
  conversationId,
  open,
  onClose,
  mode = "findings",
  redact = "default",
  clean = true,
  onDownload,
}: ExportPreviewModalProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml(null);

    const params = new URLSearchParams({ preview: "1" });
    if (mode === "findings") params.set("mode", "findings");
    if (redact === "yes") params.set("redact", "1");
    else if (redact === "no") params.set("redact", "0");
    if (!clean) params.set("clean", "0");

    fetch(
      `/api/conversations/${conversationId}/export?${params}`,
      fetchInit({ headers: headers() })
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`Preview failed (${res.status})`);
        return res.json() as Promise<{ html: string; title: string }>;
      })
      .then((data) => {
        if (!cancelled) {
          setHtml(data.html);
          setTitle(data.title);
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || "Preview failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, conversationId, mode, redact, clean]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-preview-title"
    >
      <div className="flex flex-col w-full max-w-4xl max-h-[90vh] rounded-xl border border-border-subtle bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle">
          <div className="min-w-0">
            <h2 id="export-preview-title" className="text-sm font-semibold text-gray-100 truncate">
              Export preview
            </h2>
            {title && <p className="text-xs text-gray-500 truncate">{title}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90"
              >
                Download
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-md text-gray-300 hover:bg-surface-3"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading && <p className="p-6 text-sm text-gray-500 text-center">Generating preview…</p>}
          {error && <p className="p-6 text-sm text-red-400 text-center">{error}</p>}
          {!loading && !error && html && (
            <iframe
              title="Export preview"
              srcDoc={html}
              className="w-full h-[min(70vh,600px)] bg-white"
              sandbox=""
            />
          )}
        </div>
      </div>
    </div>
  );
}
