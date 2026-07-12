import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { projectAssociatedTaskCountOptions } from "../queries.js";

export interface ProjectsDeleteConfirmDialogProps {
  isDeleting?: boolean;
  onClose: () => void;
  onConfirm: (options: { deleteTasks: boolean }) => Promise<void>;
  open: boolean;
  /** When deleting a single project, used to show linked task count */
  projectId?: string | null;
  selectedCount?: number;
}

export function ProjectsDeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  projectId,
  selectedCount = 1,
  isDeleting = false,
}: ProjectsDeleteConfirmDialogProps) {
  const { t } = useTranslation("projects");
  const [deleteTasks, setDeleteTasks] = useState(false);
  const [pending, setPending] = useState(false);

  const isBulk = selectedCount > 1;
  const countQuery = useQuery({
    ...projectAssociatedTaskCountOptions(projectId ?? ""),
    enabled: open && !isBulk && !!projectId,
  });

  const taskCount = isBulk ? null : (countQuery.data?.count ?? null);
  const showTaskCheckbox = isBulk || Boolean(projectId);
  const busy = isDeleting || pending;

  useEffect(() => {
    if (!open) {
      setDeleteTasks(false);
      setPending(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm({ deleteTasks });
      onClose();
    } finally {
      setPending(false);
    }
  };

  const title = isBulk
    ? t("deleteSelectedConfirm", {
        count: selectedCount,
        defaultValue: `Delete ${selectedCount} selected projects?`,
      })
    : t("deleteProjectConfirm", {
        defaultValue: "Delete this project?",
      });

  const description = isBulk
    ? t("deleteSelectedConfirmDescription", {
        defaultValue: "This action cannot be undone.",
      })
    : t("deleteProjectConfirmDescription", {
        defaultValue: "This action cannot be undone.",
      });

  const taskCheckboxLabel = isBulk
    ? t("deleteProjectAlsoDeleteTasksBulk", {
        defaultValue: "Also delete all tasks linked to these projects",
      })
    : taskCount && taskCount > 0
      ? t("deleteProjectAlsoDeleteTasks", {
          count: taskCount,
          defaultValue: `Also delete ${taskCount} connected task(s)`,
        })
      : t("deleteProjectAlsoDeleteTasksGeneric", {
          defaultValue: "Also delete connected tasks",
        });

  return (
    <Dialog
      onOpenChange={(next) => {
        if (next || busy) {
          return;
        }
        onClose();
      }}
      open={open}
    >
      <DialogContent
        onClick={(e) => e.stopPropagation()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {showTaskCheckbox ? (
          <div className="flex items-start gap-2">
            <Checkbox
              checked={deleteTasks}
              disabled={busy}
              id="delete-project-tasks"
              onCheckedChange={(checked) => setDeleteTasks(checked === true)}
            />
            <Label
              className="cursor-pointer font-normal leading-snug"
              htmlFor="delete-project-tasks"
            >
              {taskCheckboxLabel}
            </Label>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            {t("cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={() => void handleConfirm()}
            type="button"
            variant="destructive"
          >
            {busy ? t("deleting", { defaultValue: "Deleting…" }) : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
