import React, { useEffect, useState, useCallback, useRef } from "react";
import { listConversations, searchConversations, type ConversationSummary } from "../lib/api";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeConversationId: string | null;
  streamingConversationIds: string[];
  listRefreshKey?: string | number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>;
  onNew: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type DisplayItem = ConversationSummary & { snippet?: string };

export function Sidebar({
  isOpen,
  onClose,
  activeConversationId,
  streamingConversationIds,
  listRefreshKey = 0,
  onSelect,
  onDelete,
  onRename,
  onNew,
}: SidebarProps) {
  const [conversations, setConversations] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const streamingSet = new Set(streamingConversationIds);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listConversations();
      setConversations(list);
    } catch (err) {
      setError((err as Error).message || "Failed to load investigations");
    } finally {
      setLoading(false);
    }
  }, []);

  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      refresh();
      focusTimerRef.current = setTimeout(() => searchInputRef.current?.focus(), 200);
    } else {
      setQuery("");
      setPendingDelete(null);
      setRenamingId(null);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    }
  }, [isOpen, refresh, listRefreshKey]);

  useEffect(() => {
    if (renamingId) {
      requestAnimationFrame(() => renameInputRef.current?.focus());
    }
  }, [renamingId]);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        refresh();
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const results = await searchConversations(q.trim());
        setConversations(results);
      } catch (err) {
        setError((err as Error).message || "Search failed");
      } finally {
        setSearching(false);
      }
    },
    [refresh]
  );

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleClearSearch = () => {
    setQuery("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    refresh();
    searchInputRef.current?.focus();
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    try {
      await onDelete(pendingDelete.id);
      setConversations((prev) => prev.filter((c) => c.id !== pendingDelete.id));
    } catch (err) {
      setError(`Delete failed: ${(err as Error).message}`);
    } finally {
      setPendingDelete(null);
    }
  };

  const startRename = (e: React.SyntheticEvent, conv: DisplayItem) => {
    e.stopPropagation();
    e.preventDefault();
    setRenamingId(conv.id);
    setRenameValue(conv.title);
  };

  const commitRename = async (id: string) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed) return;
    try {
      await onRename(id, trimmed);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
    } catch {
      /* error surfaced via App notice */
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pendingDelete) {
          setPendingDelete(null);
          return;
        }
        if (renamingId) {
          setRenamingId(null);
          return;
        }
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, pendingDelete, renamingId]);

  const isSearchMode = query.trim().length > 0;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 top-[49px] bg-black/40 z-20 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-[49px] left-0 bottom-0 w-80 max-w-[min(100vw-2rem,20rem)] bg-surface-1 border-r border-border-subtle z-30 transform transition-transform duration-200 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-[18px] pb-3 border-b border-border-subtle">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">Investigations</h2>
            <p className="text-[10px] text-gray-600 mt-0.5">Double-click a title to rename</p>
          </div>
          <button
            onClick={() => {
              onNew();
              onClose();
            }}
            className="text-xs text-accent hover:text-accent-light px-2 py-1 rounded hover:bg-surface-3 transition-colors"
            aria-label="New investigation"
          >
            + New
          </button>
        </div>

        <div className="px-3 py-2 border-b border-border-subtle">
          <div className="relative">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search investigations..."
              className="w-full text-xs bg-surface-0 border border-border-subtle rounded-md pl-8 pr-7 py-1.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent/40 transition-colors"
              aria-label="Search investigations"
            />
            {query && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300"
                aria-label="Clear search"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {pendingDelete && (
          <div className="mx-3 mt-2 px-3 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10">
            <p className="text-xs text-gray-200 mb-2">
              Delete <span className="font-medium text-red-300">{pendingDelete.title}</span>? This
              cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="text-xs px-2.5 py-1 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="text-xs px-2.5 py-1 rounded border border-border-subtle text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-y-auto h-[calc(100%-96px)]">
          {error && (
            <div className="mx-4 mt-2 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded">
              {error}
            </div>
          )}

          {(loading || searching) && conversations.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-600 text-sm">
              {searching ? "Searching..." : "Loading..."}
            </div>
          )}

          {!loading && !searching && conversations.length === 0 && !error && (
            <div className="px-4 py-8 text-center text-gray-600 text-sm">
              {isSearchMode ? "No matching investigations" : "No investigations yet"}
            </div>
          )}

          {conversations.map((conv) => {
            const isRunning = streamingSet.has(conv.id) && conv.id !== activeConversationId;
            return (
              <div
                key={conv.id}
                onClick={() => {
                  if (renamingId === conv.id) return;
                  onSelect(conv.id);
                  onClose();
                }}
                className={`group px-4 py-3 cursor-pointer border-b border-border-subtle transition-colors ${
                  conv.id === activeConversationId
                    ? "bg-accent/10 border-l-2 border-l-accent"
                    : "hover:bg-surface-3"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {renamingId === conv.id ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void commitRename(conv.id);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setRenamingId(null);
                          }
                        }}
                        onBlur={() => void commitRename(conv.id)}
                        className="w-full text-sm bg-surface-0 border border-accent/40 rounded px-1.5 py-0.5 text-gray-100"
                        aria-label="Rename investigation"
                      />
                    ) : (
                      <p
                        className="text-sm text-gray-200 truncate font-medium"
                        onDoubleClick={(e) => startRename(e, conv)}
                        title="Double-click to rename"
                      >
                        {conv.title}
                      </p>
                    )}
                    {conv.snippet && isSearchMode && (
                      <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {conv.snippet}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>
                        {conv.messageCount} messages &middot; {timeAgo(conv.updatedAt)}
                      </span>
                      {isRunning && (
                        <span className="inline-flex items-center gap-1 text-accent-light">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                          Running
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => startRename(e, conv)}
                      className="text-gray-400 hover:text-gray-200 p-1.5 rounded hover:bg-surface-3"
                      aria-label={`Rename investigation: ${conv.title}`}
                      title="Rename"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete({ id: conv.id, title: conv.title });
                      }}
                      className="text-gray-400 hover:text-red-400 p-1.5 rounded hover:bg-surface-3"
                      aria-label={`Delete investigation: ${conv.title}`}
                      title="Delete"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
