import { requestAiServiceJson } from "../runtime/ai-service-client.js";

export type InstructionEditScope = "tenant" | "user";
export type InstructionOwnerKind =
  | "system"
  | "tenant"
  | "module"
  | "agent"
  | "action";

export interface AiInstructionDocument {
  body: string;
  created_at: string;
  created_by_user_id: string | null;
  document_key: string;
  id: string;
  is_active: boolean;
  layer:
    | "system"
    | "tenant"
    | "module"
    | "agent"
    | "action"
    | "tenant_override"
    | "user_override";
  metadata: Record<string, unknown>;
  module_id: string;
  source_kind: "seed" | "user" | "agent_proposal" | "agent_approved";
  tenant_id: string | null;
  title: string;
  updated_at: string;
  updated_by_user_id: string | null;
  version: number;
}

export interface AiInstructionFileDocument extends AiInstructionDocument {
  filename: string;
  owner_id: string;
  owner_kind: InstructionOwnerKind;
}

export const DEFAULT_AGENTS_FILENAME = "AGENTS.md";
const LEGACY_IDENTITY_FILENAME = "IDENTITY.md";
const OWNER_KEY_SUFFIX_PATTERN = /\.(instructions|agents|soul|heartbeat)$/;

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deriveOwnerIdFromKey(documentKey: string) {
  const next = documentKey.replace(OWNER_KEY_SUFFIX_PATTERN, "");
  return next === documentKey ? null : next;
}

function deriveOwnerId(document: AiInstructionDocument) {
  const metadataOwnerId = readMetadataString(document.metadata, "owner_id");
  if (metadataOwnerId) {
    return metadataOwnerId;
  }
  const derivedOwnerId = deriveOwnerIdFromKey(document.document_key);
  if (derivedOwnerId) {
    return derivedOwnerId;
  }
  return "engenty.system";
}

function deriveOwnerKind(
  document: AiInstructionDocument
): InstructionOwnerKind {
  const metadataOwnerKind = readMetadataString(document.metadata, "owner_kind");
  if (
    metadataOwnerKind === "system" ||
    metadataOwnerKind === "tenant" ||
    metadataOwnerKind === "module" ||
    metadataOwnerKind === "agent" ||
    metadataOwnerKind === "action"
  ) {
    return metadataOwnerKind;
  }
  if (
    document.layer === "system" ||
    document.layer === "tenant" ||
    document.layer === "module" ||
    document.layer === "agent" ||
    document.layer === "action"
  ) {
    return document.layer;
  }
  return "agent";
}

function deriveFilename(document: AiInstructionDocument) {
  const metadataFilename = readMetadataString(document.metadata, "filename");
  if (metadataFilename) {
    return normalizeInstructionFilename(metadataFilename);
  }
  if (document.document_key.includes(".identity")) {
    return DEFAULT_AGENTS_FILENAME;
  }
  if (document.document_key.includes(".soul")) {
    return "SOUL.md";
  }
  if (document.document_key.includes(".heartbeat")) {
    return "HEARTBEAT.md";
  }
  if (document.layer === "action") {
    return "ACTION.md";
  }
  return DEFAULT_AGENTS_FILENAME;
}

export function normalizeInstructionFilename(filename: string) {
  return filename === LEGACY_IDENTITY_FILENAME
    ? DEFAULT_AGENTS_FILENAME
    : filename;
}

export function toAiInstructionFileDocument(
  document: AiInstructionDocument
): AiInstructionFileDocument {
  return {
    ...document,
    filename: deriveFilename(document),
    owner_id: deriveOwnerId(document),
    owner_kind: deriveOwnerKind(document),
  };
}

export interface AiInstructionChange {
  approved_at: string | null;
  approved_by_user_id: string | null;
  change_reason: string | null;
  created_at: string;
  id: string;
  instruction_doc_id: string;
  next_body: string;
  previous_body: string | null;
  proposed_by_run_id: string | null;
  status: "proposed" | "approved" | "rejected" | "applied";
}

export interface AiInstructionResolution {
  base_document: AiInstructionDocument;
  effective_document: AiInstructionDocument | null;
  scope: InstructionEditScope;
  tenant_override: AiInstructionDocument | null;
  user_override: AiInstructionDocument | null;
}

export interface AiInstructionHistory {
  changes: AiInstructionChange[];
  document: AiInstructionDocument | null;
  scope: InstructionEditScope;
}

export interface AiInstructionEditResult {
  change: AiInstructionChange | null;
  document: AiInstructionDocument;
}

export interface AiInstructionRollbackResult extends AiInstructionEditResult {
  reverted_change_id: string;
}

export function getAiInstructionsCatalog(signal?: AbortSignal) {
  return requestAiServiceJson<{ documents: AiInstructionDocument[] }>(
    "/ai/instructions",
    { signal }
  );
}

export function getAiInstructionResolution(
  documentKey: string,
  scope: InstructionEditScope,
  signal?: AbortSignal
) {
  const query = new URLSearchParams({ documentKey, scope });
  return requestAiServiceJson<AiInstructionResolution>(
    `/ai/instructions/resolve?${query.toString()}`,
    { signal }
  );
}

export function getAiInstructionHistory(
  documentKey: string,
  scope: InstructionEditScope,
  signal?: AbortSignal
) {
  const query = new URLSearchParams({ documentKey, scope });
  return requestAiServiceJson<AiInstructionHistory>(
    `/ai/instructions/history?${query.toString()}`,
    { signal }
  );
}

export function updateAiInstruction(input: {
  body: string;
  createVersion?: boolean;
  documentKey: string;
  reason?: string | null;
  scope: InstructionEditScope;
  title?: string | null;
}) {
  return requestAiServiceJson<AiInstructionEditResult>(
    "/ai/instructions/edit",
    {
      method: "PUT",
      body: JSON.stringify(input),
    }
  );
}

export function rollbackAiInstruction(input: {
  changeId: string;
  documentKey: string;
  reason?: string | null;
  scope: InstructionEditScope;
}) {
  return requestAiServiceJson<AiInstructionRollbackResult>(
    "/ai/instructions/rollback",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}
