import React from "react";

export const inputClass =
  "w-full bg-surface-2 border border-border-subtle rounded-md px-2.5 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-accent/50 disabled:opacity-60 disabled:cursor-not-allowed";
export const monoInputClass = `${inputClass} font-mono text-xs`;

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-4 border-b border-border-subtle last:border-b-0">
      <h3 className="text-sm font-medium text-gray-200">{title}</h3>
      {description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function InfoBanner({ children, variant = "neutral" }: { children: React.ReactNode; variant?: "neutral" | "tip" }) {
  const styles =
    variant === "tip"
      ? "bg-accent/10 border-accent/25 text-gray-300"
      : "bg-surface-2 border-border-subtle text-gray-400";
  return (
    <p className={`text-xs leading-relaxed rounded-lg border px-3 py-2.5 ${styles}`}>{children}</p>
  );
}

export function FieldLabel({ htmlFor, children, hint }: { htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-gray-400 mb-1">
        {children}
      </label>
      {hint && <p className="text-[11px] text-gray-600 mb-1.5">{hint}</p>}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  ok: "bg-green-400",
  degraded: "bg-yellow-400",
  error: "bg-red-400",
};

export function StatusRow({
  label,
  detail,
  status = "ok",
  trailing,
}: {
  label: string;
  detail?: string;
  status?: string;
  trailing?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-surface-2/80 border border-border-subtle px-3 py-2.5">
      <span
        className={`mt-1 block w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[status] ?? "bg-gray-500"}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200">{label}</p>
        {detail && <p className="text-xs text-gray-500 mt-0.5">{detail}</p>}
      </div>
      {trailing && <span className="text-[10px] text-gray-600 shrink-0">{trailing}</span>}
    </div>
  );
}

export function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded border ${
        isAdmin
          ? "bg-accent/15 text-accent-light border-accent/30"
          : "bg-surface-3 text-gray-400 border-border-subtle"
      }`}
    >
      {isAdmin ? "Administrator" : "Analyst"}
    </span>
  );
}

export function NavItem({
  active,
  onClick,
  children,
  indent,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 sm:w-full text-left text-sm py-2 rounded-md transition-colors whitespace-nowrap sm:whitespace-normal ${
        indent ? "sm:pl-6 pr-3 sm:pr-3 pl-4" : "px-3"
      } ${
        active
          ? "bg-accent/15 text-accent-light font-medium"
          : "text-gray-400 hover:text-gray-200 hover:bg-surface-3"
      }`}
    >
      {children}
    </button>
  );
}

export function NavGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="hidden sm:block px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
      {children}
    </p>
  );
}
