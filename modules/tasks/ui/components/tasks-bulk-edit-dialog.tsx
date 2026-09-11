import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Checkbox,
  cn,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useCallback, useState } from "react";
import type {
  TaskPriority,
  TaskStatusDefinition,
  TaskUpdateInput,
} from "../../src/schema/types.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import {
  TaskAssigneePicker,
  type TaskAssigneeValue,
} from "./task-assignee-picker.js";

interface TasksBulkEditDialogProps {
  onClose: () => void;
  onSubmit: (input: TaskUpdateInput) => Promise<void>;
  open: boolean;
  selectedCount: number;
  taskStatusDefinitions: TaskStatusDefinition[];
  teamMembersCatalog?: TeamMemberCatalogRow[];
  teamMembersEnabled?: boolean;
  teamMembersLoading?: boolean;
}

const EMPTY_ASSIGNEE: TaskAssigneeValue = {
  collaborator_user_ids: [],
  primary_assignee_agent_type_key: null,
  primary_assignee_kind: "none",
  primary_assignee_user_id: null,
};

export function TasksBulkEditDialog({
  open,
  onClose,
  onSubmit,
  selectedCount,
  taskStatusDefinitions,
  teamMembersCatalog = [],
  teamMembersEnabled = false,
  teamMembersLoading = false,
}: TasksBulkEditDialogProps) {
  const { t } = useTranslation("tasks");

  // Selection states (which fields to update)
  const [updateStatus, setUpdateStatus] = useState(false);
  const [updatePriority, setUpdatePriority] = useState(false);
  const [updateAssignee, setUpdateAssignee] = useState(false);
  const [updateDueDate, setUpdateDueDate] = useState(false);

  // Field values
  const [status, setStatus] = useState<string>(
    taskStatusDefinitions[0]?.id ?? "todo"
  );
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState<TaskAssigneeValue>(EMPTY_ASSIGNEE);
  const [dueDate, setDueDate] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      // Construct update input based on checked fields
      const input: TaskUpdateInput = {};
      let hasUpdates = false;

      if (updateStatus) {
        input.status = status;
        hasUpdates = true;
      }
      if (updatePriority) {
        input.priority = priority;
        hasUpdates = true;
      }
      if (updateAssignee) {
        input.primary_assignee_kind = assignee.primary_assignee_kind;
        input.primary_assignee_user_id = assignee.primary_assignee_user_id;
        input.primary_assignee_agent_type_key =
          assignee.primary_assignee_agent_type_key;
        input.collaborator_user_ids = assignee.collaborator_user_ids;
        hasUpdates = true;
      }
      if (updateDueDate) {
        input.due_date = dueDate;
        hasUpdates = true;
      }

      if (!hasUpdates) {
        onClose();
        return;
      }

      setSubmitting(true);
      try {
        await onSubmit(input);
        onClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("list.bulkUpdateFailed")
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      updateStatus,
      status,
      updatePriority,
      priority,
      updateAssignee,
      assignee,
      updateDueDate,
      dueDate,
      onSubmit,
      onClose,
      t,
    ]
  );

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form
          className="flex h-full max-h-[85vh] flex-col"
          onSubmit={handleSubmit}
        >
          <DialogHeader className="p-6 pb-4">
            <DialogTitle>{t("dialogs.bulkEditTasks")}</DialogTitle>
            <p className="pt-1 text-muted-foreground text-xs">
              {t("list.bulkEditDescription")}
            </p>
          </DialogHeader>

          <div className="flex-1 space-y-4 divide-y divide-border-soft overflow-y-auto p-6 pt-2">
            {/* Status Field */}
            <div className="flex items-start gap-3.5 py-3 first:pt-0">
              <div className="flex h-8 items-center">
                <Checkbox
                  checked={updateStatus}
                  onCheckedChange={(val) => setUpdateStatus(!!val)}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label
                  className={cn(
                    "font-medium text-xs",
                    !updateStatus && "text-muted-foreground opacity-60"
                  )}
                  htmlFor="bulk-status"
                >
                  {t("form.status")}
                </Label>
                <Select
                  disabled={!updateStatus}
                  onValueChange={setStatus}
                  value={status}
                >
                  <SelectTrigger
                    className="h-8 w-full rounded-[4px]"
                    id="bulk-status"
                  >
                    <SelectValue>
                      {taskStatusDefinitions.find((d) => d.id === status)
                        ?.label ?? status}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {taskStatusDefinitions.map((def) => (
                      <SelectItem key={def.id} value={def.id}>
                        {def.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Priority Field */}
            <div className="flex items-start gap-3.5 py-3">
              <div className="flex h-8 items-center">
                <Checkbox
                  checked={updatePriority}
                  onCheckedChange={(val) => setUpdatePriority(!!val)}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label
                  className={cn(
                    "font-medium text-xs",
                    !updatePriority && "text-muted-foreground opacity-60"
                  )}
                  htmlFor="bulk-priority"
                >
                  {t("form.priority")}
                </Label>
                <Select
                  disabled={!updatePriority}
                  onValueChange={(v) => setPriority(v as TaskPriority)}
                  value={priority}
                >
                  <SelectTrigger
                    className="h-8 w-full rounded-[4px]"
                    id="bulk-priority"
                  >
                    <SelectValue>{t(`priority.${priority}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(["critical", "high", "medium", "low"] as const).map(
                      (p) => (
                        <SelectItem key={p} value={p}>
                          {t(`priority.${p}`)}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Due Date Field */}
            <div className="flex items-start gap-3.5 py-3">
              <div className="flex h-8 items-center">
                <Checkbox
                  checked={updateDueDate}
                  onCheckedChange={(val) => setUpdateDueDate(!!val)}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label
                  className={cn(
                    "font-medium text-xs",
                    !updateDueDate && "text-muted-foreground opacity-60"
                  )}
                >
                  {t("form.dueDate")}
                </Label>
                <DatePicker
                  className="w-full"
                  disabled={!updateDueDate}
                  onChange={setDueDate}
                  value={dueDate}
                />
              </div>
            </div>

            {/* Assignee Picker */}
            <div className="flex items-start gap-3.5 py-3 last:pb-0">
              <div className="flex h-8 items-center">
                <Checkbox
                  checked={updateAssignee}
                  onCheckedChange={(val) => setUpdateAssignee(!!val)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <TaskAssigneePicker
                  catalog={teamMembersCatalog}
                  disabled={!updateAssignee}
                  loading={teamMembersLoading}
                  onChange={setAssignee}
                  teamMembersEnabled={teamMembersEnabled}
                  value={assignee}
                />
              </div>
            </div>

            {error ? (
              <p className="mt-2 text-destructive text-sm">{error}</p>
            ) : null}
          </div>

          <DialogFooter className="border-t bg-muted/30 p-4 sm:p-4">
            <Button onClick={onClose} type="button" variant="outline">
              {t("edit.cancel")}
            </Button>
            <Button
              disabled={
                submitting ||
                !(
                  updateStatus ||
                  updatePriority ||
                  updateAssignee ||
                  updateDueDate
                )
              }
              type="submit"
            >
              {t("edit.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
