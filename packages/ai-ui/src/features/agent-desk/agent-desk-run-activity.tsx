"use client";

// The agent reporting in, while it is working.
//
// A routine fire never touches the chat someone has open: it runs in its own
// unattended thread, so the lane stayed completely silent from the tick until
// the fire showed up in the feed, finished. That is the wrong way round — the
// only reason to trust an agent that works on a schedule is seeing it work.
//
// This card is that. It names the routine, walks the workflow's own steps as
// the run moves through them (the graph's labels, not the tool ids the stream
// carries), says how long it has been at it, and ends on the result or the
// error — the RUN's outcome, not the thread's status, so a fire that failed
// says so. Opening it binds the lane to the fire's own thread, where the
// agent's transcript streams, and opens the run beside it with the graph;
// while the lane is already there the card steps aside rather than narrating
// the transcript twice.
//
// A gate the run parks on is answered in that pane or in the composer dock
// (`useDeskWizardStep`); the card says it is waiting and takes you there.

import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { Button, cn } from "@engenty/ui-core";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Circle,
  CircleSlash,
  Loader2,
  PauseCircle,
  Repeat2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { resolveAgentDisplayName } from "../../ag-ui/resolve-transcript-tool-display.js";
import { MessageResponse } from "../../components/presentation.js";
import type { WorkflowRunActivity } from "../../hooks/use-workflow-run-status.js";
import {
  type ActionRunPhase,
  useWorkflowRunStatus,
} from "../../hooks/use-workflow-run-status.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname.js";
import { storedGraphToCanvas } from "../workflow-canvas/graph-model.js";
import type { GraphRunSnapshotDto } from "../workflow-canvas/workflow-api.js";
import {
  useReviewRunMutation,
  useWorkflowRunQuery,
  workflowKeys,
} from "../workflow-canvas/workflow-queries.js";
import { conversationEngagement } from "./agent-desk-url.js";
import { agentDeskKeys } from "./use-agent-desk-feed.js";
import { useAgentRoutineActivity } from "./use-agent-routine-activity.js";

type StepState = GraphRunSnapshotDto["nodes"][string]["state"];

interface RunStep {
  id: string;
  state: StepState;
  title: string;
}

const PHASE_TONE: Record<ActionRunPhase, string> = {
  completed: "text-emerald-600 dark:text-emerald-400",
  failed: "text-destructive",
  paused: "text-muted-foreground",
  requires_action: "text-amber-600 dark:text-amber-400",
  running: "text-amber-600 dark:text-amber-400",
  stopped: "text-muted-foreground",
};

function PhaseIcon({ phase }: { phase: ActionRunPhase }) {
  const className = cn("size-3.5 shrink-0", PHASE_TONE[phase]);
  switch (phase) {
    case "running":
      return <Loader2 aria-hidden className={cn(className, "animate-spin")} />;
    case "completed":
      return <CheckCircle2 aria-hidden className={className} />;
    case "requires_action":
      return <AlertCircle aria-hidden className={className} />;
    case "paused":
      return <PauseCircle aria-hidden className={className} />;
    case "stopped":
      return <CircleSlash aria-hidden className={className} />;
    default:
      return <XCircle aria-hidden className={className} />;
  }
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "running") {
    return (
      <Loader2
        aria-hidden
        className="size-3 shrink-0 animate-spin text-amber-600 dark:text-amber-400"
      />
    );
  }
  if (state === "done" || state === "skipped") {
    return (
      <CheckCircle2
        aria-hidden
        className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
      />
    );
  }
  if (state === "waiting-approval") {
    return (
      <AlertCircle
        aria-hidden
        className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
      />
    );
  }
  if (state === "failed") {
    return <XCircle aria-hidden className="size-3 shrink-0 text-destructive" />;
  }
  return (
    <Circle aria-hidden className="size-3 shrink-0 text-muted-foreground/60" />
  );
}

/**
 * One drawn step can be several graph entries (an agent step is its brief,
 * then the agent). The step is as far along as its least finished entry —
 * never done while one of them still runs.
 */
function combinedStepState(states: StepState[]): StepState {
  for (const state of [
    "failed",
    "waiting-approval",
    "running",
    "sleeping",
  ] as const satisfies StepState[]) {
    if (states.includes(state)) {
      return state;
    }
  }
  if (
    states.length > 0 &&
    states.every((s) => s === "done" || s === "skipped")
  ) {
    return "done";
  }
  return states.some((s) => s === "done") ? "running" : "idle";
}

