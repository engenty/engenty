// Files tab wiring (instruction editor) — extracted unchanged from the old
// agent-detail-tab-content (ui-6 batch 3 split, ≤150-line files).

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
  return (
    <div className="flex h-full min-h-0 flex-col p-page">
      <AgentFilesTab
        canReset={Boolean(files.selectedDocument)}
        editorBody={files.editorBody}
        errorMessage={files.instructionErrorMessage}
        files={detail.agentDocuments}
        history={files.historyQuery.data?.changes ?? []}
        isBusy={files.isInstructionBusy}
        isDirty={files.isInstructionDirty}
        isSaving={files.saveInstructionMutation.isPending}
        onChangeBody={files.setEditorBody}
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
        onReset={() => files.setEditorBody(files.resolvedBody)}
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
