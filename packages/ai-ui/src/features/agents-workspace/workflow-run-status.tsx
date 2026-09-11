import { Button, cn } from "@engenty/ui-core";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Loader2,
  PauseCircle,
  XCircle,
} from "lucide-react";
import { MessageResponse } from "../../components/presentation.js";
import type { WorkflowRunStatusState } from "../../hooks/use-workflow-run-status.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname";

interface WorkflowRunStatusProps {
  cancel: (() => void) | null;
  isCancelling: boolean;
  labels: {
    completed: string;
    failed: string;
    noOutput: string;
    paused?: string;
    requiresAction?: string;
    running: string;
    step: string;
    stepResult: string;
    steps: string;
    stop: string;
    stopped: string;
    stopping: string;
  };
  status: WorkflowRunStatusState;
}

/** Inline live status for a dispatched action run — borrows the chat run stream. */
export function WorkflowRunStatus({
  cancel,
  isCancelling,
  labels,
  status,
}: WorkflowRunStatusProps) {
  const { phase, steps, text, error } = status;
  const currentStep = steps.at(-1) ?? null;
  const headerLabel =
    phase === "running"
      ? (currentStep?.label ?? labels.running)
      : phase === "completed"
        ? labels.completed
        : phase === "stopped"
          ? labels.stopped
          : phase === "requires_action"
            ? (labels.requiresAction ?? "Needs approval")
            : phase === "paused"
              ? (labels.paused ?? "Paused")
              : labels.failed;

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5 text-sm",
        phase === "running" && "border-amber-500/30 bg-amber-500/5",
        phase === "completed" && "border-emerald-500/30 bg-emerald-500/5",
        phase === "stopped" && "border-muted-foreground/30 bg-muted/30",
        phase === "requires_action" && "border-amber-500/40 bg-amber-500/10",
        phase === "paused" && "border-muted-foreground/30 bg-muted/30",
        phase === "failed" && "border-destructive/40 bg-destructive/5"
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        {phase === "running" ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
        ) : null}
        {phase === "completed" ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : null}
        {phase === "requires_action" ? (
          <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : null}
        {phase === "paused" ? (
          <PauseCircle className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        {phase === "stopped" ? (
          <CircleSlash className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        {phase === "failed" ? (
          <XCircle className="size-4 shrink-0 text-destructive" />
        ) : null}
        <span className="truncate">{headerLabel}</span>
        {cancel ? (
          <Button
            className="ml-auto h-7 px-2 text-xs"
            disabled={isCancelling}
            onClick={cancel}
            size="sm"
            type="button"
            variant="outline"
          >
            {isCancelling ? labels.stopping : labels.stop}
          </Button>
        ) : null}
      </div>

      {steps.length > 0 ? (
        <details className="group mt-2 border-t pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
            {labels.steps} ({steps.length})
          </summary>
          <ol className="mt-1.5 space-y-1">
            {steps.map((step, index) => (
              <li className="text-xs" key={step.id}>
                <div className="flex items-center gap-2">
                  {step.status === "running" ? (
                    <Loader2 className="size-3 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
                  ) : (
                    <CheckCircle2 className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="text-muted-foreground">
                    {labels.step} {index + 1}
                  </span>
                  <span className="font-medium">{step.label}</span>
                </div>
                {step.detail ? (
                  <details className="mt-0.5 ml-5">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                      {labels.stepResult}
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 text-[11px] leading-snug">
                      {step.detail}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {error ? (
        <p className="mt-1.5 text-destructive text-xs">{error}</p>
      ) : null}
      {text ? (
        <div className="mt-2 border-t pt-2">
          <MessageResponse className={COMPACT_MARKDOWN_PROSE_CLASSNAME}>
            {text}
          </MessageResponse>
        </div>
      ) : phase === "completed" ? (
        <p className="mt-1.5 text-muted-foreground text-xs">
          {labels.noOutput}
        </p>
      ) : null}
    </div>
  );
}
