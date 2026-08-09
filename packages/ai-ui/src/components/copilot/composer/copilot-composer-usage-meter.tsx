"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { sumThreadUsageTokens } from "../../../ag-ui/thread-usage/format-thread-usage.js";
import { useCopilotThreadUsage } from "../../../ag-ui/thread-usage/use-copilot-thread-usage.js";
import { useCopilotContextUsage } from "../context-usage/context-usage-api.js";
import {
  contextUsageLevel,
  formatRunDuration,
  formatTokenCount,
  runTokenTotal,
} from "../context-usage/context-usage-model.js";
import { ContextUsagePopover } from "../context-usage/context-usage-popover.js";
import { ContextUsageRing } from "../context-usage/context-usage-ring.js";

export interface CopilotComposerUsageMeterProps {
  chatStatus: "ready" | "streaming" | "submitted" | "error";
  className?: string;
  threadId: string | null;
}

/**
 * Usage line under the copilot composer, and the trigger for the detail panel.
 *
 * Three numbers inline — `89.2k / 3.7M · 4s` (run tokens, thread total, run
 * duration) — because the compact composer renders this in a fixed `h-7` row.
 * Anything needing a denominator or a breakdown (context window, per-run and
 * total cost, input/output/cached/reasoning split) lives in
 * {@link ContextUsagePopover}, which spells every figure out.
 *
 * Run tokens are prompt + completion, NOT the context figure: the window fill
 * is `prompt_tokens` alone, and showing that as "tokens used" would silently
 * drop everything the model wrote.
 */
export function CopilotComposerUsageMeter({
  chatStatus,
  className,
  threadId,
}: CopilotComposerUsageMeterProps) {
  const { t } = useTranslation("common");
  const { isLoading, usage: totals } = useCopilotThreadUsage({
    chatStatus,
    threadId,
  });
  const { usage: contextUsage } = useCopilotContextUsage({
    chatStatus,
    threadId,
  });

  if (!threadId) {
    return null;
  }

  if (!(contextUsage || totals)) {
    return (
      <p
        aria-live="polite"
        className={cn(
          "px-0.5 pt-1 text-muted-foreground text-xxs tabular-nums leading-snug",
          className
        )}
      >
        {isLoading ? t("copilot.usage.loading") : t("copilot.usage.empty")}
      </p>
    );
  }

  const level = contextUsage ? contextUsageLevel(contextUsage) : "normal";

  return (
    <ContextUsagePopover
      contextUsage={contextUsage}
      threadId={threadId}
      totals={totals}
    >
      <button
        aria-label="Token usage details"
        className={cn(
          "flex items-center gap-1.5 px-0.5 pt-1 text-muted-foreground text-xxs tabular-nums leading-snug",
          "rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
          className
        )}
        // The line drops the words "run"/"total" for width; keep the meaning
        // reachable.
        title="Last run tokens / thread total, then run duration"
        type="button"
      >
        <span>
          {contextUsage ? (
            <span
              className={cn(
                level === "critical" && "font-medium text-destructive",
                level === "high" &&
                  "font-medium text-amber-600 dark:text-amber-400"
              )}
            >
              {formatTokenCount(runTokenTotal(contextUsage))}
            </span>
          ) : null}
          {contextUsage && totals ? " / " : null}
          {totals ? formatTokenCount(sumThreadUsageTokens(totals)) : null}
          {contextUsage
            ? ` · ${formatRunDuration(contextUsage.duration_ms)}`
            : null}
        </span>
        {/* Trailing, like the model/effort controls it sits beside: the ring is
            the glanceable summary, the numbers are the detail before it. */}
        <ContextUsageRing usage={contextUsage} />
      </button>
    </ContextUsagePopover>
  );
}
