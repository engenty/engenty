import { Badge } from "@engenty/ui-core";
import type { ProjectTaskStatusDefinition } from "../api.js";

/** Uses tenant task status definitions; unknown ids fall back to the raw id. */
export function resolveTaskStatusLabel(
  status: string,
  definitions: ProjectTaskStatusDefinition[]
): string {
  return definitions.find((d) => d.id === status)?.label ?? status;
}

interface TaskStatusBadgeProps {
  compact?: boolean;
  definitions?: ProjectTaskStatusDefinition[];
  status: string;
}

export function TaskStatusBadge({
  status,
  definitions = [],
  compact,
}: TaskStatusBadgeProps) {
  const label = resolveTaskStatusLabel(status, definitions);

  return (
    <Badge
      className={compact ? "font-normal text-xxs" : "font-normal"}
      variant="secondary"
    >
      {label}
    </Badge>
  );
}
