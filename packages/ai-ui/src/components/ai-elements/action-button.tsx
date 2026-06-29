"use client";

import type { FieldSuggestion } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@engenty/ui-core";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionContext } from "../../ag-ui/apps-ai/apps-ai-api.js";
import {
  postAppsAiActionApprove,
  resolveEngentyAiServiceBaseUrl,
} from "../../ag-ui/apps-ai/apps-ai-api.js";
import { useActionRequestsQuery } from "../../hooks/use-action-requests.js";
import { useActionRunStatus } from "../../hooks/use-action-run-status.js";
import type { RunActionResult } from "../../hooks/use-run-action.js";
import { useRunAction } from "../../hooks/use-run-action.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname.js";
import { MessageResponse } from "../presentation.js";

// How long a "Done" with no message lingers before the button resets to idle.
const DONE_LINGER_MS = 6000;

export interface ActionButtonProps {
  actionId: string;
  className?: string;
  /** Subject this run is about — `(type, id)`; tags the run for per-place observe (D1). */
  context?: ActionContext;
  disabled?: boolean;
  /** Pre-filled input values. Must satisfy the action's required fields. */
  input?: Record<string, unknown>;
  /** Label override; falls back to i18n default. */
  label?: string;
  /** Called after approved field updates are applied (e.g. to refetch the record). */
  onApplied?: () => void;
  /** Called when the run has been dispatched. */
  onDispatched?: (result: RunActionResult) => void;
  /** Called on error. */
  onError?: (err: Error) => void;
  size?: "default" | "sm" | "lg" | "icon";
  /** Optional thread id for `default_thread_mode: "reuse"` actions. */
  threadId?: string;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
}

