import { useTranslation } from "@engenty/i18n/ui";
import { Badge, cn } from "@engenty/ui-core";
import { Link } from "react-router-dom";
import type { Task, TaskStatusDefinition } from "../../../src/schema/types.js";
import { formatAgentTypeKey } from "../../lib/format-assignee.js";
import { resolveTaskStatusPillTone } from "../../lib/task-status-styles.js";
import { tasksPaths } from "../../lib/tasks-routes.js";
import { resolveTaskStatusLabel } from "../task-status-badge.js";
import { AgentPulseDot } from "./agent-pulse-dot.js";

interface OperationsTaskRowProps {
  definitions: TaskStatusDefinition[];
  onOpenRun: (taskId: string) => void;
  task: Task;
}

export function OperationsTaskRow({
  definitions,
  onOpenRun,
  task,
}: OperationsTaskRowProps) {
  const { t } = useTranslation("tasks");

  const def = definitions.find((d) => d.id === task.status);
  const statusLabel = resolveTaskStatusLabel(task.status, definitions);
  const toneClass = resolveTaskStatusPillTone(def?.color);
  const agentLabel = task.primary_assignee_agent_type_key
    ? formatAgentTypeKey(task.primary_assignee_agent_type_key)
    : null;

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
      <Badge
        className={cn("shrink-0 font-normal text-xxs", toneClass)}
        variant="secondary"
      >
        {statusLabel}
      </Badge>

      {task.checkout_run_id ? <AgentPulseDot /> : null}

      <Link
        className="min-w-0 flex-1 truncate text-sm hover:underline"
        to={tasksPaths.taskDetail(task.id)}
      >
        <span className="mr-1.5 font-mono text-muted-foreground text-xs">
          {task.identifier}
        </span>
        {task.title}
      </Link>

      {agentLabel ? (
        <span className="shrink-0 text-muted-foreground text-xs">
          {agentLabel}
        </span>
      ) : null}

      {task.checkout_run_id ? (
        <button
          className="shrink-0 text-primary text-xs opacity-0 transition-opacity hover:underline group-hover:opacity-100"
          onClick={() => onOpenRun(task.id)}
          type="button"
        >
          {t("operations.tree.showRuns")}
        </button>
      ) : null}
    </div>
  );
}
