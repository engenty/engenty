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

interface ProjectsSidebarDeleteDialogProps {
  deletingId: string | null;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
}

export function ProjectsSidebarDeleteDialog({
  deletingId,
  onClose,
  onConfirm,
}: ProjectsSidebarDeleteDialogProps) {
  const { t } = useTranslation("projects");

  return (
    <AlertDialog
      onOpenChange={(open) => !open && onClose()}
      open={deletingId !== null}
    >
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("deleteProjectConfirm", {
              defaultValue: "Delete this project?",
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteProjectConfirmDescription", {
              defaultValue: "This action cannot be undone.",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("cancel", { defaultValue: "Cancel" })}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!deletingId}
            onClick={() => deletingId && void onConfirm(deletingId)}
          >
            {t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
