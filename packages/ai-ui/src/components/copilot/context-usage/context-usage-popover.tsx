"use client";

import { cn, Popover, PopoverContent, PopoverTrigger } from "@engenty/ui-core";
import { type ReactNode, useState } from "react";
import {
  formatUsageCostMicros,
  freshInputTokens,
  sumThreadUsageTokens,
  type ThreadUsageTotals,
} from "../../../ag-ui/thread-usage/format-thread-usage.js";
import { useDeveloperModeEnabled } from "../../ag-ui-inspector/ag-ui-inspector-hooks.js";
import {
  type ContextUsageLevel,
  contextUsageCostUsd,
  contextUsageLevel,
  contextUsageRatio,
  formatCostUsd,
  formatRunDuration,
  formatTokenCount,
  type ThreadContextUsage,
} from "./context-usage-model.js";
import { PromptPreviewDialog } from "./prompt-preview-dialog.js";
import { ThreadUsageDialog } from "./thread-usage-dialog.js";

const BAR_CLASS: Record<ContextUsageLevel, string> = {
  critical: "bg-destructive",
  high: "bg-amber-500",
  normal: "bg-primary",
};

export interface ContextUsagePopoverProps {
  children: ReactNode;
  className?: string;
  contextUsage: ThreadContextUsage | null;
  /**
   * Enables the developer-mode prompt breakdown behind the Prompt row. Absent =
   * no drill-in, which is the correct state for every surface that does not know
   * which thread the number belongs to.
   */
  threadId?: string | null;
  totals: ThreadUsageTotals | null;
}

/**
 * Detail panel behind the composer's usage line.
 *
 * The line itself carries only the three numbers worth reading mid-task (run
 * tokens, thread total, run duration); everything that needs a denominator or
 * a breakdown lives here, so the composer row stays one line.
 */
