/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import type { Tag } from "../../src/schema/types.js";

const API = "/api/kb";

/* ── Tags ── */

export async function listTags(
  kbId: string,
  signal?: AbortSignal
): Promise<Tag[]> {
  return requestApiJson<Tag[]>(`${API}/tags?kb_id=${kbId}`, {
    method: "GET",
    signal,
  });
}

export async function createTag(
  input: Pick<Tag, "kb_id" | "name" | "slug" | "color">
): Promise<Tag> {
  return requestApiJson<Tag>(`${API}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteTag(id: string): Promise<void> {
  await requestApiJson(`${API}/tags/${id}`, { method: "DELETE" });
}
