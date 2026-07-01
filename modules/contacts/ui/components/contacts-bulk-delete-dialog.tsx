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

type TranslateFn = (
  key: string,
  options?: Record<string, string | number> & { defaultValue?: string }
) => string;

export interface ContactsBulkDeleteDialogProps {
  bulkDeleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedCount: number;
  t: TranslateFn;
}

export function ContactsBulkDeleteDialog(props: ContactsBulkDeleteDialogProps) {
  const { bulkDeleting, onConfirm, onOpenChange, open, selectedCount, t } =
    props;

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("deleteSelectedConfirm", {
              count: selectedCount,
              defaultValue: `Remove ${selectedCount} selected contacts?`,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteSelectedConfirmDescription", {
              defaultValue:
                "They will be hidden from lists and can no longer be selected for new documents. Records are not permanently destroyed.",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90 hover:text-white"
            disabled={bulkDeleting}
            onClick={() => void onConfirm()}
          >
            {bulkDeleting ? t("deleting") : t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
