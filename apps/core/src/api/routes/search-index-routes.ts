// Unified `/api/search-index/*` admin surface.
//
// Backs the Manage UI page and operator tooling for every registered
// `SearchIndexProvider`. The routes do not own search semantics — they proxy
// `getStatus` and `backfill` into the provider. List responses come from
// `SearchIndexRegistry.listRegistrations()` so the UI can render owning module,
// entity, capabilities, and (when present) the synthesized auto-tool op id
// without poking each provider.
//
// Auth model: tenant-scoped providers require tenant admin OR superadmin;
// system providers (`isSystem: true`) require superadmin only. Backfills are
// hard-capped at `MAX_BACKFILL_LIMIT` and accept an optional `resume_after`
// cursor that the provider's `backfill` implementation interprets.

import type {
  SearchIndexProvider,
  SearchIndexRegistration,
  SearchIndexRegistry,
  SearchStrategy,
} from "@engenty/search-index";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { createCoreUsersDal } from "../../dal/core-users.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { type ResolvedRouteAuth, resolveRouteAuth } from "./authz.js";

// Per-call hard cap. Operators paginate larger backfills via `resume_after`.
export const MAX_BACKFILL_LIMIT = 200;

const BackfillBodySchema = z.object({
  force: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_BACKFILL_LIMIT).optional(),
  /** Narrow to one container (e.g. `{ kb_id }`); the provider maps it onto its own rows. */
  metadata: z.record(z.string(), z.string()).optional(),
  resume_after: z.string().optional(),
  tenant_id: z.string().nullable().optional(),
  user_id: z.string().nullable().optional(),
});

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

interface RouteContext {
  json: (body: unknown, status?: number) => Response;
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    param: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}

// `tenantAdmin` covers both superadmins and tenant-membership admins. The
// Supabase round-trip is opportunistic — if it fails we fall back to "not
// admin" rather than 5xx, since the route then returns 403.
async function isTenantAdminOrSuperAdmin(
  auth: ResolvedRouteAuth,
  config: Record<string, unknown>,
  bearer: string | undefined
): Promise<boolean> {
  if (auth.isSuperAdmin) {
    return true;
  }
  if (!bearer) {
    return false;
  }
  try {
    const usersDal = createCoreUsersDal(config);
    return await usersDal.isAuthUserAdmin(bearer);
  } catch {
    return false;
  }
}

function readBearer(c: RouteContext): string | undefined {
  const header = c.req.header("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return;
  }
  return header.slice(7).trim() || undefined;
}

function isVisibleToCaller(
  registration: SearchIndexRegistration,
  isAdmin: boolean,
  isSuperAdmin: boolean
): boolean {
  if (registration.metadata.isSystem) {
    return isSuperAdmin;
  }
  return isAdmin;
}

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

export interface RegisterSearchIndexRoutesParams {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  // Lazy lookup so dynamically-attached registries (e.g. test harness) work
  // without re-registering routes.
  resolveRegistry: () => SearchIndexRegistry | undefined;
}

