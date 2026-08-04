// Files tab wiring (instruction editor) — split layout mirrors workspace tab.

import { useState } from "react";
import { useCreateAiInstructionMutation } from "../../lib/admin/instruction-settings-queries";
import { AgentFilesTab } from "./agent-files-tab";
import type { useAgentDetail } from "./use-agent-detail";
import type { useAgentFilesTab } from "./use-agent-files-tab";

interface AgentDetailFilesTabProps {
  detail: ReturnType<typeof useAgentDetail>;
  files: ReturnType<typeof useAgentFilesTab>;
  t: (key: string) => string;
}

export function AgentDetailFilesTab({
  detail,
  files,
  t,
}: AgentDetailFilesTabProps) {
  const createMutation = useCreateAiInstructionMutation();
  const [createError, setCreateError] = useState<string | null>(null);
  const agentId = detail.selectedAgent?.id ?? null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-page pt-2 pb-2">
      <AgentFilesTab
        canReset={Boolean(detail.selectedKey)}
        createErrorMessage={createError}
        editorBody={files.editorBody}
        errorMessage={files.instructionErrorMessage}
        files={detail.agentDocuments}
        history={files.historyQuery.data?.changes ?? []}
        isBusy={files.isInstructionBusy || createMutation.isPending}
        isCreating={createMutation.isPending}
        isDirty={files.isInstructionDirty}
        isSaving={files.saveInstructionMutation.isPending}
        onChangeBody={files.setEditorBody}
        onCreateFile={async (filename) => {
          if (!agentId) {
            return;
          }
          setCreateError(null);
          try {
            const result = await createMutation.mutateAsync({
              agentId,
              filename,
              scope: files.scope,
            });
            detail.setFileParam(result.document.document_key);
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : t("instructions.newFileFailed");
            setCreateError(
              message.includes("409") || message.includes("fileExists")
                ? t("instructions.fileExists")
                : t("instructions.newFileFailed")
            );
          }
        }}
        onCreateVersion={(reason) => {
          if (!(detail.selectedKey && files.isInstructionDirty)) {
            return;
          }
          void files.saveInstructionMutation.mutateAsync({
            body: files.editorBody,
            createVersion: true,
            documentKey: detail.selectedKey,
            reason: reason || null,
            scope: files.scope,
          });
        }}
        onReset={() => {
          if (!detail.selectedKey) {
            return;
          }
          const documentKey = detail.selectedKey;
          const seedBody = files.baseBody;

          // Unsaved edits only, no DB overrides → snap to seed immediately.
          const hasUserOverride = Boolean(
            files.resolutionQuery.data?.user_override
          );
          const hasTenantOverride = Boolean(
            files.resolutionQuery.data?.tenant_override
          );
          if (!(hasUserOverride || hasTenantOverride)) {
            files.setEditorBody(seedBody);
            return;
          }

          // Clear overrides so resolve falls all the way back to the seed file.
          // On user scope, also clear tenant — otherwise cascade keeps a non-seed body.
          void (async () => {
            let lastResult: Awaited<
              ReturnType<typeof files.resetInstructionMutation.mutateAsync>
            > | null = null;
            if (hasUserOverride) {
              lastResult = await files.resetInstructionMutation.mutateAsync({
                documentKey,
                scope: "user",
              });
            }
            if (hasTenantOverride) {
              lastResult = await files.resetInstructionMutation.mutateAsync({
                documentKey,
                scope: "tenant",
              });
            }
            files.setEditorBody(lastResult?.base_document?.body ?? seedBody);
          })();
        }}
        onRollback={(changeId) =>
          void files.rollbackInstructionMutation.mutateAsync({
            changeId,
            documentKey: detail.selectedKey,
            scope: files.scope,
          })
        }
        onSave={() => {
          if (!(detail.selectedKey && files.isInstructionDirty)) {
            return;
          }
          void files.saveInstructionMutation.mutateAsync({
            body: files.editorBody,
            createVersion: false,
            documentKey: detail.selectedKey,
            scope: files.scope,
          });
        }}
        onSelectFile={detail.setFileParam}
        scope={files.scope}
        selectedDocument={files.selectedDocument}
        selectedKey={detail.selectedKey}
        setScope={files.setScope}
        t={t}
        tenantOverrideActive={Boolean(
          files.resolutionQuery.data?.tenant_override
        )}
        userOverrideActive={Boolean(files.resolutionQuery.data?.user_override)}
      />
    </div>
  );
}
