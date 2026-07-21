import { createCoreUsersDal } from "../../dal/core-users.js";
import type { PrincipalContext } from "../../security/auth.js";
import { getSecuritySecret, verifyAccessToken } from "../../security/auth.js";
import { jsonApiError } from "./api-response.js";

interface RouteContext {
  json: (body: unknown, status?: number) => Response;
  req: { header: (name: string) => string | undefined };
}

export interface ResolvedRouteAuth {
  capabilities: string[];
  /**
   * A genuine platform superadmin (core.users.is_super_admin), NOT a tenant
   * admin whose grants happen to include `*`. This is the ONLY signal that may
   * authorize acting across tenants. Derived from the DB flag on the session
   * path and from the `core.superadmin` capability (which only real superadmins
   * carry — tenant admins get `*` without it) on the JWT path.
   */
  isPlatformSuperAdmin: boolean;
  /**
   * Holds a superadmin-tier capability (`*` / `core.*` / `core.superadmin`).
   * A plain tenant admin resolves to `["*"]`, so this is TRUE for them too —
   * use it only for "is this an all-powerful token", never for cross-tenant
   * gating. For that, use {@link isPlatformSuperAdmin}.
   */
  isSuperAdmin: boolean;
  principalType: "user" | "agent" | "service";
  tenantId: string | null;
  userId: string | null;
}

export function readBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

export async function resolveRouteAuth(
  c: RouteContext,
  config: Record<string, unknown>
): Promise<ResolvedRouteAuth | null> {
  const authHeader = c.req.header("authorization");
  const jwtAuth = await verifyAccessToken(
    authHeader,
    getSecuritySecret(config),
    { transport: "rest" }
  );
  if (jwtAuth) {
    const hasSuperCapability =
      jwtAuth.capabilities.includes("core.superadmin") ||
      jwtAuth.capabilities.includes("core.*") ||
      jwtAuth.capabilities.includes("*");
    return {
      userId: jwtAuth.principalId,
      tenantId: jwtAuth.tenantId || null,
      isSuperAdmin: hasSuperCapability,
      // Only real superadmins carry `core.superadmin`; a tenant admin gets `*`
      // (and thus isSuperAdmin) but not this, so it can't cross tenants.
      isPlatformSuperAdmin: jwtAuth.capabilities.includes("core.superadmin"),
      principalType: jwtAuth.principalType,
      capabilities: jwtAuth.capabilities,
    };
  }

  const sessionToken = readBearerToken(authHeader);
  if (!sessionToken) {
    return null;
  }
  try {
    const usersDal = createCoreUsersDal(config);
    const authUser = await usersDal.resolveAuthUser(sessionToken);
    const tenantId = await usersDal.getTenantIdForAuthUser(sessionToken);
    const isSuperAdmin = await usersDal.isAuthUserSuperAdmin(sessionToken);
    return {
      userId: authUser.id,
      tenantId,
      isSuperAdmin,
      // Session superadmin comes straight from the DB flag — authoritative.
      isPlatformSuperAdmin: isSuperAdmin,
      principalType: "user",
      capabilities: [],
    };
  } catch {
    return null;
  }
}

export async function requireAuth(
  c: RouteContext,
  config: Record<string, unknown>
): Promise<{ auth: ResolvedRouteAuth } | { error: Response }> {
  const auth = await resolveRouteAuth(c, config);
  if (!auth) {
    return { error: jsonApiError(c, 401, { message: "Unauthorized" }) };
  }
  return { auth };
}

export async function requireSuperAdmin(
  c: RouteContext,
  config: Record<string, unknown>
): Promise<{ auth: ResolvedRouteAuth } | { error: Response }> {
  const auth = await resolveRouteAuth(c, config);
  if (!auth) {
    return { error: jsonApiError(c, 401, { message: "Unauthorized" }) };
  }
  if (!auth.isSuperAdmin) {
    return { error: jsonApiError(c, 403, { message: "Forbidden" }) };
  }
  return { auth };
}

/**
 * Gate for platform-wide actions that affect every tenant (e.g. installation
 * credentials). Requires a genuine platform superadmin — a tenant admin holding
 * `*` is rejected. Use this, not {@link requireSuperAdmin}, for platform settings.
 */
export async function requirePlatformSuperAdmin(
  c: RouteContext,
  config: Record<string, unknown>
): Promise<{ auth: ResolvedRouteAuth } | { error: Response }> {
  const auth = await resolveRouteAuth(c, config);
  if (!auth) {
    return { error: jsonApiError(c, 401, { message: "Unauthorized" }) };
  }
  if (!auth.isPlatformSuperAdmin) {
    return { error: jsonApiError(c, 403, { message: "Forbidden" }) };
  }
  return { auth };
}

/** Build a minimal PrincipalContext from ResolvedRouteAuth for use with invokeOperation. */
export function toPrincipalContext(auth: ResolvedRouteAuth): PrincipalContext {
  const capabilities =
    auth.isSuperAdmin && !auth.capabilities.includes("core.superadmin")
      ? ["core.superadmin", ...auth.capabilities]
      : auth.capabilities;
  return {
    principalId: auth.userId ?? "",
    tenantId: auth.tenantId ?? "",
    capabilities,
    principalType: auth.principalType,
    roleProfiles: [],
    roles: [],
    permissions: [],
    authMethod: "oauth",
    tokenType: "access",
    delegationChain: [],
    scopes: [],
    moduleIds: [],
    audience: [],
  };
}
