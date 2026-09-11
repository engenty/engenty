import { useTranslation } from "@engenty/i18n/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import type { Task } from "../../src/schema/types.js";
import { TaskApprovedToolsSection } from "./task-approved-tools-section.js";

export function TaskApprovedToolsDialog({
  disabled,
  onOpenChange,
  open,
  task,
}: {
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  task: Task | null;
}) {
  const { t } = useTranslation("tasks");
  if (!task) {
    return null;
  }
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("detail.approvedTools")}</DialogTitle>
        </DialogHeader>
        <TaskApprovedToolsSection
          disabled={disabled}
          grants={task.approval_grants ?? []}
          onceGrants={task.approval_grants_once ?? []}
          showHeading={false}
          taskId={task.id}
        />
      </DialogContent>
    </Dialog>
  );
}
