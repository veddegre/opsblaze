import React, { useState, useLayoutEffect, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { InvestigationPlaybook } from "../lib/playbooks-api";

interface PlaybookPickerProps {
  playbooks: InvestigationPlaybook[];
  onApplyPlaybook?: (playbook: InvestigationPlaybook) => void;
  disabled?: boolean;
}

export function PlaybookPicker({ playbooks, onApplyPlaybook, disabled }: PlaybookPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelPos, setPanelPos] = useState<{ bottom: number; left: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelSearchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = searchQuery.toLowerCase().trim();
  const filtered = playbooks.filter(
    (pb) =>
      pb.name.toLowerCase().includes(q) ||
      pb.prompt.toLowerCase().includes(q) ||
      pb.skills.some((s) => s.toLowerCase().includes(q))
  );

  const updatePanelPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({
      bottom: window.innerHeight - rect.top + 6,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - 400)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
    window.addEventListener("resize", updatePanelPos);
    window.addEventListener("scroll", updatePanelPos, true);
    return () => {
      window.removeEventListener("resize", updatePanelPos);
      window.removeEventListener("scroll", updatePanelPos, true);
    };
  }, [isOpen, updatePanelPos]);

  useEffect(() => {
    if (isOpen && panelPos) {
      requestAnimationFrame(() => panelSearchRef.current?.focus());
    }
  }, [isOpen, panelPos]);

  useEffect(() => {
    setActiveIndex(filtered.length > 0 ? 0 : -1);
  }, [searchQuery, filtered.length]);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>("[data-playbook-item]");
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
    setActiveIndex(-1);
  }, []);

  const apply = useCallback(
    (pb: InvestigationPlaybook) => {
      onApplyPlaybook?.(pb);
      close();
      triggerRef.current?.focus();
    },
    [onApplyPlaybook, close]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setActiveIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }
    if (e.key === "Enter" && isOpen && activeIndex >= 0 && activeIndex < filtered.length) {
      e.preventDefault();
      apply(filtered[activeIndex]);
    }
  };

  if (playbooks.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border-subtle text-gray-400 hover:text-accent-light hover:border-accent/40 transition-colors disabled:opacity-50"
        title="Load a saved investigation playbook into the message box"
      >
        <span>Playbooks</span>
        <span className="text-[10px] text-gray-500 tabular-nums">({playbooks.length})</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen &&
        panelPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={close} aria-hidden="true" />

            <div
              role="listbox"
              className="fixed z-[9999] w-96 max-w-[calc(100vw-2rem)] flex flex-col bg-surface-2/95 backdrop-blur-xl rounded-lg border border-border-subtle shadow-2xl"
              style={{
                bottom: panelPos.bottom,
                left: panelPos.left,
                maxHeight: "50vh",
              }}
            >
              <div className="px-3 pt-3 pb-2 border-b border-border-subtle/50 shrink-0">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface-3/60 border border-border-subtle/40">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-500 shrink-0"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    ref={panelSearchRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search playbooks..."
                    className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        panelSearchRef.current?.focus();
                      }}
                      className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
                      aria-label="Clear search"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-1.5 px-0.5">
                  {searchQuery
                    ? `${filtered.length} of ${playbooks.length}`
                    : `${playbooks.length} saved investigation${playbooks.length !== 1 ? "s" : ""}`}
                </p>
              </div>

              <div ref={listRef} className="overflow-y-auto overscroll-contain flex-1 py-1">
                {filtered.length > 0 ? (
                  filtered.map((pb, idx) => (
                    <button
                      key={pb.id}
                      type="button"
                      role="option"
                      data-playbook-item
                      aria-selected={idx === activeIndex}
                      onClick={() => apply(pb)}
                      className={`w-full text-left px-3 py-2 transition-colors cursor-pointer ${
                        idx === activeIndex ? "bg-accent/15" : "hover:bg-surface-3"
                      }`}
                    >
                      <p
                        className={`text-sm font-medium ${
                          idx === activeIndex ? "text-accent-light" : "text-gray-200"
                        }`}
                      >
                        {pb.name}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{pb.prompt}</p>
                      {pb.skills.length > 0 && (
                        <p className="text-[10px] text-gray-600 mt-1 truncate">
                          Skills: {pb.skills.join(", ")}
                          {pb.strict ? " · strict" : ""}
                        </p>
                      )}
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 px-3 py-4 text-center">No matching playbooks</p>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