export function ContextUsagePopover({
  children,
  className,
  contextUsage,
  threadId,
  totals,
}: ContextUsagePopoverProps) {
  const developerMode = useDeveloperModeEnabled();
  // The popover and the dialog are SIBLINGS, not nested. A dialog rendered
  // inside `PopoverContent` unmounts the moment the popover closes — which is
  // the same click that opens it.
  const [promptOpen, setPromptOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const ratio = contextUsage ? contextUsageRatio(contextUsage) : null;
  const level = contextUsage ? contextUsageLevel(contextUsage) : "normal";
  const runCost = contextUsage ? contextUsageCostUsd(contextUsage) : null;
  const totalCost = totals
    ? formatUsageCostMicros(totals.cost_micros, totals.currency)
    : null;
  const canInspectPrompt = developerMode && Boolean(threadId);
  // The usage drill-in reads RECORDED events, not a reconstruction: it exists
  // in every build, so it is gated on having a thread and nothing else.
  const openUsage = threadId
    ? () => {
        setPopoverOpen(false);
        setUsageOpen(true);
      }
    : undefined;

  return (
    <>
      <Popover onOpenChange={setPopoverOpen} open={popoverOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          align="end"
          className={cn("w-[min(100vw-1.5rem,320px)] p-0", className)}
          side="top"
          sideOffset={8}
        >
          {contextUsage ? (
            <section className="space-y-2 border-b px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-sm">Context window</span>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    level === "critical" && "font-medium text-destructive",
                    level === "high" &&
                      "font-medium text-amber-600 dark:text-amber-400",
                    level === "normal" && "text-muted-foreground"
                  )}
                >
                  {formatTokenCount(contextUsage.prompt_tokens)}
                  {contextUsage.context_tokens == null
                    ? null
                    : ` / ${formatTokenCount(contextUsage.context_tokens)}`}
                  {ratio == null ? null : ` (${Math.round(ratio * 100)}%)`}
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
                    // Clamped: a stale catalog window can be smaller than the
                    // prompt. The label above still shows the true percentage.
                    style={{ width: `${Math.min(100, ratio * 100)}%` }}
                  />
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {contextUsage.model_display_name ??
                  contextUsage.model_id ??
                  "Unknown model"}
              </p>
            </section>
          ) : null}

          {contextUsage ? (
            <section className="space-y-1 border-b px-3 py-2.5">
              <h4 className="pb-0.5 text-muted-foreground text-xxs uppercase tracking-[0.1em]">
                Last run
              </h4>
              <DetailRow
                label="Prompt"
                onInspect={
                  canInspectPrompt
                    ? () => {
                        setPopoverOpen(false);
                        setPromptOpen(true);
                      }
                    : undefined
                }
                value={formatTokenCount(contextUsage.prompt_tokens)}
              />
              <DetailRow
                label="Completion"
                value={
                  contextUsage.completion_tokens == null
                    ? "—"
                    : formatTokenCount(contextUsage.completion_tokens)
                }
              />
              <DetailRow
                label="Duration"
                value={formatRunDuration(contextUsage.duration_ms)}
              />
              <DetailRow
                label="Cost"
                value={runCost == null ? "—" : formatCostUsd(runCost)}
              />
            </section>
          ) : null}

          {totals ? (
            <section className="space-y-1 px-3 py-2.5">
              <h4 className="pb-0.5 text-muted-foreground text-xxs uppercase tracking-[0.1em]">
                Thread total
              </h4>
              <DetailRow
                label="Input"
                onInspect={openUsage}
                value={formatTokenCount(totals.input_tokens)}
              />
              {/* Indented sub-rows, because cached and reasoning are SLICES of
                  the two lines above them, not further dimensions to add. */}
              {totals.cached_tokens > 0 ? (
                <DetailRow
                  indent
                  label="from cache"
                  value={formatTokenCount(totals.cached_tokens)}
                />
              ) : null}
              {totals.cached_tokens > 0 ? (
                <DetailRow
                  indent
                  label="fresh"
                  value={formatTokenCount(freshInputTokens(totals))}
                />
              ) : null}
              <DetailRow
                label="Output"
                onInspect={openUsage}
                value={formatTokenCount(totals.output_tokens)}
              />
              {totals.reasoning_tokens > 0 ? (
                <DetailRow
                  indent
                  label="reasoning"
                  value={formatTokenCount(totals.reasoning_tokens)}
                />
              ) : null}
              <DetailRow
                label="All tokens"
                onInspect={openUsage}
                value={formatTokenCount(sumThreadUsageTokens(totals))}
              />
              <DetailRow
                label="Runs"
                onInspect={openUsage}
                value={String(totals.event_count)}
              />
              <DetailRow
                label="Cost"
                onInspect={openUsage}
                value={totalCost ?? "—"}
              />
            </section>
          ) : null}
        </PopoverContent>
      </Popover>
      <PromptPreviewDialog
        onOpenChange={setPromptOpen}
        open={promptOpen}
        threadId={threadId ?? null}
      />
      <ThreadUsageDialog
        onOpenChange={setUsageOpen}
        open={usageOpen}
        threadId={threadId ?? null}
      />
    </>
  );
}

function DetailRow({
  indent,
  label,
  onInspect,
  value,
}: {
  /** Marks the row as a slice of the row above it. */
  indent?: boolean;
  label: string;
  /** Makes the value a link into the matching drill-in. */
  onInspect?: () => void;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span
        className={cn("text-muted-foreground", indent && "pl-3 opacity-80")}
      >
        {label}
      </span>
      {onInspect ? (
        <button
          className="rounded-sm tabular-nums underline decoration-dotted underline-offset-2 outline-none transition-colors hover:text-primary focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onInspect}
          title="Show the breakdown behind this number"
          type="button"
        >
          {value}
        </button>
      ) : (
        <span className="tabular-nums">{value}</span>
      )}
    </div>
  );
}
