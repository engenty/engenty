/**
 * Rank mountable space catalog rows (modules, skills, connections, agents).
 *
 * Instant path is lexical BM25 + prefix/stem matching from
 * `@engenty/search-index`. Semantic cosine ranking is layered on by
 * `useSpaceCatalogSearch` via `/ai/v1/catalog/rank`.
 */

import { rankRecordsLexically } from "@engenty/search-index";
import type { SpaceCatalogItem } from "./space-mount-catalog";

export interface SpaceCatalogSearchEntry {
  category: string;
  connectorId?: string | null;
  description?: string | null;
  id: string;
  modules?: string[];
  name: string;
  role?: string | null;
  source?: string | null;
}

export function toSpaceCatalogSearchEntry(
  item: SpaceCatalogSearchEntry
): Record<string, unknown> {
  return {
    category: item.category,
    connectorId: item.connectorId ?? "",
    description: item.description ?? "",
    id: item.id,
    modules: item.modules ?? [],
    name: item.name,
    role: item.role ?? "",
    source: item.source ?? "",
  };
}

export function rankSpaceCatalogLexically<T extends SpaceCatalogSearchEntry>(
  items: readonly T[],
  query: string
): T[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...items];
  }
  return rankRecordsLexically(items, trimmed, toSpaceCatalogSearchEntry);
}

/** Semantic hits first (already filtered), then lexical-only rows. */
export function mergeSpaceCatalogSearch<T extends { id: string }>(
  all: readonly T[],
  lexical: readonly T[],
  semanticIds: readonly string[]
): T[] {
  const byId = new Map(all.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const id of semanticIds) {
    const item = byId.get(id);
    if (item) {
      merged.push(item);
      seen.add(id);
    }
  }
  for (const item of lexical) {
    if (!seen.has(item.id)) {
      merged.push(item);
    }
  }
  return merged;
}

export function spaceCatalogRankPayload(items: readonly SpaceCatalogItem[]) {
  return items.map((item) => ({
    category: item.category,
    ...(item.connectorId ? { connectorId: item.connectorId } : {}),
    ...(item.description ? { description: item.description } : {}),
    id: item.id,
    ...(item.modules && item.modules.length > 0
      ? { modules: item.modules }
      : {}),
    name: item.name,
    ...(item.role ? { role: item.role } : {}),
    ...(item.source ? { source: item.source } : {}),
  }));
}
