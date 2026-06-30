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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { ChevronDown, Target } from "lucide-react";
import { useCallback, useState } from "react";
import type {
  Goal,
  TaskPriority,
  TaskStatusDefinition,
  TaskUpdateInput,
} from "../../src/schema/types.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import { GoalSelectorContent } from "./new-task-selectors.js";
import {
  TaskAssigneePicker,
  type TaskAssigneeValue,
} from "./task-assignee-picker.js";

interface TasksBulkEditDialogProps {
  goals: Goal[];
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
  goals,
  teamMembersCatalog = [],
  teamMembersEnabled = false,
  teamMembersLoading = false,
}: TasksBulkEditDialogProps) {
  const { t } = useTranslation("tasks");

  // Selection states (which fields to update)
  const [updateStatus, setUpdateStatus] = useState(false);
  const [updatePriority, setUpdatePriority] = useState(false);
  const [updateAssignee, setUpdateAssignee] = useState(false);
  const [updateGoal, setUpdateGoal] = useState(false);
  const [updateDueDate, setUpdateDueDate] = useState(false);

  // Field values
  const [status, setStatus] = useState<string>(
    taskStatusDefinitions[0]?.id ?? "todo"
  );
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState<TaskAssigneeValue>(EMPTY_ASSIGNEE);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);

  const [goalOpen, setGoalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedGoal = goals.find((g) => g.id === goalId) ?? null;

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
      if (updateGoal) {
        input.goal_id = goalId;
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
      updateGoal,
      goalId,
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

          <div className="flex-1 space-y-4 divide-y divide-border/50 overflow-y-auto p-6 pt-2">
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

            {/* Goal Field */}
            <div className="flex items-start gap-3.5 py-3">
              <div className="flex h-8 items-center">
                <Checkbox
                  checked={updateGoal}
                  onCheckedChange={(val) => setUpdateGoal(!!val)}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label
                  className={cn(
                    "font-medium text-xs",
                    !updateGoal && "text-muted-foreground opacity-60"
                  )}
                >
                  {t("detail.goal")}
                </Label>
                <Popover modal onOpenChange={setGoalOpen} open={goalOpen}>
                  <PopoverTrigger asChild disabled={!updateGoal}>
                    <button
                      className="flex h-8 w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-[4px] border border-input bg-transparent py-1.5 pr-2 pl-2.5 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
                      disabled={!updateGoal}
                      type="button"
                    >
                      {selectedGoal ? (
                        <span className="inline-flex min-w-0 items-center gap-2 text-foreground text-sm">
                          <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{selectedGoal.title}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("detail.noGoal")}
                        </span>
                      )}
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-0">
                    <GoalSelectorContent
                      goalId={goalId}
                      goals={goals}
                      onSelect={(id) => {
                        setGoalId(id);
                        setGoalOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
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
                  updateGoal ||
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
