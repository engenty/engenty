// Watching a run — the same canvas, filling in.
//
// A run is drawn against the version it STARTED on, never the current one:
// otherwise a run in flight would be rendered as a graph it isn't executing.
// The server returns that pinned version with the snapshot, so this component
// never has to decide.
//
// When the run is parked at a gate, the decision card appears beside the canvas
// with the pending node highlighted — approving is one place, one click, with
// the actual effect in view.
import { Badge, Button, cn, Skeleton } from "@engenty/ui-core";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { GateDecisionCard } from "./gate-decision-card.js";
import { WorkflowCanvas } from "./workflow-canvas.js";
import {
  useResumeRunMutation,
  useWorkflowRunQuery,
} from "./workflow-queries.js";

export interface WorkflowRunViewProps {
  onBack?: () => void;
  runId: string;
}

const STATUS_TONE: Record<string, string> = {
  failed: "border-destructive/50 text-destructive",
  running: "border-primary/50 text-primary",
  sleeping: "border-sky-500/50 text-sky-600 dark:text-sky-400",
  success: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  suspended: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  waiting: "border-sky-500/50 text-sky-600 dark:text-sky-400",
};

/** Human phrasing for a run's overall state. */
const STATUS_LABEL: Record<string, string> = {
  failed: "Failed",
  running: "Running",
  sleeping: "Sleeping",
  success: "Done",
  suspended: "Waiting on you",
  waiting: "Sleeping",
};

export function WorkflowRunView({ onBack, runId }: WorkflowRunViewProps) {
  const run = useWorkflowRunQuery(runId);
  const resume = useResumeRunMutation();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  if (run.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }
  if (!run.data) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground text-sm">
          This run isn't available.
        </p>
      </div>
    );
  }

  const { request, snapshot, version } = run.data;
  const gate = snapshot?.gate;
  const status = snapshot?.status ?? request.status;

  return (
    // Same reason as the detail screen: this sits in a flex row.
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        {onBack ? (
          <Button onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft className="mr-1.5 size-3.5" />
            Runs
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">
            Run {runId.slice(0, 8)}
            <span className="ml-2 font-normal text-muted-foreground text-xs">
              v{version.version}
            </span>
          </p>
          {request.context_type ? (
            <p className="mt-0.5 truncate text-muted-foreground text-xs">
              {request.context_type}
              {request.context_id ? ` · ${request.context_id}` : ""}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs",
            STATUS_TONE[status] ?? "text-muted-foreground"
          )}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
        {request.wake_at ? (
          <Badge variant="outline">
            wakes {new Date(request.wake_at).toLocaleString()}
          </Badge>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <WorkflowCanvas
          className="min-w-0 flex-1"
          graph={version.graph}
          mode={gate ? "approve" : "monitor"}
          onSelectNode={setSelectedNodeId}
          runState={snapshot?.nodes ?? {}}
          // Highlight the gate's node without the user having to hunt for it.
          selectedNodeId={selectedNodeId ?? gate?.stepId ?? null}
        />
        {gate ? (
          <aside className="w-[340px] shrink-0 overflow-y-auto border-l bg-card p-4">
            <GateDecisionCard
              busy={resume.isPending}
              gate={gate}
              onDecide={(decision) =>
                resume.mutate(
                  { runId, ...decision, step_id: gate.stepId },
                  { onSuccess: () => void run.refetch() }
                )
              }
            />
            {resume.isError ? (
              <p className="mt-3 text-destructive text-xs">
                {resume.error instanceof Error
                  ? resume.error.message
                  : "Could not record that decision."}
              </p>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
