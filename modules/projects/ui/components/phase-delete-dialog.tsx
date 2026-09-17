import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useEffect, useId, useState } from "react";

export const PHASE_DELETE_GENERAL_ID = "__general__";

export type PhaseDeleteTaskAction = "move" | "delete";

export interface PhaseDeleteTargetOption {
  id: string;
  title: string;
}

export interface PhaseDeleteConfirm {
  targetPhaseId: string | null;
  taskAction: PhaseDeleteTaskAction;
}

interface PhaseDeleteDialogProps {
  onClose: () => void;
  onConfirm: (options: PhaseDeleteConfirm) => void | Promise<void>;
  open: boolean;
  phaseTitle: string;
  targetPhases: PhaseDeleteTargetOption[];
  taskCount: number;
}

export function PhaseDeleteDialog({
  open,
  onClose,
  onConfirm,
  phaseTitle,
  targetPhases,
  taskCount,
}: PhaseDeleteDialogProps) {
  const { t } = useTranslation("projects");
  const moveId = useId();
  const deleteId = useId();
  const defaultTarget = targetPhases[0]?.id ?? PHASE_DELETE_GENERAL_ID;
  const [taskAction, setTaskAction] = useState<PhaseDeleteTaskAction>("move");
  const [targetId, setTargetId] = useState(defaultTarget);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTaskAction(taskCount > 0 ? "move" : "delete");
    setTargetId(defaultTarget);
    setPending(false);
  }, [open, taskCount, defaultTarget]);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm({
        taskAction: taskCount > 0 ? taskAction : "delete",
        targetPhaseId: targetId === PHASE_DELETE_GENERAL_ID ? null : targetId,
      });
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (next || pending) {
          return;
        }
        onClose();
      }}
      open={open}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("detail.phaseForm.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("detail.phaseForm.deleteDescription", { title: phaseTitle })}
          </DialogDescription>
        </DialogHeader>

        {taskCount > 0 ? (
          <fieldset className="space-y-3">
            <legend className="sr-only">
              {t("detail.phaseForm.taskActionLegend")}
            </legend>
            <div className="flex items-center gap-2">
              <input
                checked={taskAction === "move"}
                className="size-4 shrink-0 accent-primary"
                id={moveId}
                name="phase-delete-task-action"
                onChange={() => setTaskAction("move")}
                type="radio"
              />
              <Label className="shrink-0 font-normal" htmlFor={moveId}>
                {t("detail.phaseForm.moveTo")}
              </Label>
              <Select
                onValueChange={(value) => {
                  setTaskAction("move");
                  setTargetId(value);
                }}
                value={targetId}
              >
                <SelectTrigger
                  className="h-8 min-w-0 flex-1 text-sm"
                  onClick={() => setTaskAction("move")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targetPhases.map((phase) => (
                    <SelectItem key={phase.id} value={phase.id}>
                      {phase.title}
                    </SelectItem>
                  ))}
                  <SelectItem value={PHASE_DELETE_GENERAL_ID}>
                    {t("detail.taskForm.generalPhase")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                checked={taskAction === "delete"}
                className="size-4 shrink-0 accent-primary"
                id={deleteId}
                name="phase-delete-task-action"
                onChange={() => setTaskAction("delete")}
                type="radio"
              />
              <Label className="font-normal" htmlFor={deleteId}>
                {t("detail.phaseForm.deleteTasks", { count: taskCount })}
              </Label>
            </div>
          </fieldset>
        ) : null}

        <DialogFooter>
          <Button
            disabled={pending}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={() => void handleConfirm()}
            type="button"
            variant="destructive"
          >
            {pending ? t("deleting") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
