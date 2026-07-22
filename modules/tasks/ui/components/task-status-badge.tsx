import { Badge, cn } from "@engenty/ui-core";
import type { TaskStatusDefinition } from "../../src/schema/types.js";
import { resolveTaskStatusPillTone } from "../lib/task-status-styles.js";

/** Uses tenant task status definitions; unknown ids fall back to the raw id. */
export function resolveTaskStatusLabel(
  status: string,
  definitions: TaskStatusDefinition[]
): string {
  return definitions.find((d) => d.id === status)?.label ?? status;
}

interface TaskStatusBadgeProps {
  compact?: boolean;
  definitions?: TaskStatusDefinition[];
  status: string;
}

export function TaskStatusBadge({
  status,
  definitions = [],
  compact,
}: TaskStatusBadgeProps) {
  const def = definitions.find((d) => d.id === status);
  const label = resolveTaskStatusLabel(status, definitions);
  const toneClass = resolveTaskStatusPillTone(def?.color);

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
      {label}
    </Badge>
  );
}
