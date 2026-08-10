/**
 * Hub autocomplete: quick lexical (FTS) first; optional semantic fill when FTS is sparse.
 * Avoids embedding on every keystroke when suggest already fills the panel.
 */

import type { KbSearchResult } from "../src/schema/types.js";
import {
  type KbArticleSuggestHit,
  searchKb,
  suggestKbArticles,
} from "./api.js";

/** Skip vector suggest for very short queries (cheap BM25/FTS only while typing). */
const MIN_CHARS_FOR_VECTOR_SUGGEST = 6;

export function mergeKbHybridSuggestHits(
  kbId: string,
  fts: KbArticleSuggestHit[],
  vector: KbSearchResult[],
  limit: number
): KbArticleSuggestHit[] {
  const cap = Math.min(Math.max(limit, 1), 25);
  const seen = new Set<string>();
  const out: KbArticleSuggestHit[] = [];

  for (const hit of fts) {
    if (seen.has(hit.id)) {
      continue;
    }
    seen.add(hit.id);
    out.push(hit);
    if (out.length >= cap) {
      return out;
    }
  }

  for (const row of vector) {
    const id = row.article_id;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const snippet = row.chunk_text.replace(/\s+/g, " ").trim();
    out.push({
      id,
      kb_id: kbId,
      rank: row.score,
      title: row.title,
      headline: snippet.length > 220 ? `${snippet.slice(0, 220)}…` : snippet,
    });
    if (out.length >= cap) {
      break;
    }
  }

  return out;
}

export async function suggestKbArticlesHybridMany(
  kbIds: string[],
  q: string,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<KbArticleSuggestHit[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 25);
  const perKb = Math.max(Math.ceil(limit / kbIds.length), 3);
  const results = await Promise.all(
    kbIds.map((id) => suggestKbArticlesHybrid(id, q, { ...opts, limit: perKb }))
  );
  const seen = new Set<string>();
  const out: KbArticleSuggestHit[] = [];
  for (const hits of results) {
    for (const hit of hits) {
      if (!seen.has(hit.id)) {
        seen.add(hit.id);
        out.push(hit);
        if (out.length >= limit) {
          return out;
        }
      }
    }
  }
  return out;
}

export async function suggestKbArticlesHybrid(
  kbId: string,
  q: string,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<KbArticleSuggestHit[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 25);
  const signal = opts?.signal;
  const trimmed = q.trim();

  const fts = await suggestKbArticles(kbId, q, { limit, signal });
  if (signal?.aborted) {
    return [];
  }

  const needVector =
    trimmed.length >= MIN_CHARS_FOR_VECTOR_SUGGEST && fts.length < limit;

  if (!needVector) {
    return fts.slice(0, limit);
  }

  const vecRes = await searchKb(kbId, q, {
    limit: Math.min(Math.max((limit - fts.length) * 2, 4), 16),
    use_vector: true,
  }).catch(() => ({ results: [] as KbSearchResult[] }));
  const vec = Array.isArray(vecRes) ? vecRes : vecRes?.results || [];

  if (signal?.aborted) {
    return [];
  }
  return mergeKbHybridSuggestHits(kbId, fts, vec, limit);
}
