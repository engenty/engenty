// Delete confirmation for custom agents (catalog row/card action).

import { ApiClientResponseError } from "@engenty/api-client";
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
import { useState } from "react";
import { useDeleteCustomAgentMutation } from "../../lib/admin/ai-runtime-queries";
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";

/**
 * The registry answers 409 `agent_registry.referencedByWorkflows` when published
 * workflows still run the agent. Without reading that body the dialog just sat
 * there on a rejected mutation, so deletion looked broken; the names come back
 * in the payload and `force` is the stated way past the guard.
 */
function readReferencedActions(error: unknown): string[] | null {
  if (!(error instanceof ApiClientResponseError) || error.status !== 409) {
    return null;
  }
  const details = error.details as
    | { error?: string; workflows?: { id: string; name: string }[] }
    | undefined;
  if (details?.error !== "agent_registry.referencedByWorkflows") {
    return null;
  }
  return (details.workflows ?? []).map((workflow) => workflow.name);
}

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
  const [blockingActions, setBlockingActions] = useState<string[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const reset = () => {
    setBlockingActions(null);
    setFailure(null);
    deleteMutation.reset();
  };

  const runDelete = (force: boolean) => {
    if (!agent) {
      return;
    }
    setFailure(null);
    deleteMutation
      .mutateAsync({ agentId: agent.id, force })
      .then(() => {
        reset();
        onClose();
      })
      .catch((error: unknown) => {
        const referenced = readReferencedActions(error);
        if (referenced) {
          setBlockingActions(referenced);
          return;
        }
        setFailure(
          error instanceof Error
            ? error.message
            : t("agentsCatalog.deleteFailed")
        );
      });
  };

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
      open={Boolean(agent)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blockingActions
              ? t("agentsCatalog.deleteBlockedTitle")
              : t("agentsCatalog.deleteConfirm")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {blockingActions
              ? t("agentsCatalog.deleteBlockedDescription", {
                  actions: blockingActions.join(", "),
                })
              : t("agentsCatalog.deleteDescription", {
                  name: agent?.name ?? "",
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? <p className="text-destructive text-sm">{failure}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("agentsCatalog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              runDelete(Boolean(blockingActions));
            }}
          >
            {busy
              ? t("agentsCatalog.deleting")
              : blockingActions
                ? t("agentsCatalog.deleteAnyway")
                : t("agentsCatalog.actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
