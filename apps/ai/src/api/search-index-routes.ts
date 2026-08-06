// Per-user `/ai/v1/search-index/*` surface backed by the apps/ai
// `SearchIndexRegistry`. Mirrors the core `/api/search-index/*` admin
// surface in shape but auto-scopes every call to the caller's tenant +
// user, so regular authenticated users can manage their own indexed
// content (e.g. the apps/ui dev-settings panel and the engenty-copilot
// session-list sidebar).
//
// System providers (`isSystem: true`) require superadmin scope; tenant
// providers require any authenticated user (the provider itself enforces
// row-level scope through the merged `tenant_id`/`user_id` filters).

import type {
  SearchDocument,
  SearchIndexProvider,
  SearchIndexRegistration,
  SearchIndexRegistry,
  SearchStrategy,
} from "@engenty/search-index";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

// Per-call hard cap, same as the core admin surface.
export const MAX_SEARCH_INDEX_BACKFILL_LIMIT = 200;

const BackfillBodySchema = z
  .object({
    force: z.boolean().optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_SEARCH_INDEX_BACKFILL_LIMIT)
      .optional(),
    resume_after: z.string().optional(),
  })
  .catch({});

const SearchBodySchema = z
  .object({
    filters: z.record(z.string(), z.unknown()).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    min_score: z.number().min(0).max(1).optional(),
    offset: z.number().int().min(0).optional(),
    query: z.string().optional(),
    strategy: z.enum(["hybrid", "lexical", "semantic"]).optional(),
  })
  .catch({});

function serializeRegistration(registration: SearchIndexRegistration) {
  const { metadata, provider } = registration;
  return {
    capabilities: metadata.capabilities,
    config: metadata.config ?? null,
    entity_name: metadata.entityName,
    id: provider.id,
    is_system: metadata.isSystem,
    module_id: metadata.moduleId,
    operation_id: metadata.operationId ?? null,
    registered_at: metadata.registeredAt,
    supports: {
      backfill: typeof provider.backfill === "function",
      search: typeof provider.search === "function",
      status: typeof provider.getStatus === "function",
    },
    version: metadata.version,
  };
}

function isVisibleToCaller(
  registration: SearchIndexRegistration,
  scope: { isSuperAdmin?: boolean }
): boolean {
  if (registration.metadata.isSystem) {
    return Boolean(scope.isSuperAdmin);
  }
  return true;
}

export interface RegisterSearchIndexRoutesParams {
  // Lazy lookup so test harnesses can swap registries without re-registering routes.
  resolveRegistry: () => SearchIndexRegistry | null;
  scopeResolver: AiScopeResolver;
}

export function registerAppsAiSearchIndexRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: RegisterSearchIndexRoutesParams
): void {
  const base = `${AI_BASE_PATH}/v1/search-index`;

  app.get(`${base}/providers`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const registry = opts.resolveRegistry();
    if (!registry) {
      return c.json({ providers: [] });
    }
    const providers = registry
      .listRegistrations()
      .filter((reg) => isVisibleToCaller(reg, scope.scope))
      .map(serializeRegistration);
    return c.json({ providers });
  });

  app.get(`${base}/providers/:id/status`, async (c) => {
    const lookup = await resolveProvider(c, opts);
    if ("error" in lookup) {
      return lookup.error;
    }
    const { provider, scope, id } = lookup;
    if (!provider.getStatus) {
      return c.json(
        {
          error: "search_index.statusNotSupported",
          message: `Provider ${id} does not implement getStatus`,
        },
        501
      );
    }
    try {
      const status = await provider.getStatus({
        tenant_id: scope.tenantId,
        user_id: scope.userId,
      });
      return c.json({ id, status });
    } catch (err) {
      return handleRouteError(
        c,
        "search-index status failed",
        "search_index.statusFailed",
        err
      );
    }
  });

  app.post(`${base}/providers/:id/backfill`, async (c) => {
    const lookup = await resolveProvider(c, opts);
    if ("error" in lookup) {
      return lookup.error;
    }
    const { provider, scope, id } = lookup;
    if (!provider.backfill) {
      return c.json(
        {
          error: "search_index.backfillNotSupported",
          message: `Provider ${id} does not implement backfill`,
        },
        501
      );
    }
    const raw = await c.req.json().catch(() => ({}));
    const parsed = BackfillBodySchema.parse(raw);
    const limit = Math.min(
      parsed.limit ?? MAX_SEARCH_INDEX_BACKFILL_LIMIT,
      MAX_SEARCH_INDEX_BACKFILL_LIMIT
    );
    try {
      const result = await provider.backfill({
        ...parsed,
        limit,
        tenant_id: scope.tenantId,
        user_id: scope.userId,
      });
      return c.json({ id, result });
    } catch (err) {
      return handleRouteError(
        c,
        "search-index backfill failed",
        "search_index.backfillFailed",
        err
      );
    }
  });

  app.post(`${base}/providers/:id/search`, async (c) => {
    const lookup = await resolveProvider(c, opts);
    if ("error" in lookup) {
      return lookup.error;
    }
    const { provider, scope, id } = lookup;
    if (!provider.search) {
      return c.json(
        {
          error: "search_index.searchNotSupported",
          message: `Provider ${id} does not implement search`,
        },
        501
      );
    }
    const raw = await c.req.json().catch(() => ({}));
    const parsed = SearchBodySchema.parse(raw);
    // Server-side enforces caller scope by overriding tenant_id/user_id in
    // filters. Provider-specific filters from `filters` (e.g. `agent_id`)
    // pass through.
    const filters = {
      ...(parsed.filters ?? {}),
      tenant_id: scope.tenantId,
      user_id: scope.userId,
    };
    try {
      const response = await provider.search({
        filters,
        limit: parsed.limit ?? 25,
        ...(parsed.offset == null ? {} : { offset: parsed.offset }),
        ...(parsed.query == null ? {} : { query: parsed.query }),
        ...(parsed.min_score == null ? {} : { min_score: parsed.min_score }),
        strategy: (parsed.strategy ?? "hybrid") as SearchStrategy,
      });
      return c.json({
        id,
        matches: response.results,
        total: response.total,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "search-index search failed",
        "search_index.searchFailed",
        err
      );
    }
  });
}

async function resolveProvider(
  c: {
    json: (object: unknown, status?: number) => Response;
    req: {
      header: (n: string) => string | undefined;
      param: (n: string) => string | undefined;
    };
  },
  opts: RegisterSearchIndexRoutesParams
): Promise<
  | {
      id: string;
      // Parameterised on the filter shape: the bare `SearchIndexProvider`
      // defaults TFilters to `Record<string, never>` ("declares no filters"),
      // but this route always injects tenant_id/user_id scope filters.
      provider: SearchIndexProvider<SearchDocument, Record<string, unknown>>;
      registration: SearchIndexRegistration;
      scope: { isSuperAdmin?: boolean; tenantId: string; userId: string };
    }
  | { error: Response }
> {
  const id = c.req.param("id")?.trim();
  if (!id) {
    return {
      error: c.json({ error: "search_index.invalidId" }, 400),
    };
  }
  const scope = await resolveScope(c as never, opts.scopeResolver);
  if (!scope.ok) {
    return { error: scope.response };
  }
  const registry = opts.resolveRegistry();
  const registration = registry?.getRegistration(id);
  if (!registration) {
    return {
      error: c.json(
        {
          error: "search_index.notFound",
          message: `Search index provider not found: ${id}`,
        },
        404
      ),
    };
  }
  if (!isVisibleToCaller(registration, scope.scope)) {
    return {
      error: c.json({ error: "search_index.forbidden" }, 403),
    };
  }
  return {
    id,
    provider: registration.provider,
    registration,
    scope: scope.scope,
  };
}
