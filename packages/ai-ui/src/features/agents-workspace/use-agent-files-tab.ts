import { useEffect, useMemo, useState } from "react";
import type {
  AiInstructionFileDocument,
  InstructionEditScope,
} from "../../lib/admin/instruction-settings-api";
import {
  useAiInstructionHistoryQuery,
  useAiInstructionResolutionQuery,
  useRollbackAiInstructionMutation,
  useUpdateAiInstructionMutation,
} from "../../lib/admin/instruction-settings-queries";

function pickSelectedDocument(
  documents: AiInstructionFileDocument[],
  selectedKey: string
) {
  return (
    documents.find((document) => document.document_key === selectedKey) ?? null
  );
}

export function useAgentFilesTab(params: {
  activeSection: string;
  agentDocuments: AiInstructionFileDocument[];
  selectedKey: string;
  setFileParam: (file: string | null) => void;
  t: (key: string) => string;
}) {
  const [scope, setScope] = useState<InstructionEditScope>("tenant");
  const [editorBody, setEditorBody] = useState("");
  const saveInstructionMutation = useUpdateAiInstructionMutation();
  const rollbackInstructionMutation = useRollbackAiInstructionMutation();

  const selectedDocument = useMemo(
    () => pickSelectedDocument(params.agentDocuments, params.selectedKey),
    [params.agentDocuments, params.selectedKey]
  );

  useEffect(() => {
    if (params.activeSection !== "instructions") {
      return;
    }
    if (selectedDocument) {
      return;
    }
    params.setFileParam(params.agentDocuments[0]?.document_key ?? null);
  }, [
    params.activeSection,
    params.agentDocuments,
    params.setFileParam,
    selectedDocument,
  ]);

  const resolutionQuery = useAiInstructionResolutionQuery(
    params.selectedKey,
    scope
  );
  const historyQuery = useAiInstructionHistoryQuery(params.selectedKey, scope);
  const resolvedBody =
    resolutionQuery.data?.effective_document?.body ??
    resolutionQuery.data?.base_document.body ??
    "";

  useEffect(() => {
    setEditorBody(resolvedBody);
  }, [resolvedBody, scope, params.selectedKey]);

  const isInstructionDirty =
    params.selectedKey.length > 0 &&
    selectedDocument !== null &&
    editorBody !== resolvedBody;

  const instructionErrorMessage = (() => {
    const candidate =
      saveInstructionMutation.error ?? rollbackInstructionMutation.error;
    if (candidate instanceof Error) {
      return candidate.message;
    }
    if (saveInstructionMutation.error) {
      return params.t("instructions.saveFailed");
    }
    if (rollbackInstructionMutation.error) {
      return params.t("instructions.rollbackFailed");
    }
    return null;
  })();

  return {
    editorBody,
    historyQuery,
    instructionErrorMessage,
    isInstructionBusy:
      saveInstructionMutation.isPending ||
      rollbackInstructionMutation.isPending,
    isInstructionDirty,
    resolutionQuery,
    resolvedBody,
    rollbackInstructionMutation,
    saveInstructionMutation,
    scope,
    selectedDocument,
    setEditorBody,
    setScope,
  };
}
