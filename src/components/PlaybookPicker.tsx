import React, { useState, useLayoutEffect, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { InvestigationPlaybook } from "../lib/playbooks-api";
import { getPlaybookCategory, groupPlaybooksByCategory } from "../lib/playbook-category";
import { pickerBackdropClass, pickerPanelClass } from "../lib/overlay-layout";

interface PlaybookPickerProps {
  playbooks: InvestigationPlaybook[];
  onApplyPlaybook?: (playbook: InvestigationPlaybook) => void;
  disabled?: boolean;
  overlaysSuspended?: boolean;
}

export function PlaybookPicker({
  playbooks,
  onApplyPlaybook,
  disabled,
  overlaysSuspended = false,
}: PlaybookPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelPos, setPanelPos] = useState<{ bottom: number; left: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelSearchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // All categories across every playbook (drives the quick-filter chips).
  const allCategories = groupPlaybooksByCategory(playbooks).map((g) => g.category);

  const q = searchQuery.toLowerCase().trim();
  const filtered = playbooks.filter((pb) => {
    if (categoryFilter && getPlaybookCategory(pb) !== categoryFilter) return false;
    if (!q) return true;
    return (
      pb.name.toLowerCase().includes(q) ||
      pb.prompt.toLowerCase().includes(q) ||
      pb.skills.some((s) => s.toLowerCase().includes(q)) ||
      getPlaybookCategory(pb).toLowerCase().includes(q)
    );
  });

  // Group for display; `ordered` is the flattened group order that keyboard
  // navigation and the active-index highlight track against.
  const groups = groupPlaybooksByCategory(filtered);
  const showHeaders = groups.length > 1;
  const ordered = groups.flatMap((g) => g.items);

  const updatePanelPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({
      bottom: window.innerHeight - rect.top + 6,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - 400)),
    });
  }, []);

  useEffect(() => {
    if (disabled || overlaysSuspended) {
      setIsOpen(false);
      setSearchQuery("");
      setCategoryFilter(null);
      setActiveIndex(0);
    }
  }, [disabled, overlaysSuspended]);

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
  }, [searchQuery, categoryFilter, filtered.length]);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>("[data-playbook-item]");
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
    setCategoryFilter(null);
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
      setActiveIndex((prev) => (prev < ordered.length - 1 ? prev + 1 : prev));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }
    if (e.key === "Enter" && isOpen && activeIndex >= 0 && activeIndex < ordered.length) {
      e.preventDefault();
      apply(ordered[activeIndex]);
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
        !overlaysSuspended &&
        panelPos &&
        createPortal(
          <>
            <div className={pickerBackdropClass} onClick={close} aria-hidden="true" />

            <div
              role="listbox"
              className={`${pickerPanelClass} w-96 max-w-[calc(100vw-2rem)] flex flex-col bg-surface-2/95 backdrop-blur-xl rounded-lg border border-border-subtle shadow-2xl`}
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
                {allCategories.length > 1 && (
                  <div className="flex items-center gap-1 mt-2 overflow-x-auto overscroll-x-contain pb-0.5 -mx-0.5 px-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter(null);
                        panelSearchRef.current?.focus();
                      }}
                      className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                        categoryFilter === null
                          ? "border-accent/50 bg-accent/15 text-accent-light"
                          : "border-border-subtle text-gray-400 hover:text-gray-200 hover:border-border-strong"
                      }`}
                    >
                      All
                    </button>
                    {allCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setCategoryFilter((prev) => (prev === cat ? null : cat));
                          panelSearchRef.current?.focus();
                        }}
                        className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                          categoryFilter === cat
                            ? "border-accent/50 bg-accent/15 text-accent-light"
                            : "border-border-subtle text-gray-400 hover:text-gray-200 hover:border-border-strong"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-gray-500 mt-1.5 px-0.5">
                  {searchQuery || categoryFilter
                    ? `${filtered.length} of ${playbooks.length}${
                        categoryFilter ? ` · ${categoryFilter}` : ""
                      }`
                    : `${playbooks.length} saved investigation${playbooks.length !== 1 ? "s" : ""}`}
                </p>
              </div>

              <div ref={listRef} className="overflow-y-auto overscroll-contain flex-1 py-1">
                {ordered.length > 0 ? (
                  (() => {
                    let runningIndex = -1;
                    return groups.map((group) => (
                      <div key={group.category}>
                        {showHeaders && (
                          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 sticky top-0 bg-surface-2/95 backdrop-blur-xl z-10">
                            {group.category}
                            <span className="ml-1 font-normal normal-case tracking-normal text-gray-600">
                              ({group.items.length})
                            </span>
                          </div>
                        )}
                        {group.items.map((pb) => {
                          runningIndex += 1;
                          const idx = runningIndex;
                          return (
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
                              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                                {pb.prompt}
                              </p>
                              {pb.skills.length > 0 && (
                                <p className="text-[10px] text-gray-600 mt-1 truncate">
                                  Skills: {pb.skills.join(", ")}
                                  {pb.strict ? " · strict" : ""}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ));
                  })()
                ) : (
                  <p className="text-sm text-gray-500 px-3 py-4 text-center">
                    No matching playbooks
                  </p>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
