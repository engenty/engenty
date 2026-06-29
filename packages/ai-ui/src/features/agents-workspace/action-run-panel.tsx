"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActionRequestsQuery } from "../../hooks/use-action-requests.js";
import { useActionRunStatus } from "../../hooks/use-action-run-status.js";
import { useRunAction } from "../../hooks/use-run-action.js";
import {
  ActionInputForm,
  coerceActionInput,
  deriveActionInputFields,
} from "./action-input-form";
import { ActionRequestHistory } from "./action-request-history";
import { ActionRunStatus } from "./action-run-status";

interface ActionRunPanelProps {
  actionId: string;
  defaultThreadMode: string;
  inputSchema: Record<string, unknown> | null | undefined;
}

// Resume-on-reload: the last dispatched run is remembered per action so a page
// refresh re-attaches to it (the run is detached and keeps going server-side).
const RUN_RESUME_TTL_MS = 6 * 60 * 60 * 1000;

function runResumeKey(actionId: string): string {
  return `engenty.actionRun.${actionId}`;
}

function readPersistedRunId(actionId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(runResumeKey(actionId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { runId?: string; ts?: number };
    if (!parsed.runId || typeof parsed.ts !== "number") {
      return null;
    }
    if (Date.now() - parsed.ts > RUN_RESUME_TTL_MS) {
      window.localStorage.removeItem(runResumeKey(actionId));
      return null;
    }
    return parsed.runId;
  } catch {
    return null;
  }
}

function persistRunId(actionId: string, runId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      runResumeKey(actionId),
      JSON.stringify({ runId, ts: Date.now() })
    );
  } catch {
    // Non-fatal: resume-on-reload just won't work in this browser.
  }
}

export function ActionRunPanel({
  actionId,
  defaultThreadMode,
  inputSchema,
}: ActionRunPanelProps) {
  const { t } = useTranslation("ai-ui");
  const fields = useMemo(
    () => deriveActionInputFields(inputSchema),
    [inputSchema]
  );
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(() =>
    readPersistedRunId(actionId)
  );
  // A past run picked from the history to inspect; overrides the live/last run.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const effectiveRunId = selectedRunId ?? lastRunId;
  const { mutate, isPending } = useRunAction();
  const requestsQuery = useActionRequestsQuery(actionId);
  const {
    state: runStatus,
    cancel,
    isCancelling,
  } = useActionRunStatus(effectiveRunId);

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

  // `reuse` actions need an existing copilot thread we don't have here.
  const reuseBlocked = defaultThreadMode === "reuse";

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
      { actionId, input: coerceActionInput(fields, values) },
      {
        onSuccess: (result) => {
          setLastRunId(result.runId);
          setSelectedRunId(null);
          persistRunId(actionId, result.runId);
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

      {reuseBlocked ? (
        <p className="text-amber-600 text-sm dark:text-amber-400">
          {t("actionsRun.reuseBlocked")}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          disabled={isPending || reuseBlocked || missingRequired.length > 0}
          onClick={handleRun}
          type="button"
        >
          <Play className="mr-2 size-4" />
          {isPending ? t("action.dispatching") : t("actionsRun.run")}
        </Button>
      </div>

      {runStatus ? (
        <ActionRunStatus
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
        <ActionRequestHistory
          emptyLabel={t("actionsRun.historyEmpty")}
          onSelect={setSelectedRunId}
          requests={requestsQuery.data ?? []}
          selectedRunId={effectiveRunId}
          triggerLabel={(trigger) =>
            t(`actionsRun.trigger.${trigger}`, { defaultValue: trigger })
          }
        />
      </div>
    </section>
  );
}
