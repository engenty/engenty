/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import type { Attachment } from "../../src/schema/types.js";

const API = "/api/kb";

/* ── Attachments ── */

export async function listAttachments(
  articleId: string,
  signal?: AbortSignal
): Promise<Attachment[]> {
  return requestApiJson<Attachment[]>(
    `${API}/articles/${articleId}/attachments`,
    { method: "GET", signal }
  );
}

export async function deleteAttachment(id: string): Promise<void> {
  await requestApiJson(`${API}/attachments/${id}`, { method: "DELETE" });
}
