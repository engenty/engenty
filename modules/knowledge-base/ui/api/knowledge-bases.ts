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

export async function listKbs(signal?: AbortSignal): Promise<KnowledgeBase[]> {
  return requestApiJson<KnowledgeBase[]>(`${API}/knowledge-bases`, {
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

export async function createKb(
  input: Pick<KnowledgeBase, "name" | "slug" | "description">
): Promise<KnowledgeBase> {
  return requestApiJson<KnowledgeBase>(`${API}/knowledge-bases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateKb(
  id: string,
  input: Partial<
    Pick<
      KnowledgeBase,
      | "name"
      | "slug"
      | "description"
      | "is_default"
      | "article_property_definitions"
      | "icon"
      | "cover"
      | "page_layout"
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
