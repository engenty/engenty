import type { TaskStatusDefinition } from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import { TaskFormDialog, type TaskFormSubmitData } from "./task-form-dialog.js";

interface CreateTaskDialogProps {
  defaultGoalId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskFormSubmitData) => Promise<void>;
  open: boolean;
  taskStatusDefinitions?: TaskStatusDefinition[];
  teamMembersCatalog?: TeamMemberCatalogRow[];
  teamMembersEnabled?: boolean;
  teamMembersLoading?: boolean;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultGoalId = null,
  taskStatusDefinitions = BUILTIN_TASK_STATUS_DEFINITIONS,
  teamMembersCatalog = [],
  teamMembersEnabled = false,
  teamMembersLoading = false,
}: CreateTaskDialogProps) {
  return (
    <TaskFormDialog
      defaultGoalId={defaultGoalId}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      open={open}
      task={null}
      taskStatusDefinitions={taskStatusDefinitions}
      teamMembersCatalog={teamMembersCatalog}
      teamMembersEnabled={teamMembersEnabled}
      teamMembersLoading={teamMembersLoading}
    />
  );
}
