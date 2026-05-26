import React from "react";

interface AppNoticeProps {
  message: string | null;
  variant?: "error" | "info" | "success";
  onDismiss?: () => void;
}

const STYLES = {
  error: "bg-red-500/10 border-red-500/30 text-red-300",
  info: "bg-accent/10 border-accent/25 text-gray-300",
  success: "bg-green-500/10 border-green-500/30 text-green-300",
};

export function AppNotice({ message, variant = "error", onDismiss }: AppNoticeProps) {
  if (!message) return null;

  return (
    <div
      className={`shrink-0 px-4 py-2 text-sm border-b flex items-start justify-between gap-3 ${STYLES[variant]}`}
      role={variant === "error" ? "alert" : "status"}
    >
      <span className="leading-relaxed">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
