"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRunWorkflow } from "../../hooks/use-run-workflow.js";
import { useActionPressAgentRunId } from "../../hooks/use-workflow-press-run.js";
import { useWorkflowRunStatus } from "../../hooks/use-workflow-run-status.js";
import { useWorkflowRunsQuery } from "../../hooks/use-workflow-runs.js";
import {
  ActionInputForm,
  coerceActionInput,
  deriveActionInputFields,
} from "./workflow-input-form";
import { WorkflowRunHistory } from "./workflow-request-history";
import { WorkflowRunStatus } from "./workflow-run-status";

interface WorkflowRunPanelProps {
  /**
   * The flow this action compiles to, once a press has created it. Run history
   * hangs off the FLOW: a press is a trigger fire, so the audit rows are
   * written against the compiled graph, not the module workflow.
   */
  flowId: string | null;
  inputSchema: Record<string, unknown> | null | undefined;
  workflowId: string;
}

// Resume-on-reload: the last dispatched run is remembered per action so a page
// refresh re-attaches to it (the run is detached and keeps going server-side).
const RUN_RESUME_TTL_MS = 6 * 60 * 60 * 1000;

function runResumeKey(workflowId: string): string {
  return `engenty.actionRun.${workflowId}`;
}

function readPersistedRunId(workflowId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(runResumeKey(workflowId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { runId?: string; ts?: number };
    if (!parsed.runId || typeof parsed.ts !== "number") {
      return null;
    }
    if (Date.now() - parsed.ts > RUN_RESUME_TTL_MS) {
      window.localStorage.removeItem(runResumeKey(workflowId));
      return null;
    }
    return parsed.runId;
  } catch {
    return null;
  }
}

function persistRunId(workflowId: string, runId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      runResumeKey(workflowId),
      JSON.stringify({ runId, ts: Date.now() })
    );
  } catch {
    // Non-fatal: resume-on-reload just won't work in this browser.
  }
}

export function WorkflowRunPanel({
  workflowId,
  flowId,
  inputSchema,
}: WorkflowRunPanelProps) {
  const { t } = useTranslation("ai-ui");
  const fields = useMemo(
    () => deriveActionInputFields(inputSchema),
    [inputSchema]
  );
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(() =>
    readPersistedRunId(workflowId)
  );
  // A past run picked from the history to inspect; overrides the live/last run.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { mutate, isPending } = useRunWorkflow();
  const requestsQuery = useWorkflowRunsQuery(flowId);
  // A press runs the action's FLOW, and the flow has its agent work under a
  // child run — which is where the steps and the answer are.
  const agentRunId = useActionPressAgentRunId(lastRunId);
  const effectiveRunId = selectedRunId ?? agentRunId;
  const {
    state: runStatus,
    cancel,
    isCancelling,
  } = useWorkflowRunStatus(effectiveRunId);

  // Refresh the history once the live run reaches a terminal state.
  const settledRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      lastRunId &&
      // Only when viewing the live run — a selected past run's phase shouldn't
      // trigger a history refetch.
      !selectedRunId &&
      (runStatus?.phase === "completed" ||
        runStatus?.phase === "failed" ||
        runStatus?.phase === "stopped") &&
      settledRef.current !== lastRunId
    ) {
      settledRef.current = lastRunId;
      void requestsQuery.refetch();
    }
  }, [lastRunId, selectedRunId, runStatus?.phase, requestsQuery]);

  const missingRequired = fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = coerceActionInput(fields, values)[field.key];
      return value === undefined || value === "";
    })
    .map((field) => field.key);

  function handleRun() {
    setError(null);
    setLastRunId(null);
    setSelectedRunId(null);
    mutate(
      { workflowId, input: coerceActionInput(fields, values) },
      {
        onSuccess: (result) => {
          // Deduped or fresh, there is always a run to watch — a press while
          // this subject's run is in flight attaches to THAT run.
          setLastRunId(result.runId);
          setSelectedRunId(null);
          persistRunId(workflowId, result.runId);
          void requestsQuery.refetch();
        },
        onError: (err) => {
          const body = (err as { body?: { error?: string; fields?: string[] } })
            .body;
          if (
            body?.error === "action_run.invalidInput" &&
            body.fields?.length
          ) {
            setError(
              `${t("actionsRun.invalidInput")}: ${body.fields.join(", ")}`
            );
          } else {
            setError(err.message);
          }
        },
      }
    );
  }

  return (
    <section className="space-y-4 rounded-md border bg-muted/20 p-4">
      <div>
        <p className="font-medium text-sm">{t("actionsRun.title")}</p>
        <p className="mt-1 text-muted-foreground text-sm">
          {t("actionsRun.description")}
        </p>
      </div>

      {fields.length > 0 ? (
        <ActionInputForm
          fields={fields}
          onChange={(key, value) =>
            setValues((current) => ({ ...current, [key]: value }))
          }
          values={values}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("actionsRun.noInputs")}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          disabled={isPending || missingRequired.length > 0}
          onClick={handleRun}
          type="button"
        >
          <Play className="mr-2 size-4" />
          {isPending ? t("action.dispatching") : t("actionsRun.run")}
        </Button>
      </div>

      {runStatus ? (
        <WorkflowRunStatus
          cancel={cancel}
          isCancelling={isCancelling}
          labels={{
            completed: t("actionsRun.statusCompleted"),
            failed: t("actionsRun.statusFailed"),
            noOutput: t("actionsRun.statusNoOutput"),
            running: t("actionsRun.statusRunning"),
            step: t("actionsRun.step"),
            stepResult: t("actionsRun.stepResult"),
            steps: t("actionsRun.steps"),
            stop: t("actionsRun.stop"),
            stopped: t("actionsRun.statusStopped"),
            stopping: t("actionsRun.stopping"),
          }}
          status={runStatus}
        />
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="space-y-2 pt-2">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
          {t("actionsRun.historyTitle")}
        </p>
        <WorkflowRunHistory
          emptyLabel={t("actionsRun.historyEmpty")}
          onSelect={setSelectedRunId}
          requests={requestsQuery.data ?? []}
          selectedRunId={effectiveRunId}
          triggerLabel={(trigger: string) =>
            t(`actionsRun.trigger.${trigger}`, { defaultValue: trigger })
          }
        />
      </div>
    </section>
  );
}
