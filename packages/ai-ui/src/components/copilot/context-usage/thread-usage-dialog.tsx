"use client";

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { Copy } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { formatUsageCostMicros } from "../../../ag-ui/thread-usage/format-thread-usage.js";
import { formatTokenCount } from "./context-usage-model.js";
import {
  type ThreadUsageEvent,
  useThreadUsageEvents,
} from "./thread-usage-events-api.js";
import {
  cacheHitRatio,
  formatUsageEventTime,
  largestRunInputTokens,
  summarizeUsageEvents,
  type ThreadUsageSummary,
} from "./thread-usage-model.js";

/** Runs listed by default. Long agentic threads run into the dozens. */
const CALL_PREVIEW_LIMIT = 15;

const SPLIT_BAR_CLASS = {
  cached: "bg-sky-500",
  fresh: "bg-primary",
  output: "bg-amber-500",
} as const;

export interface ThreadUsageDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  threadId: string | null;
}

/**
 * Where a thread's tokens went: one row per metered run.
 *
 * The popover's thread total answers "how much", and reliably surprises people
 * — a short chat reports six figures. The answer is almost never the text in
 * the thread: every model call re-sends the entire prompt, and one run makes
 * one call per step, so the total is roughly `steps × prompt`. So this panel
 * leads with the run count and the heaviest run (the two factors), then splits
 * the input into what was cache-read and what was paid for fresh, and only
 * then lists the runs.
 */
