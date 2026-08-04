// Tenant/user-authored instruction files appended after the agent's AGENTS.md.
// Keys: `${agentId}.append.<slug>` — no seed base; rows live only in overrides.

import type { AiInstructionDocument } from "./types.js";

const APPEND_SEGMENT = ".append.";

export function isAppendDocumentKey(documentKey: string): boolean {
  return documentKey.includes(APPEND_SEGMENT);
}

export function agentAppendDocumentKey(agentId: string, slug: string): string {
  return `${agentId}${APPEND_SEGMENT}${slug}`;
}

export function parseAppendDocumentKey(
  documentKey: string
): { agentId: string; slug: string } | null {
  const index = documentKey.indexOf(APPEND_SEGMENT);
  if (index <= 0) {
    return null;
  }
  const agentId = documentKey.slice(0, index);
  const slug = documentKey.slice(index + APPEND_SEGMENT.length);
  if (!(agentId && slug)) {
    return null;
  }
  return { agentId, slug };
}

/** `House Rules.md` / `house rules` → `house-rules`. */
export function slugifyInstructionFilename(filename: string): string {
  const withoutExt = filename.replace(/\.md$/i, "").trim();
  const slug = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "notes";
}

export function normalizeAppendFilename(filename: string): string {
  const trimmed = filename.trim() || "NOTES.md";
  return /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

export function moduleIdForAgent(agentId: string): string {
  if (agentId.startsWith("engenty.")) {
    return "engenty";
  }
  return agentId.split(".")[0] ?? "engenty";
}

/** Synthetic "base" for append-only docs (no seed file). */
export function syntheticAppendBaseDocument(params: {
  agentId: string;
  documentKey: string;
  filename: string;
  nowIso: string;
  title?: string;
}): AiInstructionDocument {
  const filename = normalizeAppendFilename(params.filename);
  return {
    body: "",
    created_at: params.nowIso,
    created_by_user_id: null,
    document_key: params.documentKey,
    id: params.documentKey,
    is_active: true,
    layer: "agent",
    metadata: {
      append: true,
      filename,
      owner_id: params.agentId,
      owner_kind: "agent",
    },
    module_id: moduleIdForAgent(params.agentId),
    source_kind: "seed",
    tenant_id: null,
    title: params.title ?? filename.replace(/\.md$/i, ""),
    updated_at: params.nowIso,
    updated_by_user_id: null,
    version: 1,
  };
}
