import type { UsageData, ContextData } from "../lib/sse";

interface UsageBarProps {
  queryUsage: UsageData | null;
  contextUsage: ContextData | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function contextColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-accent";
}

export function UsageBar({ queryUsage, contextUsage }: UsageBarProps) {
  if (!queryUsage && !contextUsage) return null;

  return (
    <div className="flex items-center justify-between gap-4 text-[10px] text-gray-500 px-1 mt-1.5 mb-0.5 select-none">
      {queryUsage && (
        <div className="flex items-center gap-3">
          <span title="Input tokens">
            <span className="text-gray-600">in</span>{" "}
            <span className="text-gray-400">{formatTokens(queryUsage.inputTokens)}</span>
          </span>
          <span title="Output tokens">
            <span className="text-gray-600">out</span>{" "}
            <span className="text-gray-400">{formatTokens(queryUsage.outputTokens)}</span>
          </span>
          {(queryUsage.cacheReadTokens > 0 || queryUsage.cacheCreationTokens > 0) && (
            <span title="Cache tokens (read / created)" className="text-gray-600">
              cache {formatTokens(queryUsage.cacheReadTokens)}r
              {queryUsage.cacheCreationTokens > 0 &&
                ` / ${formatTokens(queryUsage.cacheCreationTokens)}w`}
            </span>
          )}
          <span title="Query cost" className="text-gray-400">
            {formatCost(queryUsage.totalCostUsd)}
          </span>
        </div>
      )}

      {contextUsage && contextUsage.maxTokens > 0 && (
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex items-center gap-2 shrink-0"
            title={`Context: ${formatTokens(contextUsage.totalTokens)} / ${formatTokens(contextUsage.maxTokens)}`}
          >
            <span className="text-gray-600">ctx</span>
            <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${contextColor(contextUsage.percentage)}`}
                style={{ width: `${Math.min(contextUsage.percentage, 100)}%` }}
              />
            </div>
            <span className="text-gray-400">{Math.round(contextUsage.percentage)}%</span>
          </div>
          {contextUsage.percentage >= 90 && (
            <span className="text-amber-400/90 truncate">
              Context nearly full — start a new investigation
            </span>
          )}
        </div>
      )}
    </div>
  );
}
