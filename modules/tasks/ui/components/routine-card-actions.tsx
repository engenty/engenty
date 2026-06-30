// Hover-revealed action cluster for a routine card: Run now, Edit, Delete
// (with confirm dialog). Mirrors the TaskCard action button styling.
import type { RoutineDto } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { Loader2, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { RoutineDeleteConfirmDialog } from "./routine-delete-confirm-dialog.js";

interface RoutineCardActionsProps {
  isHovered: boolean;
  isRunning: boolean;
  onDelete?: () => Promise<void> | void;
  onEdit?: () => void;
  onRun: () => void;
  routine: RoutineDto;
}

function ActionButton({
  ariaLabel,
  children,
  isHovered,
  disabled,
  onClick,
  tooltip,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
  isHovered: boolean;
  onClick: () => void;
  tooltip: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={ariaLabel}
            className={cn(
              "h-8 w-8 bg-background/80 p-0 text-muted-foreground backdrop-blur-sm transition-opacity hover:bg-muted hover:text-foreground",
              isHovered ? "opacity-100" : "opacity-0"
            )}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            size="sm"
            variant="ghost"
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function RoutineCardActions({
  routine,
  isHovered,
  isRunning,
  onRun,
  onEdit,
  onDelete,
}: RoutineCardActionsProps) {
  const { t } = useTranslation("tasks");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!onDelete) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete();
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="absolute top-1/2 right-2 z-10 flex -translate-y-1/2 items-center gap-1">
      {onDelete ? (
        <ActionButton
          ariaLabel={t("routines.delete.action")}
          isHovered={isHovered}
          onClick={() => setDeleteOpen(true)}
          tooltip={t("routines.delete.action")}
        >
          <Trash2 className="h-4 w-4" />
        </ActionButton>
      ) : null}
      {onEdit ? (
        <ActionButton
          ariaLabel={t("routines.detail.edit")}
          isHovered={isHovered}
          onClick={onEdit}
          tooltip={t("routines.detail.edit")}
        >
          <Pencil className="h-4 w-4" />
        </ActionButton>
      ) : null}
      <ActionButton
        ariaLabel={t("routines.detail.runNow")}
        disabled={isRunning || !routine.enabled}
        isHovered={isHovered}
        onClick={onRun}
        tooltip={t("routines.detail.runNow")}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </ActionButton>

      {onDelete ? (
        <RoutineDeleteConfirmDialog
          busy={deleting}
          name={routine.name}
          onConfirm={() => void handleDeleteConfirm()}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
        />
      ) : null}
    </div>
  );
}
