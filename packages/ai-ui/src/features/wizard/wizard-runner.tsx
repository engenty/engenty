"use client";

// A graph run, one screen at a time.
//
// The runner has no logic of its own beyond next / back / cancel. What it
// shows is whatever the run is doing: the gate's question while parked, the
// step it is in between gates, the wake time while asleep, how it ended once
// settled. "Weiter" resumes, "Zurück" travels back to the previous gate,
// "Abbrechen" stops the run — the graph decides what any of it means.

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { useCallback, useMemo, useState } from "react";
import { openObjectPaneTab } from "../../artifacts/artifact-store.js";
import { WorkspaceArtifactPane } from "../../artifacts/workspace-artifact-pane.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import {
  type ObjectDisplayIntent,
  ObjectDisplayIntentProvider,
} from "../../objects/object-display-intent.js";
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
import { WizardOutcome, WizardScreen, WizardWorking } from "./wizard-stage.js";
import { gateStepsFromGraph, previousGateStep } from "./wizard-steps.js";

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
  /**
   * Questions asked before the run's first gate — 1 when page 0 asked for
   * the input — so the gates number on from there.
   */
  stepNumberOffset?: number;
}

export function WizardRunner({
  artifactPaneHostKey,
  className,
  objectSearch,
  onExit,
  onRestart,
  runId,
  stepNumberOffset = 0,
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

  // A record a step shows opens in the run's pane, beside the question —
  // following it would leave the wizard mid-run.
  const displayIntent = useMemo<ObjectDisplayIntent>(
    () =>
      artifactPaneHostKey
        ? {
            openInPanel: (ref, opts) =>
              openObjectPaneTab(artifactPaneHostKey, ref, opts),
          }
        : {},
    [artifactPaneHostKey]
  );

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
      <div className={cn("space-y-5", className)} role="alert">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("wizard.runUnavailable")}
        </h1>
        {onExit ? (
          <Button onClick={onExit} size="lg" type="button" variant="outline">
            {t("wizard.close")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (run.query.isLoading || !data) {
    return (
      <div className={className}>
        <WizardWorking label={t("wizard.state.loading")} />
      </div>
    );
  }

  const { request } = data;
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

  // A gate's number is its place among the gates; a question that is no gate
  // on the graph (an approval a specialist asked for) goes unnumbered.
  const gateIndex = gate
    ? gateSteps.findIndex((step) => step.stepId === gate.stepId)
    : -1;
  const gateNumber =
    gateIndex >= 0 ? gateIndex + 1 + stepNumberOffset : undefined;

  const outcomeMessage =
    state === "completed"
      ? (request.summary ?? request.outcome)
      : request.reason;

  let body: React.ReactNode;
  // What the screen is keyed by: a new key is a new page turning in.
  let screenKey: string = state;
  switch (state) {
    case "starting":
      body = <WizardWorking label={t("wizard.state.starting")} />;
      break;
    case "gate":
      screenKey = `gate:${gate?.path.join("/") ?? ""}`;
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
          stepNumber={gateNumber}
          variant="page"
        />
      ) : null;
      break;
    case "running":
      body = (
        <WizardWorking
          detail={t("wizard.state.runningDetail")}
          label={t("wizard.state.running")}
        />
      );
      break;
    case "sleeping":
      body = (
        <WizardWorking
          label={
            request.wake_at
              ? t("wizard.state.sleepingUntil", {
                  when: new Date(request.wake_at).toLocaleString(),
                })
              : t("wizard.state.sleeping")
          }
        />
      );
      break;
    case "completed":
    case "failed":
    case "cancelled":
      body = (
        <WizardOutcome
          kind={state}
          message={outcomeMessage}
          onExit={onExit}
          onRestart={onRestart}
        />
      );
      break;
    default:
      body = null;
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} data-state={state}>
      <ObjectDisplayIntentProvider value={displayIntent}>
        <WizardScreen key={screenKey}>{body}</WizardScreen>
      </ObjectDisplayIntentProvider>
      {error ? (
        <p className="text-destructive text-sm">
          {error instanceof Error ? error.message : t("wizard.error")}
        </p>
      ) : null}
      {pane}
    </div>
  );
}
