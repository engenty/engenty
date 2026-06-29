import {
  type AiInstructionDocument,
  type AiInstructionFileDocument,
  toAiInstructionFileDocument,
} from "../../lib/admin/instruction-settings-api";

export interface AiInstructionOwnerGroup {
  documents: AiInstructionFileDocument[];
  owner_id: string;
  owner_kind: AiInstructionFileDocument["owner_kind"];
  title: string;
}

function isCopilotInstructionOwner(ownerId: string) {
  return ownerId === "engenty.copilot";
}

function ownerTitle(document: AiInstructionFileDocument) {
  if (document.owner_kind === "system" || document.owner_kind === "tenant") {
    return isCopilotInstructionOwner(document.owner_id)
      ? "Engenty"
      : "Engenty System";
  }
  return document.owner_id;
}

function prefersSeedDocument(
  current: AiInstructionFileDocument,
  next: AiInstructionFileDocument
) {
  const currentIsOverride =
    current.layer === "tenant_override" || current.layer === "user_override";
  const nextIsOverride =
    next.layer === "tenant_override" || next.layer === "user_override";
  if (currentIsOverride !== nextIsOverride) {
    return currentIsOverride && !nextIsOverride;
  }
  return next.updated_at > current.updated_at;
}

export function pickCatalogDocuments(documents: AiInstructionDocument[]) {
  const byKey = new Map<string, AiInstructionFileDocument>();
  for (const rawDocument of documents) {
    const document = toAiInstructionFileDocument(rawDocument);
    const existing = byKey.get(document.document_key);
    if (!existing || prefersSeedDocument(existing, document)) {
      byKey.set(document.document_key, document);
    }
  }
  return Array.from(byKey.values()).toSorted((left, right) =>
    `${left.owner_id}:${left.filename}`.localeCompare(
      `${right.owner_id}:${right.filename}`
    )
  );
}

export function groupInstructionDocuments(documents: AiInstructionDocument[]) {
  const picked = pickCatalogDocuments(documents);
  const groups = new Map<string, AiInstructionOwnerGroup>();

  for (const document of picked) {
    const existing = groups.get(document.owner_id);
    if (existing) {
      existing.documents.push(document);
      continue;
    }
    groups.set(document.owner_id, {
      documents: [document],
      owner_id: document.owner_id,
      owner_kind: document.owner_kind,
      title: ownerTitle(document),
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      documents: group.documents.toSorted((left, right) =>
        left.filename.localeCompare(right.filename)
      ),
    }))
    .toSorted((left, right) => left.title.localeCompare(right.title));
}
