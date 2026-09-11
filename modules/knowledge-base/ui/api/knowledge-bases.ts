/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import type {
  ArticlePropertyDefinition,
  KnowledgeBase,
} from "../../src/schema/types.js";

const API = "/api/kb";

/* ── Knowledge Bases ── */

export async function listKbs(
  spaceId?: string,
  signal?: AbortSignal
): Promise<KnowledgeBase[]> {
  const query = spaceId ? `?space_id=${encodeURIComponent(spaceId)}` : "";
  return requestApiJson<KnowledgeBase[]>(`${API}/knowledge-bases${query}`, {
    method: "GET",
    signal,
  });
}

export async function getKb(
  id: string,
  signal?: AbortSignal
): Promise<KnowledgeBase> {
  return requestApiJson<KnowledgeBase>(`${API}/knowledge-bases/${id}`, {
    method: "GET",
    signal,
  });
}

/** One module's first-use setup answer, as core reports it in `mounted[]`. */
export interface SpaceMountSetupResult {
  error?: string;
  module_id: string;
  needs: string[];
  ready: boolean;
}

/**
 * Re-run the space's Knowledge Base setup.
 *
 * The library is created by the module's `mountOperation` when the module is
 * mounted; posting the mount again is the retry. No `agent_access` is sent,
 * which keeps the level the space already gave the module.
 */
export async function setUpSpaceKnowledgeBase(
  spaceId: string
): Promise<{ mounted: SpaceMountSetupResult[] }> {
  return requestApiJson<{ mounted: SpaceMountSetupResult[] }>(
    `/api/spaces/${encodeURIComponent(spaceId)}/setup/add`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mounts: [{ resource_key: "knowledge-base", resource_type: "module" }],
      }),
    }
  );
}

export async function updateKb(
  id: string,
  input: Partial<
    Pick<
      KnowledgeBase,
      | "name"
      | "slug"
      | "description"
      | "chunking"
      | "article_property_definitions"
      | "comments_mode"
      | "icon"
      | "cover"
      | "page_layout"
      // A knowledge base belongs to exactly one space, and moving it between
      // two is an ordinary edit — the same shape as renaming it.
      | "space_id"
    >
  >
): Promise<KnowledgeBase> {
  return requestApiJson<KnowledgeBase>(`${API}/knowledge-bases/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Persist KB article custom property schema (flat YAML keys). */
export async function updateKbArticlePropertyDefinitions(
  kbId: string,
  definitions: ArticlePropertyDefinition[]
): Promise<KnowledgeBase> {
  return updateKb(kbId, { article_property_definitions: definitions });
}

export async function deleteKb(id: string): Promise<void> {
  await requestApiJson(`${API}/knowledge-bases/${id}`, { method: "DELETE" });
}
