// POST /ai/v1/catalog/rank — rank caller-supplied catalog records.
//
// Backs as-you-type pickers (create-space modules/skills/connections) with
// the same hybrid lexical + embedding path as the agent API catalog. The
// records are already on the client; this route only scores them. Falls
// back to lexical when Gateway embeddings are unavailable.

import type { Hono } from "hono";
import { z } from "zod";
import { AI_BASE_PATH } from "../config/constants.js";
import { rankCatalogRecords } from "../dal/api-catalog/catalog-record-ranking.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

export const MAX_CATALOG_RANK_ENTRIES = 200;
const MAX_FIELD_CHARS = 500;

const catalogRankEntrySchema = z.object({
  category: z.string().max(100).optional(),
  connectorId: z.string().max(200).optional(),
  description: z.string().max(MAX_FIELD_CHARS).optional(),
  id: z.string().min(1).max(200),
  modules: z.array(z.string().max(100)).max(20).optional(),
  name: z.string().max(MAX_FIELD_CHARS).optional(),
  role: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  summary: z.string().max(MAX_FIELD_CHARS).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  title: z.string().max(MAX_FIELD_CHARS).optional(),
});

const catalogRankBodySchema = z.object({
  entries: z.array(catalogRankEntrySchema).min(1).max(MAX_CATALOG_RANK_ENTRIES),
  min_score: z.number().min(0).max(1).optional(),
  query: z.string().trim().min(1).max(200),
  strategy: z.enum(["hybrid", "lexical", "semantic"]).optional(),
});

export const DEFAULT_CATALOG_RANK_MIN_SCORE = 0.28;

export interface RegisterCatalogRankRoutesOptions {
  scopeResolver: AiScopeResolver;
}

export function registerCatalogRankRoutes(
  app: Hono<any>,
  options: RegisterCatalogRankRoutesOptions
) {
  app.post(`${AI_BASE_PATH}/v1/catalog/rank`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const parsed = catalogRankBodySchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json({ error: "invalid_body" }, 400);
      }
      const ranked = await rankCatalogRecords(parsed.data.entries, {
        idOf: (entry) => entry.id,
        minSemantic: parsed.data.min_score ?? DEFAULT_CATALOG_RANK_MIN_SCORE,
        query: parsed.data.query,
        strategy: parsed.data.strategy ?? "hybrid",
      });
      return c.json({
        ranked: ranked.map((item) => ({
          id: item.entry.id,
          lexical: item.lexical,
          score: item.score,
          semantic: item.semantic,
        })),
      });
    } catch (error) {
      return handleRouteError(
        c,
        "catalog_rank_failed",
        "catalog_rank_failed",
        error
      );
    }
  });
}
