import { requestAiJson } from "@/lib/api/client";
import { spaceCatalogRankPayload } from "./space-catalog-search";
import type { SpaceCatalogItem } from "./space-mount-catalog";

export interface SpaceCatalogRankHit {
  id: string;
  lexical: number;
  score: number;
  semantic: number;
}

export async function rankSpaceCatalogRemote(
  items: readonly SpaceCatalogItem[],
  query: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (items.length === 0 || !query.trim()) {
    return [];
  }
  const response = await requestAiJson<{ ranked: SpaceCatalogRankHit[] }>(
    "/ai/v1/catalog/rank",
    {
      body: {
        entries: spaceCatalogRankPayload(items),
        min_score: 0.28,
        query,
        strategy: "hybrid",
      },
      method: "POST",
      signal,
    }
  );
  return (response.ranked ?? []).map((hit) => hit.id);
}
