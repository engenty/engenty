/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import type { KbSettings } from "../../src/schema/types.js";

const API = "/api/kb";

/* ── Settings ── */

export async function getKbSettings(signal?: AbortSignal): Promise<KbSettings> {
  return requestApiJson<KbSettings>(`${API}/settings`, {
    method: "GET",
    signal,
  });
}

export async function updateKbSettings(input: KbSettings): Promise<KbSettings> {
  return requestApiJson<KbSettings>(`${API}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// `getKbEmbeddingIndexStatus`, `getKbEmbeddingReindexQueue`, and
// `postKbEmbeddingReindexBatch` were retired together with the legacy
// `/api/kb/embeddings/*` routes. The unified admin surface lives at
// `/api/search-index/providers/kb.article/{status,backfill}` and the
// internal dev panel was deleted.
