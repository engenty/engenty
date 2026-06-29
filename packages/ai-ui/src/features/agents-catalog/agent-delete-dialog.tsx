// Delete confirmation for custom agents (catalog row/card action).

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
import { useDeleteCustomAgentMutation } from "../../lib/admin/ai-runtime-queries";
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";

export function AgentDeleteDialog({
  agent,
  onClose,
}: {
  agent: AiRegisteredAgent | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("ai-ui");
  const deleteMutation = useDeleteCustomAgentMutation();
  const busy = deleteMutation.isPending;

  return (
    <AlertDialog
      onOpenChange={(open) => !open && onClose()}
      open={Boolean(agent)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("agentsCatalog.deleteConfirm")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("agentsCatalog.deleteDescription", { name: agent?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("agentsCatalog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              if (!agent) {
                return;
              }
              void deleteMutation.mutateAsync(agent.id).then(onClose);
            }}
          >
            {busy
              ? t("agentsCatalog.deleting")
              : t("agentsCatalog.actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
