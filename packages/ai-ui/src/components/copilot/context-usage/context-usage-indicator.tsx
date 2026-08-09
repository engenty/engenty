"use client";

import { cn } from "@engenty/ui-core";
import {
  type ContextUsageLevel,
  contextUsageCostUsd,
  contextUsageLevel,
  contextUsageRatio,
  formatContextUsageLabel,
  formatCostUsd,
  formatTokenCount,
  type ThreadContextUsage,
} from "./context-usage-model.js";

const BAR_CLASS: Record<ContextUsageLevel, string> = {
  critical: "bg-destructive",
  high: "bg-amber-500",
  normal: "bg-primary",
};

export interface ContextUsageIndicatorProps {
  className?: string;
  /**
   * Drop the model/cost footer. Set where a cumulative usage line already
   * states the spend — repeating a per-run cost right under a thread total
   * reads as a contradiction, not as extra detail.
   */
  compact?: boolean;
  usage: ThreadContextUsage | null;
}

/**
 * Context-window meter for the active thread: how full the window was on the
 * last measured run, what it cost, and which model's window it is.
 *
 * Renders nothing without a measured run — an empty bar on a fresh thread
 * would read as "0% used" when the truth is "not yet known".
 */
export function ContextUsageIndicator({
  className,
  compact = false,
  usage,
}: ContextUsageIndicatorProps) {
  if (!usage) {
    return null;
  }

  const ratio = contextUsageRatio(usage);
  const level = contextUsageLevel(usage);
  const cost = contextUsageCostUsd(usage);
  const modelLabel = usage.model_display_name ?? usage.model_id;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Context</span>
        <span
          className={cn(
            "font-medium tabular-nums",
            level === "critical" && "text-destructive",
            level === "high" && "text-amber-600 dark:text-amber-400"
          )}
        >
          {formatContextUsageLabel(usage)}
        </span>
      </div>
      {ratio == null ? null : (
        <div
          aria-label="Context window usage"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(ratio * 100)}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className={cn("h-full rounded-full", BAR_CLASS[level])}
            // Clamped so an over-window prompt fills the track rather than
            // overflowing it; the label still shows the true percentage.
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      )}
      {compact ? null : (
        <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate" title={usage.model_id ?? undefined}>
            {modelLabel}
          </span>
          {cost == null ? null : (
            // Per-RUN, not per-thread: agent_run stores usage one run at a time.
            <span className="tabular-nums" title="Cost of the last run">
              {formatCostUsd(cost)}
              {usage.completion_tokens == null
                ? null
                : ` · ${formatTokenCount(usage.completion_tokens)} out`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