export function ActionButton({
  actionId,
  context,
  input,
  threadId,
  label,
  onApplied,
  onDispatched,
  onError,
  className,
  variant = "outline",
  size = "sm",
  disabled,
}: ActionButtonProps) {
  const { t } = useTranslation("ai-ui");
  const { mutate, isPending } = useRunAction();
  const [runId, setRunId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  // Live-progress popover, auto-opened while the run is in flight (the user can
  // dismiss it; it reopens on the next run).
  const [progressOpen, setProgressOpen] = useState(false);

  // Reattach (refresh / second mount): resume an in-flight run for this subject.
  const { data: requests } = useActionRequestsQuery(actionId, context);
  useEffect(() => {
    if (runId) {
      return;
    }
    // Resume observing any in-flight run for this subject — dispatched (running)
    // or suspended for approval (requires_action / paused).
    const active = requests?.find(
      (r) =>
        r.run_id &&
        (r.status === "dispatched" ||
          r.status === "requires_action" ||
          r.status === "paused")
    );
    if (active?.run_id) {
      setRunId(active.run_id);
    }
  }, [requests, runId]);

  const { state } = useActionRunStatus(runId);
  const phase = dismissed ? undefined : state?.phase;
  const running = isPending || phase === "running";
  const currentStep = running ? state?.steps.at(-1)?.label : undefined;
  const suggestions = dismissed ? [] : (state?.suggestions ?? []);
  // The run suspended for approval (requires_action). Fall back to the legacy
  // "completed + suggestions" shape for runs created before suspend/resume.
  const needsApproval =
    !applied &&
    (phase === "requires_action" ||
      (phase === "completed" && suggestions.length > 0));
  const message =
    phase === "completed"
      ? (state?.text ?? "")
      : phase === "failed"
        ? (state?.error ?? "")
        : "";
  const hasMessage = message.trim().length > 0;

  // Report a failure reason to the caller once per transition (toast/banner).
  const reportedFailRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase === "failed" && state?.error) {
      if (reportedFailRef.current !== runId) {
        reportedFailRef.current = runId;
        onError?.(new Error(state.error));
      }
    } else if (phase === "running") {
      reportedFailRef.current = null;
    }
  }, [phase, state?.error, runId, onError]);

  // Auto-open the progress popover when a run starts, close it when it ends.
  // (Transition-driven, so a manual dismiss mid-run stays dismissed.)
  useEffect(() => {
    setProgressOpen(running);
  }, [running]);

  // A "Done" with nothing to review/show lingers briefly, then resets to idle.
  useEffect(() => {
    if (phase === "completed" && !hasMessage && !needsApproval) {
      const timer = setTimeout(() => setDismissed(true), DONE_LINGER_MS);
      return () => clearTimeout(timer);
    }
  }, [phase, hasMessage, needsApproval]);

  const run = useCallback(() => {
    setDismissed(false);
    setApplied(false);
    mutate(
      { actionId, context, input, threadId },
      {
        onSuccess: (result) => {
          setRunId(result.runId);
          onDispatched?.(result);
        },
        onError: (err) => onError?.(err),
      }
    );
  }, [actionId, context, input, threadId, mutate, onDispatched, onError]);

  function handleClick() {
    if (!running && (needsApproval || (phase && hasMessage))) {
      setModalOpen(true);
      return;
    }
    run();
  }

  const handleApply = useCallback(
    async (approved: Array<{ field: string; value: string | null }>) => {
      const baseUrl = resolveEngentyAiServiceBaseUrl();
      if (!baseUrl) {
        throw new Error("VITE_ENGENTY_AI_BASE_URL is not configured");
      }
      await postAppsAiActionApprove(baseUrl, {
        actionId,
        approved,
        context,
        ...(runId ? { runId } : {}),
      });
      setApplied(true);
      onApplied?.();
    },
    [actionId, context, onApplied, runId]
  );

  // Acknowledge a terminal run: close the modal and reset the button to idle.
  const acknowledge = useCallback(() => {
    setModalOpen(false);
    setDismissed(true);
  }, []);

  let icon = <Sparkles className="mr-2 size-4" />;
  if (running) {
    icon = <Loader2 className="mr-2 size-4 animate-spin" />;
  } else if (needsApproval) {
    icon = <AlertCircle className="mr-2 size-4 text-amber-600" />;
  } else if (phase === "completed") {
    icon = <CheckCircle2 className="mr-2 size-4 text-emerald-600" />;
  } else if (phase === "failed") {
    icon = <XCircle className="mr-2 size-4 text-destructive" />;
  }

  let buttonLabel: string;
  if (running) {
    buttonLabel = currentStep ?? t("action.dispatching", "Running…");
  } else if (needsApproval) {
    buttonLabel = t("action.needsApproval", "Needs approval");
  } else if (phase === "completed") {
    buttonLabel = hasMessage
      ? t("action.viewResult", "View result")
      : t("action.done", "Done");
  } else if (phase === "failed") {
    buttonLabel = t("action.failed", "Failed");
  } else {
    buttonLabel = label ?? t("action.run", "Run");
  }

  const steps = state?.steps ?? [];
  const buttonEl = (
    <Button
      className={className}
      disabled={disabled || running}
      onClick={handleClick}
      size={size}
      title={phase === "failed" ? (state?.error ?? undefined) : currentStep}
      variant={needsApproval ? "default" : variant}
    >
      {icon}
      <span className="truncate">{buttonLabel}</span>
    </Button>
  );

  // Acknowledge footer: applied / failed / completed-with-message can be closed
  // out, which resets the button to idle.
  const showAcknowledge = applied || phase === "failed" || hasMessage;

  return (
    <>
      {running ? (
        // Live progress card, auto-shown in context below the button (no hover
        // needed) — the run-button equivalent of the chat's step flap.
        <Popover
          modal={false}
          onOpenChange={setProgressOpen}
          open={progressOpen}
        >
          <PopoverAnchor asChild>
            <span className="inline-flex">{buttonEl}</span>
          </PopoverAnchor>
          <PopoverContent
            align="end"
            className="w-80 text-sm"
            onOpenAutoFocus={(e) => e.preventDefault()}
            side="bottom"
            sideOffset={6}
          >
            <div className="mb-2 flex items-center gap-2 font-medium">
              <Loader2 className="size-4 shrink-0 animate-spin text-amber-600" />
              <span className="truncate">
                {currentStep ?? t("action.dispatching", "Running…")}
              </span>
            </div>
            {steps.length > 0 ? (
              <ol className="space-y-1">
                {steps.map((step, i) => (
                  <li className="flex items-center gap-2" key={step.id}>
                    {step.status === "running" ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-amber-600" />
                    ) : (
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                    )}
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span className="truncate font-medium">{step.label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground text-xs">
                {t("action.preparing", "Preparing…")}
              </p>
            )}
          </PopoverContent>
        </Popover>
      ) : (
        buttonEl
      )}

      <Dialog onOpenChange={setModalOpen} open={modalOpen}>
        <DialogContent className="max-h-[80vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {applied
                ? t("action.applied", "Changes applied")
                : needsApproval
                  ? t("action.approveTitle", "Review suggested updates")
                  : phase === "failed"
                    ? t("action.failed", "Failed")
                    : (label ?? t("action.resultTitle", "Result"))}
            </DialogTitle>
          </DialogHeader>
          {applied ? (
            <p className="text-emerald-600 text-sm dark:text-emerald-400">
              {t(
                "action.appliedBody",
                "The approved field updates were saved."
              )}
            </p>
          ) : needsApproval ? (
            <ApprovalList
              applyLabel={t("action.apply", "Apply selected")}
              onApply={handleApply}
              suggestions={suggestions}
            />
          ) : phase === "failed" ? (
            <p className="text-destructive text-sm">{message}</p>
          ) : (
            <MessageResponse className={COMPACT_MARKDOWN_PROSE_CLASSNAME}>
              {message}
            </MessageResponse>
          )}
          {showAcknowledge ? (
            <DialogFooter>
              <Button onClick={acknowledge} type="button">
                {t("action.ok", "OK")}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApprovalList({
  applyLabel,
  onApply,
  suggestions,
}: {
  applyLabel: string;
  onApply: (
    approved: Array<{ field: string; value: string | null }>
  ) => Promise<void>;
  suggestions: FieldSuggestion[];
}) {
  const [selected, setSelected] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(suggestions.map((_, i) => [i, true]))
  );
  const [values, setValues] = useState<Record<number, string | null>>(() =>
    Object.fromEntries(suggestions.map((s, i) => [i, s.value]))
  );
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const approved = suggestions
        .map((s, i) => ({ field: s.field, value: values[i] ?? s.value }))
        .filter((_, i) => selected[i]);
      await onApply(approved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-md border">
        {suggestions.map((s, i) => (
          <li className="flex gap-3 p-3 text-sm" key={`${s.field}-${i}`}>
            <input
              checked={selected[i] ?? false}
              className="mt-1 size-4 shrink-0"
              onChange={(e) =>
                setSelected((cur) => ({ ...cur, [i]: e.target.checked }))
              }
              type="checkbox"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="font-medium">{s.field}</div>
              {s.candidates && s.candidates.length > 0 ? (
                <select
                  className="w-full rounded border bg-background px-2 py-1 text-sm"
                  onChange={(e) =>
                    setValues((cur) => ({ ...cur, [i]: e.target.value }))
                  }
                  value={values[i] ?? ""}
                >
                  {[
                    { source: undefined as string | undefined, value: s.value },
                    ...s.candidates.map((c) => ({
                      source: c.label,
                      value: c.value,
                    })),
                  ].map((opt, oi) => (
                    <option key={oi} value={opt.value ?? ""}>
                      {/* Value is the choice; source shown as a suffix hint. */}
                      {`${opt.value ?? "(empty)"}${opt.source ? ` — ${opt.source}` : ""}`}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="break-words text-foreground">
                  {s.value ?? <span className="text-muted-foreground">—</span>}
                </div>
              )}
              {s.evidence_snippet ? (
                <div className="text-muted-foreground text-xs">
                  {s.evidence_snippet}
                </div>
              ) : null}
              {s.source_url ? (
                <a
                  className="text-primary text-xs underline"
                  href={s.source_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {s.source_url}
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="flex justify-end">
        <Button
          disabled={applying || selectedCount === 0}
          onClick={apply}
          type="button"
        >
          {applying ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 size-4" />
          )}
          {applyLabel} ({selectedCount})
        </Button>
      </div>
    </div>
  );
}
