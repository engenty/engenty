import type { SupabaseClient } from "@supabase/supabase-js";
import { listAssignedRoleIds } from "../dal/role-assignments.js";
import { getTenantRole } from "../dal/tenant-roles.js";
import { createDatabaseAdapter } from "../infra/index.js";
import {
  createAssignedRoleIdsCache,
  type GrantSubject,
  type PrincipalGrants,
  type RoleProfileLookup,
  resolveGrants,
} from "./resolve-grants.js";

export interface GrantsService {
  /** Invalidate the assignment cache after a write. */
  invalidate: (tenantId: string, subjectId?: string) => void;
  resolveGrants: (
    subject: GrantSubject,
    tenantId: string
  ) => Promise<PrincipalGrants>;
}

export interface CreateGrantsServiceDeps {
  cacheTtlMs?: number;
  /** Injectable for tests. */
  client?: SupabaseClient;
  /**
   * Tenant-locked handle factory (Phase A seam). Every read this service makes
   * is per-tenant (role_assignments, tenant_roles), so when provided the
   * queries run on the engenty_server lane and RLS is the wall; the service
   * client remains only as the no-lane dev fallback.
   */
  getDb?: (auth: { tenantId: string }) => SupabaseClient;
  /**
   * Lookup for role-id → RoleProfile. Pass the loaded plugin registry's
   * RoleProfileRegistry so module-contributed profiles resolve; falls back to
   * core built-ins only if omitted.
   */
  getRegistry: () => RoleProfileLookup | undefined;
}

/**
 * Builds the request-time grants resolver used by the auth provider and
 * device-flow approval clamp. Owns a service-role Supabase client (reads
 * core.role_assignments, which is service-role-only) and a short TTL cache.
 */
export function createGrantsService(
  config: Record<string, unknown>,
  deps: CreateGrantsServiceDeps
): GrantsService {
  const client =
    deps.client ??
    (() => {
      const created = createDatabaseAdapter(config);
      if (!created) {
        throw new Error("Missing Supabase service configuration.");
      }
      return created;
    })();
  const dbFor = (tenantId: string) =>
    deps.getDb ? deps.getDb({ tenantId }) : client;

  const cache = createAssignedRoleIdsCache(
    (tenantId, subject) =>
      listAssignedRoleIds(dbFor(tenantId), tenantId, subject),
    { ttlMs: deps.cacheTtlMs }
  );

  const emptyRegistry: RoleProfileLookup = { get: () => undefined };

  return {
    resolveGrants: (subject, tenantId) =>
      resolveGrants(
        {
          registry: deps.getRegistry() ?? emptyRegistry,
          listAssignedRoleIds: cache.listAssignedRoleIds,
          // Phase 7: resolve tenant-defined custom.* roles not in the code
          // registry. Only invoked for ids the registry doesn't know.
          getTenantRole: (tenantId2, roleId) =>
            getTenantRole(dbFor(tenantId2), tenantId2, roleId),
        },
        subject,
        tenantId
      ),
    invalidate: cache.invalidate,
  };
}
