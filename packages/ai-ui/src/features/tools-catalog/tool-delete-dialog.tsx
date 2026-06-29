// Delete confirmation for custom tools (catalog row action).

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
import { useDeleteCustomToolMutation } from "../../lib/admin/ai-runtime-queries";
import type { RegistryToolEntry } from "./tools-catalog-state";

export function ToolDeleteDialog({
  onClose,
  tool,
}: {
  onClose: () => void;
  tool: RegistryToolEntry | null;
}) {
  const { t } = useTranslation("ai-ui");
  const deleteMutation = useDeleteCustomToolMutation();
  const busy = deleteMutation.isPending;

  return (
    <AlertDialog
      onOpenChange={(open) => !open && onClose()}
      open={Boolean(tool)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("toolsCatalog.deleteConfirm")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("toolsCatalog.deleteDescription", { name: tool?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("toolsCatalog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              if (!tool) {
                return;
              }
              void deleteMutation.mutateAsync(tool.id).then(onClose);
            }}
          >
            {busy
              ? t("toolsCatalog.deleting")
              : t("toolsCatalog.actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
