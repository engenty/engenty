// Runs of one action. The status column is the point: at a glance, which runs
// are waiting on a human, which are asleep until Thursday, and which failed.
import { cn, Skeleton } from "@engenty/ui-core";
import { Check, Clock, Loader2, Moon, ShieldCheck, X } from "lucide-react";
import type { WorkflowRunDto } from "./workflow-api.js";
import { useWorkflowRunsQuery } from "./workflow-queries.js";

const STATUS_META: Record<
  string,
  { className: string; icon: typeof Check; label: string }
> = {
  completed: {
    className: "text-emerald-600 dark:text-emerald-400",
    icon: Check,
    label: "Done",
  },
  dispatched: { className: "text-primary", icon: Loader2, label: "Running" },
  failed: { className: "text-destructive", icon: X, label: "Failed" },
  requires_action: {
    className: "text-amber-600 dark:text-amber-400",
    icon: ShieldCheck,
    label: "Waiting on you",
  },
  sleeping: {
    className: "text-sky-600 dark:text-sky-400",
    icon: Moon,
    label: "Sleeping",
  },
};

export interface WorkflowRunsListProps {
  graphId: string;
  onOpen: (run: WorkflowRunDto) => void;
}

export function WorkflowRunsList({ graphId, onOpen }: WorkflowRunsListProps) {
  const query = useWorkflowRunsQuery(graphId);
  const runs = query.data?.runs ?? [];

  if (query.isLoading) {
    return (
      <div className="space-y-2 p-5">
        {[0, 1, 2].map((key) => (
          <Skeleton className="h-11" key={key} />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-muted-foreground text-sm">
        No runs yet.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {runs.map((run) => {
        const meta = STATUS_META[run.status] ?? {
          className: "text-muted-foreground",
          icon: Clock,
          label: run.status,
        };
        const Icon = meta.icon;
        return (
          <li key={run.id}>
            <button
              className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-accent/40"
              disabled={!run.run_id}
              onClick={() => onOpen(run)}
              type="button"
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-4 shrink-0",
                  meta.className,
                  run.status === "dispatched" && "animate-spin"
                )}
              />
              <span className={cn("w-32 shrink-0 text-xs", meta.className)}>
                {meta.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                {run.context_type
                  ? `${run.context_type}${run.context_id ? ` · ${run.context_id}` : ""}`
                  : "no subject"}
                {run.reason ? ` — ${run.reason}` : ""}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {run.wake_at
                  ? `wakes ${new Date(run.wake_at).toLocaleString()}`
                  : new Date(run.created_at).toLocaleString()}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
