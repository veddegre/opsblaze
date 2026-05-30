import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchHealth, fetchInit, headers } from "../lib/api";
import type { HealthResponse } from "../lib/api";
import { healthCheckLabel } from "../lib/health-labels";
import type { PublicAuthUser } from "../lib/auth";
import type { ConversationSkillScope } from "../lib/conversation-skill-scope";
import { UserMenu } from "./UserMenu";
import { RedactionTermsModal } from "./RedactionTermsModal";
import { ExportPreviewModal } from "./ExportPreviewModal";

interface HeaderProps {
  user: PublicAuthUser;
  onClear: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  onOpenPreferences: () => void;
  onDistillSkill: () => void;
  canDistill: boolean;
  conversationTitle?: string | null;
  conversationId?: string | null;
  activeSkillScope?: ConversationSkillScope | null;
  canExport: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  ok: "bg-green-400",
  degraded: "bg-yellow-400",
  error: "bg-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  ok: "All systems operational",
  degraded: "Partial issues detected",
  error: "Service issues detected",
};

function HealthIndicator() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      setHealth(await fetchHealth());
    } catch {
      setHealth({ status: "error", checks: { api: { status: "error", message: "unreachable" } } });
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = health?.status === "ok" ? 60_000 : 15_000;
    const id = setInterval(poll, interval);
    return () => clearInterval(id);
  }, [poll, health?.status]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const status = health?.status ?? "error";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md hover:bg-surface-3 transition-colors flex items-center justify-center"
        aria-label={`System status: ${STATUS_LABELS[status] ?? status}`}
        title={STATUS_LABELS[status] ?? status}
      >
        <span className={`block w-2 h-2 rounded-full ${STATUS_COLORS[status] ?? "bg-gray-500"}`} />
      </button>

      {open && health && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-surface-2/95 backdrop-blur-xl rounded-lg border border-border-subtle shadow-lg z-50 py-2">
          <div className="px-3 py-1.5 border-b border-border-subtle">
            <span
              className={`text-xs font-medium ${status === "ok" ? "text-green-400" : status === "degraded" ? "text-yellow-400" : "text-red-400"}`}
            >
              {STATUS_LABELS[status]}
            </span>
          </div>
          {Object.entries(health.checks).map(([name, check]) => (
            <div key={name} className="px-3 py-1.5 flex items-center gap-2">
              <span
                className={`block w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[check.status] ?? "bg-gray-500"}`}
              />
              <span className="text-xs text-gray-300 flex-1">{healthCheckLabel(name)}</span>
              {check.message && (
                <span className="text-[10px] text-gray-500 truncate max-w-[120px]">
                  {check.message}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header({
  user,
  onClear,
  onToggleSidebar,
  onOpenSettings,
  onOpenAccount,
  onOpenPreferences,
  onDistillSkill,
  canDistill,
  conversationTitle,
  conversationId,
  activeSkillScope,
  canExport,
}: HeaderProps) {
  const activeSkills = activeSkillScope?.skills ?? [];
  const skillScopeSubtitle =
    activeSkills.length > 0
      ? `Skills: ${activeSkills.join(", ")}${
          activeSkillScope?.strict ? " (selected only)" : " (+ others allowed)"
        }`
      : null;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [redactionModalOpen, setRedactionModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOpts, setPreviewOpts] = useState<{
    mode: "full" | "findings";
    redact: ExportRedact;
    clean: boolean;
  }>({ mode: "findings", redact: "default", clean: true });
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  type ExportRedact = "default" | "yes" | "no";

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [exportMenuOpen]);

  const clearExportFeedback = () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setExportError(null);
      setExportSuccess(false);
    }, 4000);
  };

  const openPreview = (
    mode: "full" | "findings",
    redact: ExportRedact = "default",
    clean = true
  ) => {
    setExportMenuOpen(false);
    setPreviewOpts({ mode, redact, clean });
    setPreviewOpen(true);
  };

  const handleExport = async (
    mode: "full" | "findings",
    redact: ExportRedact = "default",
    clean = true
  ) => {
    if (!conversationId || exporting) return;
    setExportMenuOpen(false);
    setExporting(true);
    setExportError(null);
    setExportSuccess(false);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    try {
      const params = new URLSearchParams();
      if (mode === "findings") params.set("mode", "findings");
      if (redact === "yes") params.set("redact", "1");
      else if (redact === "no") params.set("redact", "0");
      if (!clean) params.set("clean", "0");
      const qs = params.toString();
      const resp = await fetch(
        `/api/conversations/${conversationId}/export${qs ? `?${qs}` : ""}`,
        fetchInit({ headers: headers() })
      );
      if (!resp.ok) throw new Error(`Export failed (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = resp.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `investigation-${conversationId}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      clearExportFeedback();
    } catch (err) {
      const msg = (err as Error).message || "Export failed";
      setExportError(msg);
      clearExportFeedback();
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="flex items-center justify-between gap-2 px-3 sm:px-6 py-2.5 sm:py-3 border-b border-border-subtle bg-surface-1/80 backdrop-blur-md z-40">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 -ml-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
          aria-label="Toggle investigations sidebar"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center shadow-md shadow-orange-500/20">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white"
          >
            <circle cx="10" cy="10" r="8" />
            <line x1="16" y1="16" x2="22" y2="22" strokeWidth="2.5" />
            <path
              d="M10 4C11 5.5 14 8 14 11c0 2.5-2 4.5-4 4.5S6 13.5 6 11c0-2 1-4 2-5 .5 1.5 1 3 1.5 3.5C9.5 8 10 5.5 10 4z"
              fill="currentColor"
              stroke="none"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-gray-100 tracking-tight truncate">
            {conversationTitle ?? "OpsBlaze"}
          </h1>
          {skillScopeSubtitle ? (
            <p
              className="text-xs text-accent-light/90 -mt-0.5 truncate max-w-[min(100%,42rem)]"
              title={skillScopeSubtitle}
            >
              {skillScopeSubtitle}
            </p>
          ) : (
            <p className="hidden sm:block text-xs text-gray-500 -mt-0.5">
              AI-Powered Narrative Investigation
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
        <HealthIndicator />
        {exportSuccess && (
          <span className="hidden sm:inline text-xs text-green-400 mr-1">Download started</span>
        )}
        {exportError && (
          <span className="hidden sm:inline text-xs text-red-400 mr-1 max-w-[140px] truncate">
            {exportError}
          </span>
        )}
        {canExport && (
          <div className="relative" ref={exportMenuRef}>
            <div className="flex items-center">
              <button
                onClick={() => handleExport("findings", "default")}
                disabled={exporting}
                className="p-1.5 rounded-l-md text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors disabled:opacity-50"
                aria-label="Download findings report"
                title="Findings export — charts and SPL (use menu for redacted copy)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button
                onClick={() => setExportMenuOpen((o) => !o)}
                disabled={exporting}
                className="p-1.5 -ml-px rounded-r-md text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors disabled:opacity-50 border-l border-border-subtle/60"
                aria-label="More export options"
                aria-expanded={exportMenuOpen}
                aria-haspopup="menu"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            {exportMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-lg border border-border-subtle bg-surface-2 shadow-xl py-1"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-surface-3"
                  onClick={() => openPreview("findings", "default")}
                >
                  <span className="font-medium block">Preview findings report</span>
                  <span className="text-gray-500">Review before download</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-surface-3"
                  onClick={() => handleExport("findings", "default")}
                >
                  <span className="font-medium block">Download findings report</span>
                  <span className="text-gray-500">
                    Charts and SPL only — skips errors and retries
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-surface-3"
                  onClick={() => handleExport("findings", "yes")}
                >
                  <span className="font-medium block">Findings (redacted)</span>
                  <span className="text-gray-500">Findings with sensitive values removed</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-surface-3"
                  onClick={() => handleExport("full", "default")}
                >
                  <span className="font-medium block">Full conversation</span>
                  <span className="text-gray-500">
                    Substantive Q&amp;A only — omits errors and &quot;try again&quot;
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-surface-3"
                  onClick={() => handleExport("full", "default", false)}
                >
                  <span className="font-medium block">Full (verbatim)</span>
                  <span className="text-gray-500">Everything including errors and retries</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-surface-3"
                  onClick={() => handleExport("full", "yes", true)}
                >
                  <span className="font-medium block">Full conversation (redacted)</span>
                  <span className="text-gray-500">
                    Cleaned Q&amp;A with sensitive values removed
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-surface-3 border-t border-border-subtle mt-1"
                  onClick={() => {
                    setExportMenuOpen(false);
                    setRedactionModalOpen(true);
                  }}
                >
                  <span className="font-medium block">Redaction terms…</span>
                  <span className="text-gray-500">Strings to hide in this investigation</span>
                </button>
              </div>
            )}
            {conversationId && (
              <>
                <RedactionTermsModal
                  conversationId={conversationId}
                  open={redactionModalOpen}
                  onClose={() => setRedactionModalOpen(false)}
                />
                <ExportPreviewModal
                  conversationId={conversationId}
                  open={previewOpen}
                  onClose={() => setPreviewOpen(false)}
                  mode={previewOpts.mode}
                  redact={previewOpts.redact}
                  clean={previewOpts.clean}
                  onDownload={() => {
                    void handleExport(previewOpts.mode, previewOpts.redact, previewOpts.clean);
                    setPreviewOpen(false);
                  }}
                />
              </>
            )}
          </div>
        )}
        <button
          onClick={onDistillSkill}
          disabled={!canDistill}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Distill skill from conversation"
          title="Distill Skill"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="9" y1="18" x2="15" y2="18" />
            <line x1="10" y1="22" x2="14" y2="22" />
            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
          </svg>
        </button>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
          aria-label="Settings"
          title="Settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="hidden sm:inline text-xs">Settings</span>
        </button>
        <button
          onClick={onClear}
          className="text-xs font-medium text-gray-300 hover:text-white px-2 sm:px-3 py-1.5 rounded-md bg-surface-3/80 hover:bg-surface-3 border border-border-subtle transition-colors whitespace-nowrap"
        >
          <span className="hidden sm:inline">New investigation</span>
          <span className="sm:hidden">New</span>
        </button>
        <UserMenu user={user} onOpenAccount={onOpenAccount} onOpenPreferences={onOpenPreferences} />
      </div>
    </header>
  );
}
