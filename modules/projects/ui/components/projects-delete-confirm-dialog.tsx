import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Checkbox,
  Label,
} from "@engenty/ui-core";
import { useEffect, useMemo, useState } from "react";
import { projectTaskCountsOptions } from "../queries.js";

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
  const countsQuery = useQuery({
    ...projectTaskCountsOptions({ project_id: projectId ?? "" }),
    enabled: open && !isBulk && !!projectId,
  });

  const taskCount = useMemo(() => {
    if (isBulk || !projectId) {
      return null;
    }
    const counts = countsQuery.data ?? {};
    return Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  }, [countsQuery.data, isBulk, projectId]);

  useEffect(() => {
    if (!open) {
      setDeleteTasks(false);
      setPending(false);
    }
  }, [open]);

  const showTaskCheckbox = isBulk || (taskCount !== null && taskCount > 0);
  const busy = isDeleting || pending;

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
    : t("deleteProjectAlsoDeleteTasks", {
        count: taskCount ?? 0,
        defaultValue: `Also delete ${taskCount ?? 0} connected task(s)`,
      });

  return (
    <AlertDialog onOpenChange={(next) => !next && onClose()} open={open}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
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
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("cancel", { defaultValue: "Cancel" })}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
          >
            {busy ? t("deleting", { defaultValue: "Deleting…" }) : t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
