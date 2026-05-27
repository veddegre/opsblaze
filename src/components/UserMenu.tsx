import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { logout, type PublicAuthUser } from "../lib/auth";
import { userMenuPanelClass } from "../lib/overlay-layout";

interface UserMenuProps {
  user: PublicAuthUser;
  onOpenAccount: () => void;
  onOpenPreferences: () => void;
}

export function UserMenu({ user, onOpenAccount, onOpenPreferences }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayName = user.name ?? user.email ?? "User";
  const initial = displayName.charAt(0).toUpperCase();

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const openSection = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg pl-1 pr-2 py-1 hover:bg-surface-3 transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center text-white text-xs font-semibold">
          {initial}
        </span>
        <span className="hidden md:inline text-xs text-gray-400 max-w-[120px] truncate">
          {displayName}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
            className={`${userMenuPanelClass} w-56 bg-surface-2/95 backdrop-blur-xl rounded-lg border border-border-subtle shadow-lg py-1`}
          >
            <div className="px-3 py-2 border-b border-border-subtle">
              <p className="text-sm text-gray-100 truncate">{displayName}</p>
              {user.email && <p className="text-xs text-gray-500 truncate">{user.email}</p>}
              <p className="text-[10px] text-gray-600 mt-1">
                {user.isAdmin ? "Administrator" : "Analyst"}
              </p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => openSection(onOpenAccount)}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-3 transition-colors"
            >
              My account
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openSection(onOpenPreferences)}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-3 transition-colors"
            >
              Runtime settings
            </button>
            <div className="my-1 border-t border-border-subtle" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                logout().then(() => window.location.reload());
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-surface-3 hover:text-gray-200 transition-colors"
            >
              Sign out
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