/** `12s`, `4m 05s`, `1h 02m` — how long the run has been at it. */
function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  }
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * What the run is doing right now, in words — from the step's latest tool
 * call. Never a tool name: a call without a phrase of its own reads as
 * "working".
 */
function describeRunActivity(
  activity: WorkflowRunActivity,
  t: (key: string, values?: Record<string, string>) => string
): string {
  const { args, toolName } = activity;
  const key = "agentDesk.activity.now";
  switch (toolName) {
    case "web_search":
      return args.query
        ? t(`${key}.webSearch`, { query: args.query })
        : t(`${key}.working`);
    case "web_fetch": {
      let source = args.url ?? "";
      try {
        source = new URL(source).hostname.replace(/^www\./, "");
      } catch {
        // not a URL — say it as given
      }
      return source ? t(`${key}.webFetch`, { source }) : t(`${key}.working`);
    }
    case "artifact_write":
      return args.title
        ? t(`${key}.writing`, { title: args.title })
        : t(`${key}.writingUntitled`);
    case "artifact_read":
    case "show_artifact":
      return t(`${key}.reading`);
    case "skill":
    case "skill_search":
      return t(`${key}.guide`);
    case "memory_note":
      return t(`${key}.noting`);
    case "engenty_tools_search":
    case "engenty_tools_discover":
    case "engenty_tools_modules":
      return t(`${key}.lookingUp`);
    default:
      return t(`${key}.working`);
  }
}

