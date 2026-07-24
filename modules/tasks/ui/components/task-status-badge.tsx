import { useTranslation } from "@engenty/i18n/ui";
import { Badge, cn } from "@engenty/ui-core";
import {
  type BlockedReason,
  blockedReason,
} from "../../src/domain/blocked-reason.js";
import type { Task, TaskStatusDefinition } from "../../src/schema/types.js";
import { resolveTaskStatusPillTone } from "../lib/task-status-styles.js";

/** Uses tenant task status definitions; unknown ids fall back to the raw id. */
export function resolveTaskStatusLabel(
  status: string,
  definitions: TaskStatusDefinition[]
): string {
  return definitions.find((d) => d.id === status)?.label ?? status;
}

type BlockedReasonTask = Pick<
  Task,
  "blocked_by_task_ids" | "pending_approval_operation_ids" | "status"
>;

export function resolveBlockedReasonSuffix(
  task: BlockedReasonTask,
  t: (key: string, opts?: Record<string, unknown>) => string
): string | null {
  if (task.status !== "blocked") {
    return null;
  }
  const reason: BlockedReason = blockedReason(task);
  if (reason === "dependencies") {
    const count = (task.blocked_by_task_ids ?? []).length;
    return t("status.blockedSuffix.dependencies", { count });
  }
  return t(`status.blockedSuffix.${reason}`);
}

interface TaskStatusBadgeProps {
  compact?: boolean;
  definitions?: TaskStatusDefinition[];
  status: string;
  /** When status is blocked, include why (approval / deps / failed). */
  task?: BlockedReasonTask;
}

export function TaskStatusBadge({
  status,
  definitions = [],
  compact,
  task,
}: TaskStatusBadgeProps) {
  const { t } = useTranslation("tasks");
  const def = definitions.find((d) => d.id === status);
  const label = resolveTaskStatusLabel(status, definitions);
  const toneClass = resolveTaskStatusPillTone(def?.color);
  const suffix =
    task && status === "blocked"
      ? resolveBlockedReasonSuffix({ ...task, status }, t)
      : null;

  return (
    <Badge
      className={cn(
        "inline-flex items-center",
        compact
          ? "min-h-5 px-1.5 py-0 font-normal text-xxs leading-none"
          : "min-h-6 py-0 font-normal",
        toneClass
      )}
      variant="secondary"
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
      {suffix ? `${label} · ${suffix}` : label}
    </Badge>
  );
}
