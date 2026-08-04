// Confirm + clear tenant/user instruction overrides for an agent (catalog action).

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
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";
import {
  useAiInstructionsCatalogQuery,
  useResetAiInstructionMutation,
} from "../../lib/admin/instruction-settings-queries";
import { resolveAgentInstructionDocumentKeys } from "./agents-catalog-state";

function isMissingDocumentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("404") || message.includes("notFound");
}

async function resetDocumentBothScopes(
  mutateAsync: ReturnType<typeof useResetAiInstructionMutation>["mutateAsync"],
  documentKey: string
) {
  // Clear user then tenant so resolve falls all the way to seed.
  for (const scope of ["user", "tenant"] as const) {
    try {
      await mutateAsync({ documentKey, scope });
    } catch (error) {
      if (!isMissingDocumentError(error)) {
        throw error;
      }
    }
  }
}

export function AgentResetDialog({
  agent,
  onClose,
}: {
  agent: AiRegisteredAgent | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("ai-ui");
  const resetMutation = useResetAiInstructionMutation();
  const catalogQuery = useAiInstructionsCatalogQuery();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const busy = resetMutation.isPending;

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          setErrorMessage(null);
          onClose();
        }
      }}
      open={Boolean(agent)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("agentsCatalog.resetConfirm")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("agentsCatalog.resetDescription", { name: agent?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorMessage ? (
          <p className="text-destructive text-sm">{errorMessage}</p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("agentsCatalog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              if (!agent) {
                return;
              }
              setErrorMessage(null);
              const documentKeys = resolveAgentInstructionDocumentKeys(
                agent,
                catalogQuery.data?.documents ?? []
              );
              void (async () => {
                try {
                  for (const documentKey of documentKeys) {
                    await resetDocumentBothScopes(
                      resetMutation.mutateAsync,
                      documentKey
                    );
                  }
                  onClose();
                } catch {
                  setErrorMessage(t("agentsCatalog.resetFailed"));
                }
              })();
            }}
          >
            {busy
              ? t("agentsCatalog.resetting")
              : t("agentsCatalog.actions.reset")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
