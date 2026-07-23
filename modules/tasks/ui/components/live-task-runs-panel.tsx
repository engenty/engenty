import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@engenty/ui-core";
import { Bot, ChevronDown, Copy, Square } from "lucide-react";
import { useState } from "react";
import type { TaskActivity, TaskRun } from "../../src/schema/types.js";
import { useTaskRunObserverContext } from "../context/task-run-observer-context.js";
import { formatActivityTimeLabel } from "../lib/format-activity-time.js";
import { formatAgentTypeKey } from "../lib/format-assignee.js";
import { resolveRunStarterLabel } from "../lib/resolve-run-starter.js";
import { isTaskRunLiveActive } from "../lib/task-run-live.js";
import { TaskRunObserverBody } from "./task-run-observer-panel.js";

interface LiveTaskRunsPanelProps {
  activity?: TaskActivity[];
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  disabled?: boolean;
  onRelease?: (run: TaskRun) => void;
  onViewRun?: (run: TaskRun) => void;
  releasing?: boolean;
  runs: TaskRun[];
}

/**
 * How long the run took, at the coarsest unit that still reads precisely:
 * `14s`, `32m`, `1h`. Null when either end of the interval is missing — a
 * duration guessed from one timestamp would be a lie.
 */
export function formatRunDuration(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined
): string | null {
  if (!(startedAt && finishedAt)) {
    return null;
  }
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.round(minutes / 60)}h`;
}

function resolveStartedByLabel(
  run: TaskRun,
  activity: TaskActivity[] | undefined,
  assigneeProfiles?: Map<string, { full_name: string; id: string }>
): string | null {
  if (run.created_by_user_id) {
    const known = assigneeProfiles?.get(run.created_by_user_id)?.full_name;
    if (known) {
      return known;
    }
    // Headless runs are started by the AI service principal, which is not a
    // team member — a truncated uuid tells the reader nothing, so fall through
    // to the activity trail (or the plain "started {when}" phrasing) instead.
    return null;
  }
  if (activity?.length) {
    return resolveRunStarterLabel(
      run.agent_session_run_id,
      activity,
      assigneeProfiles
    );
  }
  return null;
}

async function copyRunId(runId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(runId);
  } catch {
    // Clipboard unavailable — ignore.
  }
}

function TaskRunCard({
  activity,
  assigneeProfiles,
  disabled,
  onRelease,
  onViewRun,
  releasing,
  run,
}: {
  activity?: TaskActivity[];
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  disabled: boolean;
  onRelease?: (run: TaskRun) => void;
  onViewRun?: (run: TaskRun) => void;
  releasing: boolean;
  run: TaskRun;
}) {
  const { t } = useTranslation("tasks");
  const observer = useTaskRunObserverContext();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const attached = observer.view?.runId === run.agent_session_run_id;

  const active = isTaskRunLiveActive(run);
  const agentLabel = run.agent_type_key
    ? formatAgentTypeKey(run.agent_type_key)
    : t("detail.liveRunUnknownAgent");
  const startedBy = resolveStartedByLabel(run, activity, assigneeProfiles);
  // A finished run's useful facts are when it ENDED and how long it
  // took — "started 10m ago" on a run that ended 7 minutes ago reads
  // as if it were still going.
  const finishedAt = run.finished_at ?? run.run_finished_at ?? null;
  const duration = formatRunDuration(
    run.run_started_at ?? run.created_at,
    finishedAt
  );
  const subtitle =
    !active && finishedAt
      ? duration
        ? t("detail.liveRunFinishedAtWithDuration", {
            duration,
            when: formatActivityTimeLabel(finishedAt, t),
          })
        : t("detail.liveRunFinishedAt", {
            when: formatActivityTimeLabel(finishedAt, t),
          })
      : null;
  const when = formatActivityTimeLabel(run.run_started_at ?? run.created_at, t);

  return (
    <div className="ui-canvas-panel space-y-3 rounded-lg bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{agentLabel}</p>
            <p className="text-muted-foreground text-xs">
              {subtitle ??
                (startedBy
                  ? t("detail.liveRunStartedBy", {
                      when,
                      name: startedBy,
                    })
                  : t("detail.liveRunStarted", { when }))}
            </p>
          </div>
        </div>
        <Badge variant={active ? "default" : "secondary"}>
          {active ? t("detail.liveRunInProgress") : t("detail.liveRunFinished")}
        </Badge>
      </div>

      {/* One muted expander for everything secondary: the run id and the run
          log. The log used to sit behind its own prominent button (and before
          that, a whole second panel) — but nobody needs the transcript by
          default, and two controls for one run is what made this card
          unreadable. Opening it attaches the observer, so the transcript is
          fetched only when asked for. */}
      <Collapsible
        onOpenChange={(next) => {
          setDetailsOpen(next);
          if (next && !attached) {
            onViewRun?.(run);
          }
        }}
        open={detailsOpen}
      >
        <CollapsibleTrigger className="flex w-full items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
          <ChevronDown
            className={`size-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
          />
          {t("detail.liveRunViewDetails")}
        </CollapsibleTrigger>
        {/* `role` is not shown: the column allows checkout|work|review
                    but only "checkout" is ever written, so it told the reader
                    nothing. */}
        <CollapsibleContent className="mt-2 space-y-2 text-muted-foreground text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono">
              {t("detail.liveRunId", {
                id: run.agent_session_run_id.slice(0, 8),
              })}
            </span>
            <Button
              aria-label={t("detail.copyRunId")}
              className="size-7"
              onClick={() => void copyRunId(run.agent_session_run_id)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          {attached ? <TaskRunObserverBody /> : null}
        </CollapsibleContent>
      </Collapsible>

      {active && onRelease ? (
        <Button
          disabled={disabled || releasing}
          onClick={() => onRelease(run)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Square className="mr-1.5 size-3.5" />
          {t("detail.releaseCheckout")}
        </Button>
      ) : null}
    </div>
  );
}

export function LiveTaskRunsPanel({
  runs,
  onRelease,
  onViewRun,
  releasing = false,
  disabled = false,
  activity,
  assigneeProfiles,
}: LiveTaskRunsPanelProps) {
  const { t } = useTranslation("tasks");

  if (runs.length === 0) {
    return null;
  }

  // "Live runs" only when something is actually executing; otherwise this is
  // run history and the heading should say so.
  const anyActive = runs.some((run) => isTaskRunLiveActive(run));

  return (
    <section className="space-y-2">
      <h2 className="font-medium text-sm">
        {anyActive ? t("detail.liveRuns") : t("detail.runHistory")}
      </h2>
      {/* No outer Card: each row is already a framed, padded card, and
          wrapping them in another one produced a box-in-a-box with two sets of
          padding. (A previous attempt passed `p-0`, which tailwind-merge
          applies only to the base breakpoint — the variant's `sm:p-4` survived
          and kept the inset on every screen wider than 640px.) */}
      <div className="space-y-2">
        {runs.map((run) => (
          <TaskRunCard
            activity={activity}
            assigneeProfiles={assigneeProfiles}
            disabled={disabled}
            key={run.id}
            onRelease={onRelease}
            onViewRun={onViewRun}
            releasing={releasing}
            run={run}
          />
        ))}
      </div>
    </section>
  );
}