/** A clock that ticks once a second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function AgentDeskRunActivity(props: {
  agentId: string;
  locale: string;
  spaceId: string;
  /** The thread the lane is bound to — the card hides when it is this fire's. */
  threadId: string | null;
}) {
  const { t } = useTranslation("ai-ui");
  const [searchParams, setSearchParams] = useSearchParams();
  const [dismissedRunId, setDismissedRunId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const activity = useAgentRoutineActivity({ agentId: props.agentId });
  // Null while the lane is bound to this very fire: the transcript is already
  // streaming it, and a second attach would replay the same run twice.
  const watchedRunId =
    activity && activity.threadId !== props.threadId ? activity.runId : null;
  const { cancel, isCancelling, state } = useWorkflowRunStatus(watchedRunId);
  // The graph and where the run stands in it — polled while it runs.
  const run = useWorkflowRunQuery(watchedRunId ?? undefined);
  const snapshot = run.data?.snapshot ?? null;
  const graph = run.data?.version.graph ?? null;
  const steps = useMemo<RunStep[]>(() => {
    if (!graph) {
      return [];
    }
    const nodes = snapshot?.nodes ?? {};
    return storedGraphToCanvas(graph).nodes.map((node) => ({
      id: node.id,
      state: combinedStepState(
        node.data.entryIds.flatMap((entryId) => {
          const state = nodes[entryId]?.state;
          return state ? [state] : [];
        })
      ),
      // An agent node is titled by its agent id; people read the name.
      title:
        node.data.kind === "agent"
          ? resolveAgentDisplayName(node.data.title)
          : node.data.kind === "artifact"
            ? t("agentDesk.activity.stepStore")
            : node.data.title,
    }));
  }, [graph, snapshot?.nodes, t]);

  const phase = state?.phase ?? null;
  const doingNow =
    phase === "running" && state?.activity
      ? describeRunActivity(state.activity, t)
      : null;
  const gate = snapshot?.gate ?? null;
  // Parked with no gate is a review hold (`report: ask`): the fire finished
  // and waits for a look.
  const heldForReview = phase === "requires_action" && run.isSuccess && !gate;
  const review = useReviewRunMutation();
  const now = useNow(phase === "running");
  const startedAt = run.data?.request.created_at
    ? Date.parse(run.data.request.created_at)
    : null;

  // A settled fire is a new thread on the desk. The feed is a snapshot taken
  // before the fire existed, so nothing would list it until the next load.
  const settled = Boolean(phase && phase !== "running");
  const settledRunId = settled ? watchedRunId : null;
  useEffect(() => {
    if (!settledRunId) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: agentDeskKeys.feed(props.spaceId, props.agentId, props.locale),
    });
    // The run's summary is written as it settles, after polling stopped.
    void queryClient.invalidateQueries({
      queryKey: workflowKeys.run(settledRunId),
    });
  }, [props.agentId, props.locale, props.spaceId, queryClient, settledRunId]);

  if (
    !(activity && state && phase && watchedRunId) ||
    watchedRunId === dismissedRunId
  ) {
    return null;
  }

  const name = activity.title ?? t("agentDesk.activity.unnamed");
  // A routine's agent works in its own run, so its words never stream on
  // this one; the run's summary is what it reported.
  const resultText = state.text || run.data?.request.summary || "";
  // The fire's chat on the left, the run with its graph in the pane.
  const openRun = () => {
    const next = new URLSearchParams(searchParams);
    next.set("engagement", conversationEngagement(activity.threadId));
    next.set("panel", "runs");
    next.set("run", activity.runId);
    next.delete("tab");
    next.delete("action");
    next.delete("workflow");
    setSearchParams(next);
  };

  const statusLabel =
    phase === "running"
      ? startedAt
        ? t("agentDesk.activity.runningFor", {
            elapsed: formatElapsed(now - startedAt),
          })
        : t("agentDesk.activity.starting")
      : phase === "completed"
        ? t("agentDesk.activity.completed")
        : phase === "requires_action"
          ? t("agentDesk.activity.requiresAction")
          : phase === "paused"
            ? t("agentDesk.activity.paused")
            : phase === "stopped"
              ? t("agentDesk.activity.stopped")
              : t("agentDesk.activity.failed");

  return (
    <div
      className={cn(
        "ui-card-panel space-y-2.5 p-3 text-xs",
        (phase === "requires_action" || gate) && "border-amber-500/40"
      )}
      data-testid="routine-run-card"
    >
      <div className="flex items-center gap-2">
        <Repeat2
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <button
          className="min-w-0 flex-1 truncate text-left font-medium text-foreground text-sm hover:underline"
          onClick={openRun}
          type="button"
        >
          {name}
        </button>
        {cancel ? (
          <Button
            className="h-6 px-2 text-xs"
            disabled={isCancelling}
            onClick={cancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            {isCancelling ? t("actionsRun.stopping") : t("actionsRun.stop")}
          </Button>
        ) : null}
        <Button
          className="h-6 px-2 text-xs"
          onClick={openRun}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("agentDesk.activity.open")}
        </Button>
        <Button
          aria-label={t("agentDesk.activity.dismiss")}
          className="h-6 w-6 p-0"
          onClick={() => setDismissedRunId(activity.runId)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X aria-hidden className="size-3.5" />
        </Button>
      </div>

      <div className={cn("flex items-center gap-1.5", PHASE_TONE[phase])}>
        <PhaseIcon phase={phase} />
        <span className="tabular-nums">{statusLabel}</span>
      </div>

      {doingNow ? (
        <div className="truncate text-muted-foreground" title={doingNow}>
          {doingNow}
        </div>
      ) : null}

      {steps.length > 0 ? (
        <ol
          aria-label={t("actionsRun.steps")}
          className="flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          {steps.map((step) => (
            <li
              className={cn(
                "inline-flex min-w-0 items-center gap-1",
                step.state === "running" || step.state === "waiting-approval"
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
              key={step.id}
            >
              <StepIcon state={step.state} />
              <span className="max-w-[16rem] truncate">{step.title}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {gate ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-500/10 px-2.5 py-2">
          <span className="min-w-0 text-amber-700 dark:text-amber-300">
            {gate.title
              ? t("agentDesk.activity.gateWaiting", { title: gate.title })
              : t("agentDesk.activity.requiresAction")}
          </span>
          <Button
            className="h-6 px-2 text-xs"
            onClick={openRun}
            size="sm"
            type="button"
          >
            {t("agentDesk.activity.decide")}
          </Button>
        </div>
      ) : null}

      {heldForReview ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-2">
          <span className="text-muted-foreground">
            {t("agentDesk.activity.reviewPrompt")}
          </span>
          <Button
            className="h-6 gap-1 px-2 text-xs"
            disabled={review.isPending}
            onClick={() =>
              review.mutate(watchedRunId, {
                onSuccess: () => void run.refetch(),
              })
            }
            size="sm"
            type="button"
          >
            <Check aria-hidden className="size-3.5" />
            {t("agentDesk.activity.markReviewed")}
          </Button>
        </div>
      ) : null}

      {state.error ? <p className="text-destructive">{state.error}</p> : null}
      {resultText && phase !== "running" ? (
        <div className="line-clamp-4 border-t pt-2">
          <MessageResponse className={COMPACT_MARKDOWN_PROSE_CLASSNAME}>
            {resultText}
          </MessageResponse>
        </div>
      ) : phase === "completed" ? (
        <p className="text-muted-foreground">
          {t("agentDesk.activity.noOutput")}
        </p>
      ) : null}
    </div>
  );
}
