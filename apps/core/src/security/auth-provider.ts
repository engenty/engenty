import { createCoreUsersDal } from "../dal/core-users.js";
import type { PrincipalContext } from "./auth.js";
import { getSecuritySecret, verifyAccessToken } from "./auth.js";
import { capabilitiesForUser } from "./user-capabilities.js";

/**
 * Auth provider contract for principal resolution.
 * Route layers depend on this interface, not on Supabase or core-users DAL directly.
 *
 * @see docs/dev/backend-abstraction.md
 */
export interface AuthProvider {
  /**
   * Resolve principal for admin fallback (e.g. Supabase session mapped to core admin).
   * Used when JWT verification fails but a session token may map to an admin user.
   */
  resolveAdminFallback(
    authHeader: string | undefined
  ): Promise<PrincipalContext | null>;

  /**
   * Resolve principal: try verifyToken first, then resolveAdminFallback.
   */
  resolvePrincipal(
    authHeader: string | undefined
  ): Promise<PrincipalContext | null>;

  /**
   * Resolve tenant ID for session-scoped operations (e.g. audit scope filtering).
   * Returns tenantId from JWT or Supabase session, or null.
   */
  resolveTenantForSession(
    authHeader: string | undefined
  ): Promise<string | null>;
  /** Verify JWT (engenty-core tokens) and return principal, or null if invalid. */
  verifyToken(authHeader: string | undefined): Promise<PrincipalContext | null>;
}

function readBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

/**
 * Supabase-backed auth provider. Uses core DAL for admin fallback (Supabase session -> core admin).
 */
export function createSupabaseAuthProvider(
  config: Record<string, unknown>
): AuthProvider {
  const secret = getSecuritySecret(config);

  return {
    async verifyToken(authHeader: string | undefined) {
      return verifyAccessToken(authHeader, secret, {
        transport: "http",
      });
    },

    async resolveAdminFallback(authHeader: string | undefined) {
      const sessionToken = readBearerToken(authHeader);
      if (!sessionToken) {
        return null;
      }
      try {
        const dal = createCoreUsersDal(config);
        const authUser = await dal.resolveAuthUser(sessionToken);
        const tenantId = await dal.getTenantIdForAuthUser(sessionToken);
        if (!tenantId) {
          return null;
        }
        const isAdmin = await dal.isAuthUserAdmin(sessionToken);
        return {
          principalId: authUser.id,
          principalType: "user" as const,
          tenantId,
          authMethod: "oauth" as const,
          tokenType: "access" as const,
          roles: isAdmin ? ["admin"] : [],
          permissions: [],
          delegationChain: [],
          scopes: [],
          moduleIds: [],
          capabilities: capabilitiesForUser({
            isSuperAdmin: false,
            tenantRole: isAdmin ? "admin" : "member",
          }),
          roleProfiles: [],
          audience: [],
          transport: "http" as const,
        };
      } catch {
        return null;
      }
    },

    async resolvePrincipal(authHeader: string | undefined) {
      const fromToken = await this.verifyToken(authHeader);
      if (fromToken) {
        return fromToken;
      }
      return this.resolveAdminFallback(authHeader);
    },

    async resolveTenantForSession(authHeader: string | undefined) {
      const principal = await this.verifyToken(authHeader);
      if (principal) {
        return principal.tenantId || null;
      }
      const sessionToken = readBearerToken(authHeader);
      if (!sessionToken) {
        return null;
      }
      try {
        return (
          (await createCoreUsersDal(config).getTenantIdForAuthUser(
            sessionToken
          )) ?? null
        );
      } catch {
        return null;
      }
    },
  };
}
