// Confirm dialog for deleting a custom routine (card + detail surfaces).
import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@engenty/ui-core";

interface RoutineDeleteConfirmDialogProps {
  busy: boolean;
  name: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function RoutineDeleteConfirmDialog({
  busy,
  name,
  onConfirm,
  onOpenChange,
  open,
}: RoutineDeleteConfirmDialogProps) {
  const { t } = useTranslation("tasks");

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent onClick={(event) => event.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("routines.delete.confirmTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("routines.delete.confirmDescription", { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("routines.delete.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={onConfirm}
          >
            {t("routines.delete.action")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