export function registerSearchIndexRoutes(
  params: RegisterSearchIndexRoutesParams
) {
  const { app, config, resolveRegistry } = params;

  app.get("/api/search-index/providers", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const registry = resolveRegistry();
    if (!registry) {
      return jsonApiSuccess(c, { providers: [] });
    }
    const bearer = readBearer(c);
    const isAdmin = await isTenantAdminOrSuperAdmin(auth, config, bearer);
    if (!(isAdmin || auth.isSuperAdmin)) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const providers = registry
      .listRegistrations()
      .filter((reg) => isVisibleToCaller(reg, isAdmin, auth.isSuperAdmin))
      .map(serializeRegistration);
    return jsonApiSuccess(c, { providers });
  });

  app.get("/api/search-index/providers/:id/status", async (c) => {
    const id = c.req.param("id")?.trim();
    if (!id) {
      return jsonApiError(c, 400, { message: "id is required" });
    }
    const lookup = await resolveProviderForRequest(
      c,
      config,
      id,
      resolveRegistry
    );
    if ("error" in lookup) {
      return lookup.error;
    }
    const { provider, auth } = lookup;
    if (!provider.getStatus) {
      return jsonApiError(c, 501, {
        code: "status_not_supported",
        message: `Provider ${id} does not implement getStatus`,
      });
    }
    const tenantId =
      c.req.query("tenant_id") || (auth.tenantId ?? undefined) || null;
    const userId = c.req.query("user_id") || (auth.userId ?? undefined) || null;
    const status = await provider.getStatus({
      tenant_id: tenantId,
      user_id: userId,
    });
    return jsonApiSuccess(c, { id, status });
  });

  app.post("/api/search-index/providers/:id/backfill", async (c) => {
    const id = c.req.param("id")?.trim();
    if (!id) {
      return jsonApiError(c, 400, { message: "id is required" });
    }
    const lookup = await resolveProviderForRequest(
      c,
      config,
      id,
      resolveRegistry
    );
    if ("error" in lookup) {
      return lookup.error;
    }
    const { provider, auth } = lookup;
    if (!provider.backfill) {
      return jsonApiError(c, 501, {
        code: "backfill_not_supported",
        message: `Provider ${id} does not implement backfill`,
      });
    }
    const raw = await c.req.json().catch(() => ({}));
    const parsed = BackfillBodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonApiError(c, 422, {
        code: "validation_error",
        message: "Invalid backfill request",
        details: parsed.error.flatten(),
      });
    }
    const limit = Math.min(
      parsed.data.limit ?? MAX_BACKFILL_LIMIT,
      MAX_BACKFILL_LIMIT
    );
    // Tenant-scoped backfills must stay within the caller's tenant unless
    // the caller is a superadmin (they can target any tenant).
    const callerTenantId = parsed.data.tenant_id ?? auth.tenantId ?? null;
    if (
      !auth.isSuperAdmin &&
      callerTenantId &&
      auth.tenantId &&
      callerTenantId !== auth.tenantId
    ) {
      return jsonApiError(c, 403, {
        message: "Cannot run backfill for another tenant",
      });
    }
    const result = await provider.backfill({
      ...parsed.data,
      limit,
      tenant_id: callerTenantId,
    });
    return jsonApiSuccess(c, { id, result });
  });

  // Tenant-aware search proxy. Mirrors the apps/ai per-user surface: caller
  // `tenant_id` (and `user_id`) always override request `filters` so a
  // tenant admin cannot fish into another tenant. Any authenticated tenant
  // admin or superadmin can call this; system providers stay superadmin-only
  // via the shared visibility gate.
  app.post("/api/search-index/providers/:id/search", async (c) => {
    const id = c.req.param("id")?.trim();
    if (!id) {
      return jsonApiError(c, 400, { message: "id is required" });
    }
    const lookup = await resolveProviderForRequest(
      c,
      config,
      id,
      resolveRegistry
    );
    if ("error" in lookup) {
      return lookup.error;
    }
    const { provider, auth } = lookup;
    if (!provider.search) {
      return jsonApiError(c, 501, {
        code: "search_not_supported",
        message: `Provider ${id} does not implement search`,
      });
    }
    const raw = await c.req.json().catch(() => ({}));
    const parsed = SearchBodySchema.parse(raw);
    const filters = {
      ...(parsed.filters ?? {}),
      tenant_id: auth.tenantId ?? null,
      user_id: auth.userId ?? null,
    };
    const response = await provider.search({
      // This route is generic over every registered provider, so the request
      // type falls back to `SearchRequest`'s default `TFilters =
      // Record<string, never>` — "no filters at all". The filters are real and
      // each provider interprets (and re-validates) its own shape, so the
      // conversion has to go through `unknown`.
      filters: filters as unknown as Record<string, never>,
      limit: parsed.limit ?? 25,
      ...(parsed.offset == null ? {} : { offset: parsed.offset }),
      ...(parsed.query == null ? {} : { query: parsed.query }),
      ...(parsed.min_score == null ? {} : { min_score: parsed.min_score }),
      strategy: (parsed.strategy ?? "hybrid") as SearchStrategy,
    });
    return jsonApiSuccess(c, {
      id,
      matches: response.results,
      total: response.total,
    });
  });
}

// Common gating: resolves auth, ensures the caller has the right scope for
// the targeted provider's `isSystem` flag, and returns the typed handle.
async function resolveProviderForRequest(
  c: RouteContext,
  config: Record<string, unknown>,
  id: string,
  resolveRegistry: () => SearchIndexRegistry | undefined
): Promise<
  | {
      auth: ResolvedRouteAuth;
      provider: SearchIndexProvider;
      registration: SearchIndexRegistration;
    }
  | { error: Response }
> {
  const auth = await resolveRouteAuth(c, config);
  if (!auth) {
    return { error: jsonApiError(c, 401, { message: "Unauthorized" }) };
  }
  const registry = resolveRegistry();
  const registration = registry?.getRegistration(id);
  if (!registration) {
    return {
      error: jsonApiError(c, 404, {
        message: `Search index provider not found: ${id}`,
      }),
    };
  }
  const bearer = readBearer(c);
  const isAdmin = await isTenantAdminOrSuperAdmin(auth, config, bearer);
  if (!isVisibleToCaller(registration, isAdmin, auth.isSuperAdmin)) {
    return { error: jsonApiError(c, 403, { message: "Forbidden" }) };
  }
  return { auth, provider: registration.provider, registration };
}
