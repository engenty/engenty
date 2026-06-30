import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@engenty/ui-core";
import { useCallback, useEffect, useState } from "react";
import type {
  PrimaryAssigneeKind,
  Task,
  TaskPriority,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import {
  TaskAssigneePicker,
  type TaskAssigneeValue,
} from "./task-assignee-picker.js";

export interface TaskFormSubmitData {
  collaborator_user_ids: string[];
  description: string | null;
  due_date: string | null;
  goal_id: string | null;
  primary_assignee_agent_type_key: string | null;
  primary_assignee_kind: PrimaryAssigneeKind;
  primary_assignee_user_id: string | null;
  priority: TaskPriority;
  project_id: string | null;
  status: string;
  title: string;
}

interface TaskFormDialogProps {
  defaultGoalId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskFormSubmitData) => Promise<void>;
  open: boolean;
  task?: Task | null;
  taskStatusDefinitions: TaskStatusDefinition[];
  teamMembersCatalog?: TeamMemberCatalogRow[];
  teamMembersEnabled?: boolean;
  teamMembersLoading?: boolean;
}

function assigneeFromTask(task: Task | null | undefined): TaskAssigneeValue {
  return {
    primary_assignee_kind: task?.primary_assignee_kind ?? "none",
    primary_assignee_user_id: task?.primary_assignee_user_id ?? null,
    primary_assignee_agent_type_key:
      task?.primary_assignee_agent_type_key ?? null,
    collaborator_user_ids: task?.collaborator_user_ids ?? [],
  };
}

export function TaskFormDialog({
  open,
  onOpenChange,
  onSubmit,
  task,
  defaultGoalId = null,
  taskStatusDefinitions,
  teamMembersCatalog = [],
  teamMembersEnabled = false,
  teamMembersLoading = false,
}: TaskFormDialogProps) {
  const { t } = useTranslation("tasks");
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<string>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState<string | null>(task?.due_date ?? null);
  const [assignee, setAssignee] = useState<TaskAssigneeValue>(() =>
    assigneeFromTask(task)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? "");
      setDescription(task?.description ?? "");
      const ids = taskStatusDefinitions.map((d) => d.id);
      const fromTask = task?.status;
      const nextStatus =
        fromTask && ids.includes(fromTask)
          ? fromTask
          : (taskStatusDefinitions[0]?.id ?? "todo");
      setStatus(nextStatus);
      setPriority(task?.priority ?? "medium");
      setDueDate(task?.due_date ?? null);
      setAssignee(assigneeFromTask(task));
      setError(null);
    }
  }, [open, task, taskStatusDefinitions]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!title.trim()) {
        setError(t("form.titleRequired"));
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit({
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          due_date: dueDate,
          goal_id: task?.goal_id ?? defaultGoalId,
          project_id: task?.project_id ?? null,
          primary_assignee_kind: assignee.primary_assignee_kind,
          primary_assignee_user_id: assignee.primary_assignee_user_id,
          primary_assignee_agent_type_key:
            assignee.primary_assignee_agent_type_key,
          collaborator_user_ids: assignee.collaborator_user_ids,
        });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("form.saveFailed"));
      } finally {
        setSubmitting(false);
      }
    },
    [
      title,
      description,
      status,
      priority,
      dueDate,
      assignee,
      defaultGoalId,
      task?.goal_id,
      onSubmit,
      onOpenChange,
      t,
    ]
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <form
          className="flex h-full max-h-[85vh] flex-col"
          onSubmit={handleSubmit}
        >
          <DialogHeader className="p-6 pb-4">
            <DialogTitle>
              {task ? t("dialogs.editTask") : t("dialogs.createTask")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-6 pt-2">
            <div>
              <Label htmlFor="task-title">{t("form.title")}</Label>
              <Input
                className="mt-1.5"
                id="task-title"
                onChange={(e) => setTitle(e.target.value)}
                required
                value={title}
              />
            </div>
            <div>
              <Label htmlFor="task-description">{t("form.description")}</Label>
              <Textarea
                className="mt-1.5 min-h-[100px]"
                id="task-description"
                onChange={(e) => setDescription(e.target.value)}
                value={description}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-status">{t("form.status")}</Label>
                <Select onValueChange={setStatus} value={status}>
                  <SelectTrigger className="mt-1.5" id="task-status">
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
              <div>
                <Label htmlFor="task-priority">{t("form.priority")}</Label>
                <Select
                  onValueChange={(v) => setPriority(v as TaskPriority)}
                  value={priority}
                >
                  <SelectTrigger className="mt-1.5" id="task-priority">
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
            <div>
              <Label>{t("form.dueDate")}</Label>
              <DatePicker
                className="mt-1.5"
                onChange={setDueDate}
                value={dueDate}
              />
            </div>
            <TaskAssigneePicker
              catalog={teamMembersCatalog}
              disabled={submitting}
              loading={teamMembersLoading}
              onChange={setAssignee}
              teamMembersEnabled={teamMembersEnabled}
              value={assignee}
            />
            {error ? (
              <p className="mt-2 text-destructive text-sm">{error}</p>
            ) : null}
          </div>

          <DialogFooter className="border-t bg-muted/30 p-4 sm:p-4">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("edit.cancel")}
            </Button>
            <Button disabled={submitting} type="submit">
              {task ? t("edit.save") : t("create.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
