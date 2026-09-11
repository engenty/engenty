// Review the field updates a run's agent proposed, on the task it ran for.
//
// A specialist does not suspend when it proposes updates — it proposes and
// finishes, so the suggestions end up on ITS child run with the task holding
// the decision. The child run ids come from the run snapshot (`agentRuns`),
// which is the only path from a task to what its agent actually asked for.
import {
  type FieldSuggestion,
  useWorkflowRunStatus,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { Button, Card } from "@engenty/ui-core";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import type { TaskRun } from "../../src/schema/types.js";
import { useTaskFlowRun } from "../hooks/use-task-flow-run.js";
import { applyTaskFieldUpdates } from "../lib/task-field-updates-api.js";
import { invalidateTaskDetailLiveQueries } from "../tasks-queries.js";

interface TaskFieldSuggestionsCardProps {
  disabled?: boolean;
  runs: TaskRun[];
  taskId: string;
}

export function TaskFieldSuggestionsCard({
  runs,
  taskId,
  disabled = false,
}: TaskFieldSuggestionsCardProps) {
  const { t } = useTranslation("tasks");
  const queryClient = useQueryClient();
  const { agentRuns } = useTaskFlowRun(runs);
  // One agent node is the usual shape; a run with several shows the newest
  // node's proposals rather than merging two agents' opinions.
  const agentRunId = agentRuns.at(-1)?.runId ?? null;
  const { state } = useWorkflowRunStatus(agentRunId);
  const suggestions = state?.suggestions ?? [];

  const [selected, setSelected] = useState<Record<number, boolean> | null>(
    null
  );
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (suggestions.length === 0) {
    return null;
  }

  const isSelected = (index: number) => selected?.[index] ?? true;
  const chosen = suggestions.filter((_, index) => isSelected(index));

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      const result = await applyTaskFieldUpdates(taskId, {
        approved: chosen.map((suggestion) => ({
          field: suggestion.field,
          value: suggestion.value,
        })),
      });
      setApplied(result.applied);
      invalidateTaskDetailLiveQueries(queryClient, taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2 font-medium text-sm">
        <Sparkles className="size-4 text-amber-600" />
        {t("flowSuggestions.title", "Vorgeschlagene Änderungen")}
      </div>

      {applied === null ? (
        <>
          <ul className="divide-y rounded-md border">
            {suggestions.map((suggestion, index) => (
              <SuggestionRow
                checked={isSelected(index)}
                key={`${suggestion.field}-${index}`}
                onToggle={(next) =>
                  setSelected((current) => ({ ...current, [index]: next }))
                }
                suggestion={suggestion}
              />
            ))}
          </ul>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="flex justify-end">
            <Button
              disabled={disabled || applying || chosen.length === 0}
              onClick={() => void apply()}
              size="sm"
              type="button"
            >
              {applying ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 size-4" />
              )}
              {t("flowSuggestions.apply", "Ausgewählte übernehmen")} (
              {chosen.length})
            </Button>
          </div>
        </>
      ) : (
        <p className="text-emerald-600 text-sm dark:text-emerald-400">
          {t("flowSuggestions.applied", {
            count: applied,
            defaultValue: "{{count}} Felder wurden übernommen.",
          })}
        </p>
      )}
    </Card>
  );
}

function SuggestionRow({
  checked,
  onToggle,
  suggestion,
}: {
  checked: boolean;
  onToggle: (next: boolean) => void;
  suggestion: FieldSuggestion;
}) {
  return (
    <li className="flex gap-3 p-3 text-sm">
      <input
        checked={checked}
        className="mt-1 size-4 shrink-0"
        onChange={(event) => onToggle(event.target.checked)}
        type="checkbox"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="font-medium">{suggestion.field}</div>
        <div className="break-words text-foreground">
          {suggestion.value ?? <span className="text-muted-foreground">—</span>}
        </div>
        {suggestion.evidence_snippet ? (
          <div className="text-muted-foreground text-xs">
            {suggestion.evidence_snippet}
          </div>
        ) : null}
        {suggestion.source_url ? (
          <a
            className="text-primary text-xs underline"
            href={suggestion.source_url}
            rel="noreferrer"
            target="_blank"
          >
            {suggestion.source_url}
          </a>
        ) : null}
      </div>
    </li>
  );
}
