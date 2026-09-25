"use client";

// A graph run, viewed one suspension at a time.
//
// The runner has no logic of its own beyond next / back / cancel. What it
// shows is whatever the run is doing: the gate's surface while parked, the
// running step's label and streamed text between gates, the wake time while
// asleep, the outcome once settled. "Weiter" resumes, "Zurück" travels back
// to the previous gate on the rail, "Abbrechen" stops the run — the graph
// decides what any of it means.

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Skeleton } from "@engenty/ui-core";
import { Ban, CheckCircle2, Moon, RotateCcw, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { WorkspaceArtifactPane } from "../../artifacts/workspace-artifact-pane.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import { MessageResponse } from "../../components/presentation.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname.js";
import { WorkflowRunStatus } from "../agents-workspace/workflow-run-status.js";
import type {
  GraphRunAnswerDto,
  GraphRunSnapshotDto,
  WorkflowRunDto,
} from "../workflow-canvas/workflow-api.js";
import {
  useCancelRunMutation,
  useResumeRunMutation,
  useTimeTravelRunMutation,
} from "../workflow-canvas/workflow-queries.js";
import { GateSurfaceCard } from "./gate-surface-card.js";
import { useWizardOutcomeRecord } from "./use-wizard-outcome-record.js";
import { useWizardRun } from "./use-wizard-run.js";
import {
  gateStepsFromGraph,
  previousGateStep,
  WizardProgress,
} from "./wizard-progress.js";

export type WizardRunState =
  | "starting"
  | "gate"
  | "running"
  | "sleeping"
  | "completed"
  | "failed"
  | "cancelled";

/** The one state the page draws, from the run row and the snapshot. */
export function wizardRunState(
  request: WorkflowRunDto,
  snapshot: GraphRunSnapshotDto | null
): WizardRunState {
  if (request.status === "cancelled") {
    return "cancelled";
  }
  if (!snapshot) {
    return request.status === "failed" ? "failed" : "starting";
  }
  switch (snapshot.status) {
    case "suspended":
      return snapshot.gate ? "gate" : "completed";
    case "waiting":
      return "sleeping";
    case "success":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
    case "cancelled":
      return "cancelled";
    default:
      return "running";
  }
}

export interface WizardRunnerProps {
  /**
   * Mount the run's artifact pane under this host key, scoped to the run's
   * thread and opening on the first artifact the graph presents. Absent on a
   * host that has a pane of its own.
   */
  artifactPaneHostKey?: string;
  className?: string;
  /** Workspace search behind `ObjectPicker` fields. */
  objectSearch?: MentionRefSearch | null;
  /** "Fertig" on a settled run — leave the page. */
  onExit?: () => void;
  /** "Neu starten" on a failed or cancelled run — back to page 0. */
  onRestart?: () => void;
  runId: string;
}

/**
 * The closing line is markdown, and a wizard that wrote a record links to it
 * — an in-app path stays in the app instead of leaving through a new tab.
 */
/** The line comes from this run's own graph, not from the open web. */
const NO_LINK_SAFETY = { enabled: false };

const SUMMARY_MARKDOWN_COMPONENTS = {
  a: ({ children, href }: { children?: ReactNode; href?: string }) =>
    href?.startsWith("/") ? (
      <Link className="underline" to={href}>
        {children}
      </Link>
    ) : (
      <a href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    ),
};

export function WizardRunner({
  artifactPaneHostKey,
  className,
  objectSearch,
  onExit,
  onRestart,
  runId,
}: WizardRunnerProps) {
  const { t } = useTranslation("ai-ui");
  const run = useWizardRun(runId);
  const resume = useResumeRunMutation();
  const travel = useTimeTravelRunMutation();
  const cancel = useCancelRunMutation();

  const data = run.query.data;
  const snapshot = data?.snapshot ?? null;
  const gate = snapshot?.gate ?? null;
  const gateSteps = useMemo(
    () => (data ? gateStepsFromGraph(data.version.graph) : []),
    [data]
  );

  // Travelling back re-executes the gate, so its answer leaves the snapshot.
  // The answers as they were BEFORE the travel prefill the step travelled to
  // — held for that step alone, and released once it is answered.
  //
  // ONLY that case prefills. A gate the run reaches again on its own (the
  // review step of a loop) starts empty: its recorded answer is the request
  // the last round already carried out, and offering it again invites the
  // person to ask for the same change twice.
  const [held, setHeld] = useState<{
    answers: Record<string, GraphRunAnswerDto>;
    forStepId: string;
  } | null>(null);
  const currentStepId = gate?.stepId ?? null;
  const answer =
    (gate && held?.forStepId === gate.stepId
      ? held.answers[gate.stepId]
      : undefined) ?? null;

  const afterMutation = useCallback(() => {
    run.reattach();
    run.refetch();
  }, [run.reattach, run.refetch]);

  // The record the run wrote opens in the pane beside the last page.
  useWizardOutcomeRecord({
    hostKey: artifactPaneHostKey,
    settled: data
      ? wizardRunState(data.request, snapshot) === "completed"
      : false,
    summary: data?.request.summary ?? data?.request.outcome,
  });

  const previous = previousGateStep(gateSteps, currentStepId);
  const onBack = useMemo(() => {
    if (!(gate && previous)) {
      return;
    }
    return () => {
      setHeld({ answers: snapshot?.answers ?? {}, forStepId: previous.stepId });
      travel.mutate(
        { runId, step_path: previous.path },
        { onSuccess: afterMutation }
      );
    };
  }, [afterMutation, gate, previous, runId, snapshot?.answers, travel.mutate]);

  // A run that is not there (a wrong id, a run that is no wizard's, a
  // version that is gone) settles as an error — without this it stayed a
  // skeleton forever.
  if (run.query.isError) {
    return (
      <div className={cn("space-y-3", className)} role="alert">
        <p className="text-muted-foreground text-sm">
          {t("wizard.runUnavailable")}
        </p>
        {onExit ? (
          <Button onClick={onExit} size="sm" type="button" variant="outline">
            {t("wizard.done")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (run.query.isLoading || !data) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const { request, version } = data;
  const state = wizardRunState(request, snapshot);
  const busy = resume.isPending || travel.isPending || cancel.isPending;
  const error = resume.error ?? travel.error ?? cancel.error;
  const threadId = request.thread_id ?? null;

  // Mounted for the host key alone: the pane also carries the record the run
  // wrote, which a run without a thread of its own still has.
  const pane = artifactPaneHostKey ? (
    <WorkspaceArtifactPane
      hostKey={artifactPaneHostKey}
      openOnFirstArtifact
      scope={{ id: threadId, type: "thread" }}
    />
  ) : null;

  let body: React.ReactNode;
  switch (state) {
    case "starting":
      body = (
        <p className="text-muted-foreground text-sm">
          {t("wizard.state.starting")}
        </p>
      );
      break;
    case "gate":
      body = gate ? (
        <GateSurfaceCard
          answer={answer}
          busy={busy}
          gate={gate}
          objectSearch={objectSearch}
          onBack={onBack}
          onCancel={() =>
            cancel.mutate(runId, { onSuccess: () => run.refetch() })
          }
          onSubmit={(decision) => {
            setHeld(null);
            resume.mutate(
              {
                ...decision,
                runId,
                step_id: gate.stepId,
                step_path: gate.path,
              },
              { onSuccess: afterMutation }
            );
          }}
        />
      ) : null;
      break;
    case "running":
      body = run.stream ? (
        <WorkflowRunStatus
          cancel={null}
          isCancelling={false}
          labels={{
            completed: t("wizard.state.completed"),
            failed: t("wizard.state.failed"),
            noOutput: t("actionsRun.statusNoOutput"),
            paused: t("wizard.state.sleeping"),
            requiresAction: t("wizard.state.gate"),
            running: t("wizard.state.running"),
            step: t("actionsRun.step"),
            stepResult: t("actionsRun.stepResult"),
            steps: t("actionsRun.steps"),
            stop: t("actionsRun.stop"),
            stopped: t("wizard.state.cancelled"),
            stopping: t("actionsRun.stopping"),
          }}
          status={run.stream}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("wizard.state.running")}
        </p>
      );
      break;
    case "sleeping":
      body = (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm">
          <Moon
            aria-hidden
            className="size-4 shrink-0 text-sky-600 dark:text-sky-400"
          />
          <span>
            {request.wake_at
              ? t("wizard.state.sleepingUntil", {
                  when: new Date(request.wake_at).toLocaleString(),
                })
              : t("wizard.state.sleeping")}
          </span>
        </div>
      );
      break;
    case "completed":
      body = (
        <div className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <div className="flex items-center gap-2 font-medium text-sm">
            <CheckCircle2
              aria-hidden
              className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            {t("wizard.state.completed")}
          </div>
          {request.summary || request.outcome ? (
            // The graph's closing line, markdown — a wizard that created a
            // record links to it from here.
            <MessageResponse
              className={COMPACT_MARKDOWN_PROSE_CLASSNAME}
              components={SUMMARY_MARKDOWN_COMPONENTS}
              linkSafety={NO_LINK_SAFETY}
            >
              {request.summary ?? request.outcome ?? ""}
            </MessageResponse>
          ) : null}
          {onExit ? (
            <Button onClick={onExit} size="sm" type="button">
              {t("wizard.done")}
            </Button>
          ) : null}
        </div>
      );
      break;
    case "failed":
    case "cancelled":
      body = (
        <div
          className={cn(
            "space-y-3 rounded-md border px-4 py-3",
            state === "failed"
              ? "border-destructive/40 bg-destructive/5"
              : "border-muted-foreground/30 bg-muted/30"
          )}
        >
          <div className="flex items-center gap-2 font-medium text-sm">
            {state === "failed" ? (
              <XCircle
                aria-hidden
                className="size-4 shrink-0 text-destructive"
              />
            ) : (
              <Ban
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
            )}
            {state === "failed"
              ? t("wizard.state.failed")
              : t("wizard.state.cancelled")}
          </div>
          {request.reason ? (
            <p className="whitespace-pre-wrap text-muted-foreground text-sm">
              {request.reason}
            </p>
          ) : null}
          {onRestart ? (
            <Button
              onClick={onRestart}
              size="sm"
              type="button"
              variant="outline"
            >
              <RotateCcw aria-hidden className="mr-1.5 size-3.5" />
              {t("wizard.restart")}
            </Button>
          ) : null}
        </div>
      );
      break;
    default:
      body = null;
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} data-state={state}>
      <WizardProgress
        currentStepId={currentStepId}
        graph={version.graph}
        nodes={snapshot?.nodes}
      />
      {body}
      {error ? (
        <p className="text-destructive text-xs">
          {error instanceof Error ? error.message : t("wizard.error")}
        </p>
      ) : null}
      {pane}
    </div>
  );
}
