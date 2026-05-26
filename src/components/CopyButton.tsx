import React, { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-[10px] px-2 py-0.5 rounded border border-border-subtle text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
