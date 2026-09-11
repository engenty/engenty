// User-facing unified workspace search.
//   POST /api/workspace-search — cross-source retrieval search scoped to the
//     caller's tenant/user. Backs as-you-type surfaces (the chat @-mention
//     picker); unlike `/api/search-index/*` (an admin diagnostics surface) any
//     authenticated tenant member may call it. Source `visibility` config
//     restricts owner-scoped sources to the caller.

import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { accessibleSpaceIds } from "../../dal/space-membership.js";
import type { PluginRegistry } from "../../plugins/registry.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireAuth } from "./authz.js";

const logger = createLogger({ name: "workspace-search" });

/** Owns nothing, member of nothing — resolves exactly the open spaces. */
const NIL_USER_ID = "00000000-0000-0000-0000-000000000000";

interface RouteContext {
  json: (object: unknown, status?: number) => Response;
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
  };
}

const workspaceSearchBodySchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  /** Restrict to specific source types, e.g. ["contacts.contact"]. */
  source_types: z.array(z.string()).optional(),
  query: z.string().min(1),
});

export interface RegisterWorkspaceSearchRoutesParams {
  app: {
    post: (
      path: string,
      handler: (c: RouteContext) => Promise<Response>
    ) => unknown;
  };
  config: Record<string, unknown>;
  registry: PluginRegistry;
}

export function registerWorkspaceSearchRoutes(
  params: RegisterWorkspaceSearchRoutesParams
): void {
  const { app, config, registry } = params;

  // Tenant-locked handle, same lane the rest of the space reads run on.
  const getDb = (tenantId: string): SupabaseClient =>
    (registry.getTenantDb as (auth: { tenantId: string }) => SupabaseClient)({
      tenantId,
    });

  app.post("/api/workspace-search", async (c) => {
    const authed = await requireAuth(c, config);
    if ("error" in authed) {
      return authed.error;
    }
    const { auth } = authed;
    if (!auth.tenantId) {
      return jsonApiError(c, 400, { message: "tenant scope required" });
    }
    const service = registry.retrievalService;
    if (!service) {
      return jsonApiSuccess(c, { matches: [], total: 0 });
    }
    const raw = await c.req.json().catch(() => ({}));
    const parsed = workspaceSearchBodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonApiError(c, 400, { message: "invalid body" });
    }
    // Space containment (PLAN-spaces.md Phase P4). This is the surface where a
    // private space leaks most quietly: it never passes through a `/s/<key>`
    // route, so neither `requireSpaceAccess` nor the module-route gate is in the
    // path, and a KB article in someone's personal space would otherwise come
    // back to whoever types its title.
    //
    // Computed here from the authenticated principal and never read from the
    // body. A non-user principal resolves the OPEN spaces only, via the nil UUID
    // (which owns nothing and is a member of nothing).
    let spaceIds: string[];
    try {
      spaceIds = [
        ...(await accessibleSpaceIds(
          getDb(auth.tenantId),
          auth.tenantId,
          auth.principalType === "user" && auth.userId
            ? auth.userId
            : NIL_USER_ID
        )),
      ];
    } catch (error) {
      // Failing OPEN here would silently un-scope every search, so a lookup that
      // cannot answer refuses the request instead.
      logger.error("workspace_search_space_scope_failed", { error });
      return jsonApiError(c, 503, { message: "workspace search unavailable" });
    }

    try {
      const response = await service.search({
        filters: {
          space_ids: spaceIds,
          tenant_id: auth.tenantId,
          user_id: auth.userId,
          ...(parsed.data.source_types?.length
            ? { source_types: parsed.data.source_types }
            : {}),
        } as never,
        limit: parsed.data.limit ?? 10,
        query: parsed.data.query,
        strategy: "lexical",
      });
      return jsonApiSuccess(c, {
        matches: response.results,
        total: response.total,
      });
    } catch (error) {
      logger.error("workspace_search_failed", { error });
      return jsonApiError(c, 500, { message: "workspace search failed" });
    }
  });
}
