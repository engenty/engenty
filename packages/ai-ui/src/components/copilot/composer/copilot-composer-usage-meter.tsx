"use client";

import { sumEngentyUsageUpdateTokens } from "@engenty/ag-ui-bridge";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Asterisk } from "lucide-react";
import { sumThreadUsageTokens } from "../../../ag-ui/thread-usage/format-thread-usage.js";
import { useLiveRunUsage } from "../../../ag-ui/thread-usage/live-run-usage.js";
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
import { useRunElapsedMs } from "./use-run-elapsed-ms.js";

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
 *
 * Three states, because one layout cannot serve all of them:
 * - RUNNING: a spinning mark and a live `2m 31s · 2.4k tokens` clock. The
 *   server writes `duration_ms` only when the run finishes, so mid-turn there
 *   is nothing to read from it — and mid-turn is when "is it still working?"
 *   actually gets asked.
 * - IDLE with usage: the numeric line plus the filled ring.
 * - IDLE with none: the ring's empty track alone. A fresh thread reports a
 *   ZEROED usage summary rather than null, which rendered as a naked "0".
 */
export function CopilotComposerUsageMeter({
  chatStatus,
  className,
  threadId,
}: CopilotComposerUsageMeterProps) {
  const { t } = useTranslation("common");
  const { usage: totals } = useCopilotThreadUsage({
    chatStatus,
    threadId,
  });
  const { usage: contextUsage } = useCopilotContextUsage({
    chatStatus,
    threadId,
  });
  const isRunning = chatStatus === "streaming" || chatStatus === "submitted";
  const elapsedMs = useRunElapsedMs(isRunning);
  // Fed by the run's own stream (one CUSTOM event per model step), so the
  // number moves during the turn. The recorded totals only land afterwards.
  const liveUsage = useLiveRunUsage(threadId);

  if (!threadId) {
    return null;
  }

  const level = contextUsage ? contextUsageLevel(contextUsage) : "normal";
  const threadTokens = totals ? sumThreadUsageTokens(totals) : 0;
  // A thread with no finished run yet reports a ZEROED summary, not null — so
  // the line used to render a bare "0" with no ring and no duration beside it,
  // which reads as a bug rather than as "nothing used yet". Below the first
  // recorded token there is no number worth printing: the empty gauge says it.
  const hasNumbers = Boolean(contextUsage) || threadTokens > 0;
  // THIS run's tokens so far — the same figure that becomes the left-hand
  // number once the run settles, so the line does not change meaning when it
  // stops moving.
  const liveRunTokens = liveUsage ? sumEngentyUsageUpdateTokens(liveUsage) : 0;

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
        {isRunning ? (
          // While the turn runs there is no server-side duration yet (it is
          // written when the run finishes), so the line counts locally — a
          // clock that moves is the difference between "working" and "stuck".
          <>
            <Asterisk
              aria-hidden="true"
              className="size-3 shrink-0 animate-spin text-primary [animation-duration:1.8s]"
            />
            <span aria-live="off">
              {formatRunDuration(elapsedMs ?? 0)}
              {liveRunTokens > 0
                ? ` · ${t("copilot.usage.tokens", {
                    value: formatTokenCount(liveRunTokens),
                  })}`
                : null}
            </span>
          </>
        ) : (
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
            {contextUsage && hasNumbers ? " / " : null}
            {hasNumbers ? formatTokenCount(threadTokens) : null}
            {contextUsage
              ? ` · ${formatRunDuration(contextUsage.duration_ms)}`
              : null}
          </span>
        )}
        {/* Trailing, like the model/effort controls it sits beside: the ring is
            the glanceable summary, the numbers are the detail before it. It
            keeps its track when there is nothing to fill, so the control still
            has a shape on a fresh thread. */}
        <ContextUsageRing emptyPlaceholder usage={contextUsage} />
      </button>
    </ContextUsagePopover>
  );
}
