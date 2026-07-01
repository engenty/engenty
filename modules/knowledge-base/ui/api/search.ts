/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import type { KbSearchResponse } from "../../src/schema/types.js";
import type { KbArticleSuggestHit } from "./articles.js";

const API = "/api/kb";

/* ── Search ── */

export async function searchKb(
  kbId: string,
  query: string,
  opts?: {
    fts_fallback?: boolean;
    limit?: number;
    match_threshold?: number | null;
    max_vector_distance?: number | null;
    use_vector?: boolean;
    verifier?: boolean;
  }
): Promise<KbSearchResponse> {
  return requestApiJson<KbSearchResponse>(`${API}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kb_id: kbId, query, ...opts }),
  });
}

export async function suggestKbArticles(
  kbId: string,
  q: string,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<KbArticleSuggestHit[]> {
  const params = new URLSearchParams({
    kb_id: kbId,
    q,
  });
  if (opts?.limit != null) {
    params.set("limit", String(opts.limit));
  }
  return requestApiJson<KbArticleSuggestHit[]>(
    `${API}/search/suggest?${params}`,
    { method: "GET", signal: opts?.signal }
  );
}

export async function kbChatTurn(
  kbId: string,
  message: string
): Promise<{ error?: string; ok?: boolean; text?: string }> {
  return requestApiJson<{ error?: string; ok?: boolean; text?: string }>(
    `${API}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kb_id: kbId, message }),
    }
  );
}
