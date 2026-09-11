import { cn } from "@engenty/ui-core";
import type { WorkflowRunRecord } from "../../hooks/use-workflow-runs.js";
import { formatDetailTimestamp } from "./detail-page-meta";

const STATUS_TONE: Record<string, string> = {
  completed: "text-emerald-600 dark:text-emerald-400",
  failed: "text-destructive",
  dispatched: "text-amber-600 dark:text-amber-400",
  cancelled: "text-muted-foreground",
};

interface WorkflowRunHistoryProps {
  emptyLabel: string;
  /** Inspect a past run by its run id — rows with a run_id become clickable. */
  onSelect?: (runId: string) => void;
  requests: WorkflowRunRecord[];
  /** The run currently shown in the status panel — highlighted in the list. */
  selectedRunId?: string | null;
  triggerLabel: (trigger: string) => string;
}

export function WorkflowRunHistory({
  emptyLabel,
  onSelect,
  requests,
  selectedRunId,
  triggerLabel,
}: WorkflowRunHistoryProps) {
  if (requests.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y rounded-md border">
      {requests.map((request) => {
        const selectable = Boolean(onSelect && request.run_id);
        const isSelected =
          Boolean(request.run_id) && request.run_id === selectedRunId;
        const rowContent = (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "shrink-0 font-medium text-xs uppercase tracking-wide",
                  STATUS_TONE[request.status] ?? "text-muted-foreground"
                )}
              >
                {request.status}
              </span>
              <span className="truncate text-muted-foreground text-xs">
                {triggerLabel(request.trigger)}
              </span>
            </div>
            <span className="shrink-0 text-muted-foreground text-xs">
              {formatDetailTimestamp(request.created_at)}
            </span>
          </>
        );
        return (
          <li key={request.id}>
            {selectable ? (
              <button
                aria-pressed={isSelected}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50",
                  isSelected && "bg-muted"
                )}
                onClick={() => onSelect?.(request.run_id as string)}
                type="button"
              >
                {rowContent}
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                {rowContent}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