export function ThreadUsageDialog({
  onOpenChange,
  open,
  threadId,
}: ThreadUsageDialogProps) {
  const { error, events, isLoading } = useThreadUsageEvents({
    enabled: open,
    threadId,
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[85vh] w-[min(100vw-2rem,920px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Token usage</DialogTitle>
          <DialogDescription>
            Every run this thread has been billed for.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading && !events ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : null}
          {error && !events ? (
            <p className="text-destructive text-sm">
              Could not load the usage events: {error.message}
            </p>
          ) : null}
          {events && events.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No metered runs recorded for this thread yet.
            </p>
          ) : null}
          {events && events.length > 0 ? (
            <ThreadUsageBody events={events} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ThreadUsageBody({ events }: { events: ThreadUsageEvent[] }) {
  const [showAllCalls, setShowAllCalls] = useState(false);
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => summarizeUsageEvents(events), [events]);
  const largestRun = useMemo(() => largestRunInputTokens(events), [events]);
  const json = useMemo(() => JSON.stringify(events, null, 2), [events]);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [json]);

  const cacheRatio = cacheHitRatio(summary);
  const cost = formatUsageCostMicros(summary.costMicros, summary.currency);
  // Newest call first in the list — the reader almost always came here from a
  // number that just moved.
  const ordered = useMemo(() => [...events].reverse(), [events]);
  const calls = showAllCalls ? ordered : ordered.slice(0, CALL_PREVIEW_LIMIT);
  const maxCallTokens = Math.max(
    1,
    ...events.map((event) => event.input_tokens + event.output_tokens)
  );

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-medium text-sm">
            {formatTokenCount(summary.totalTokens)} tokens over{" "}
            {summary.callCount} {summary.callCount === 1 ? "run" : "runs"}
            {cost ? ` · ${cost}` : null}
          </h3>
          <Button
            className="h-7 gap-1.5 text-xs"
            onClick={() => void handleCopy()}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Copy className="size-3.5" />
            {copied ? "Copied" : "Copy JSON"}
          </Button>
        </div>

        <SplitBar summary={summary} />
        <dl className="space-y-1">
          <SplitRow
            label="Fresh input (paid per token)"
            tokens={summary.freshInputTokens}
            tone="fresh"
            total={summary.totalTokens}
          />
          <SplitRow
            label="Cached input (re-read prompt)"
            tokens={summary.cachedTokens}
            tone="cached"
            total={summary.totalTokens}
          />
          <SplitRow
            label="Output"
            tokens={summary.outputTokens}
            tone="output"
            total={summary.totalTokens}
          />
        </dl>
        {summary.reasoningTokens > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {formatTokenCount(summary.reasoningTokens)} of the output was
            reasoning.
          </p>
        ) : null}
      </section>

      {/* The explanation, not a footnote: without it the total reads as if the
          conversation itself were enormous. */}
      <section className="space-y-1 rounded-md border bg-muted/40 px-3 py-2.5">
        <h4 className="text-muted-foreground text-xxs uppercase tracking-[0.1em]">
          Why the total is bigger than the conversation
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Every model call re-sends the whole prompt — system instructions, tool
          definitions and history — and a run makes one call per step, so a run
          that uses two tools sends that prompt three times. The heaviest run
          here moved {formatTokenCount(largestRun)} input tokens across all its
          steps. The total grows with steps and tool schemas, not with what you
          typed.
          {cacheRatio == null
            ? null
            : ` ${Math.round(cacheRatio * 100)}% of the input was served from the prompt cache.`}{" "}
          Open the prompt breakdown to see what fills that prompt.
        </p>
      </section>

      <section className="space-y-1.5">
        <h4 className="text-muted-foreground text-xxs uppercase tracking-[0.1em]">
          Runs, newest first
        </h4>
        <ul className="divide-y rounded-md border">
          {calls.map((event) => (
            <CallRow event={event} key={event.id} maxTokens={maxCallTokens} />
          ))}
        </ul>
        {ordered.length > CALL_PREVIEW_LIMIT ? (
          <Button
            className="h-7 text-xs"
            onClick={() => setShowAllCalls((current) => !current)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {showAllCalls ? "Show fewer" : `Show all ${ordered.length} runs`}
          </Button>
        ) : null}
      </section>

      {summary.modelIds.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {summary.modelIds.length === 1
            ? `Model: ${summary.modelIds[0]}`
            : `Models: ${summary.modelIds.join(", ")}`}
        </p>
      ) : null}
    </div>
  );
}

function SplitBar({ summary }: { summary: ThreadUsageSummary }) {
  const total = summary.totalTokens || 1;
  const segments = [
    { key: "fresh" as const, tokens: summary.freshInputTokens },
    { key: "cached" as const, tokens: summary.cachedTokens },
    { key: "output" as const, tokens: summary.outputTokens },
  ];
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {segments.map((segment) => (
        <div
          className={SPLIT_BAR_CLASS[segment.key]}
          key={segment.key}
          style={{ width: `${(segment.tokens / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

function SplitRow({
  label,
  tokens,
  tone,
  total,
}: {
  label: string;
  tokens: number;
  tone: keyof typeof SPLIT_BAR_CLASS;
  total: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <span
          className={cn("size-2 shrink-0 rounded-full", SPLIT_BAR_CLASS[tone])}
        />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="shrink-0 tabular-nums">
        {formatTokenCount(tokens)} · {Math.round((tokens / (total || 1)) * 100)}
        %
      </dd>
    </div>
  );
}

function CallRow({
  event,
  maxTokens,
}: {
  event: ThreadUsageEvent;
  maxTokens: number;
}) {
  const cost = formatUsageCostMicros(event.cost_micros, event.currency);
  const fresh = Math.max(0, event.input_tokens - event.cached_tokens);
  const callTokens = event.input_tokens + event.output_tokens;
  return (
    <li className="space-y-1 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="truncate">
          {formatUsageEventTime(event.occurred_at)}
          <span className="ml-2 text-muted-foreground">{event.feature}</span>
        </span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {formatTokenCount(callTokens)}
          {cost ? ` · ${cost}` : null}
        </span>
      </div>
      {/* Per-call bar against the biggest call: an agentic turn's growth is a
          shape, and a column of numbers hides it. */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={SPLIT_BAR_CLASS.fresh}
          style={{ width: `${(fresh / maxTokens) * 100}%` }}
        />
        <div
          className={SPLIT_BAR_CLASS.cached}
          style={{ width: `${(event.cached_tokens / maxTokens) * 100}%` }}
        />
        <div
          className={SPLIT_BAR_CLASS.output}
          style={{ width: `${(event.output_tokens / maxTokens) * 100}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {formatTokenCount(fresh)} fresh ·{" "}
        {formatTokenCount(event.cached_tokens)} cached ·{" "}
        {formatTokenCount(event.output_tokens)} out
      </p>
    </li>
  );
}
