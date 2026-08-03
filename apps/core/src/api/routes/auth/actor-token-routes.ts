// Delegated actor tokens (engenty-remote Phase 2).
//
// A privileged caller (the AI service principal, or a tenant admin) mints a
// SHORT-LIVED access token for a specific { userId, tenantId } so a headless
// agent run — e.g. a messenger turn on a remote channel — executes with that
// user's own capabilities instead of the service identity. The token is a
// regular engenty-core principal token (verified by the fast verifyToken
// path), with delegation provenance recorded in its claims and an audit event
// on every mint.
//
// Guard rails:
//   * caller needs `core.users.impersonate` (covered by `*` for tenant
//     admins and the AI service principal; NOT covered by `module.*`).
//   * target tenant must be the caller's tenant (no cross-tenant minting).
//   * TTL is clamped to [60s, 900s]; default 300s.
//   * the minted principal carries the TARGET user's resolved grants — the
//     caller's capabilities never leak into the token.

import { capabilityCovers } from "@engenty/plugin-sdk";
import { createClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import { resolveSupabaseConfig } from "../../../dal/supabase-config.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { recordCoreAuditEvent } from "../../../security/audit-service.js";
import {
  getSecuritySecret,
  type PrincipalContext,
} from "../../../security/auth.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import type { GrantsService } from "../../../security/grants-service.js";
import { checkRateLimit, signPrincipalToken } from "./auth-routes.js";

const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 900;
const MIN_TTL_SECONDS = 60;

export const ACTOR_TOKEN_CAPABILITY = "core.users.impersonate";

interface HonoLikeApp {
  post(
    path: string,
    handler: (c: {
      req: {
        header: (name: string) => string | undefined;
        json: () => Promise<unknown>;
      };
      json: (body: unknown, status?: number) => Response;
    }) => Promise<Response> | Response
  ): unknown;
}

export function registerActorTokenRoutes(params: {
  app: HonoLikeApp;
  auditLog: SecurityAuditLogAdapter;
  authProvider: AuthProvider;
  config: Record<string, unknown>;
  grants: GrantsService;
}): void {
  const { url, serviceRoleKey } = resolveSupabaseConfig(params.config);
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  async function tenantRoleForUser(
    userId: string,
    tenantId: string
  ): Promise<"admin" | "member" | null> {
    const { data, error } = await supabase
      .schema("core")
      .from("user_tenant_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      throw new Error(`actor-token membership lookup failed: ${error.message}`);
    }
    const role = (data?.role ?? null) as string | null;
    return role === "admin" ? "admin" : role ? "member" : null;
  }

  params.app.post("/api/auth/actor-token", async (c) => {
    const secret = getSecuritySecret(params.config);
    if (!secret) {
      return c.json({ error: "Auth secret not configured" }, 500);
    }
    // Full provider path: accepts both engenty principal tokens and the
    // Supabase-minted AI service JWT (admin fallback).
    const caller = await params.authProvider.resolvePrincipal(
      c.req.header("authorization")
    );
    if (!caller) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    // The WHOLE held set goes to the matcher, once. Mapping it per-element
    // used to pass a single capability string, where the matcher's
    // `granted.includes("*")` degrades into a substring test — so any held
    // capability merely CONTAINING an asterisk (every member holds
    // `module.*`) satisfied `core.users.impersonate` and any member could
    // mint an actor token for a tenant admin.
    if (!capabilityCovers(caller.capabilities, ACTOR_TOKEN_CAPABILITY)) {
      recordCoreAuditEvent(params.auditLog, {
        detail: {
          caller: caller.principalId,
          callerType: caller.principalType,
          required: ACTOR_TOKEN_CAPABILITY,
        },
        type: "auth.actor_token_denied",
      });
      return c.json({ error: "Forbidden" }, 403);
    }

    // Minting an impersonation token is at least as sensitive as exchanging a
    // service secret, which has been rate-limited since it shipped. Key on the
    // caller AND the source IP so neither a stolen token nor a single host can
    // grind through the tenant's user list.
    const sourceIp = c.req.header("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`actor-token:${caller.principalId}:${sourceIp}`)) {
      recordCoreAuditEvent(params.auditLog, {
        detail: {
          caller: caller.principalId,
          route: "actor-token",
          sourceIp,
        },
        type: "auth.rate_limited",
      });
      return c.json({ error: "Too Many Requests" }, 429);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      reason?: string;
      tenant_id?: string;
      ttl_seconds?: number;
      user_id?: string;
    };
    const userId = body.user_id?.trim();
    const tenantId = body.tenant_id?.trim();
    if (!(userId && tenantId)) {
      return c.json({ error: "user_id and tenant_id are required" }, 400);
    }
    if (tenantId !== caller.tenantId) {
      return c.json(
        { error: "cross-tenant actor tokens are not allowed" },
        403
      );
    }

    const tenantRole = await tenantRoleForUser(userId, tenantId);
    if (!tenantRole) {
      return c.json({ error: "user is not a member of this tenant" }, 404);
    }

    const grants = await params.grants.resolveGrants(
      { id: userId, isSuperAdmin: false, kind: "user", tenantRole },
      tenantId
    );

    const ttl = Math.min(
      MAX_TTL_SECONDS,
      Math.max(
        MIN_TTL_SECONDS,
        Math.floor(body.ttl_seconds ?? DEFAULT_TTL_SECONDS)
      )
    );
    const tokenId = uuidv7();
    const principal: PrincipalContext = {
      audience: ["engenty"],
      authMethod: "oauth",
      capabilities: grants.capabilities,
      delegationChain: [caller.principalId],
      moduleIds: [],
      permissions: [],
      principalId: userId,
      principalType: "user",
      roleProfiles: grants.roleProfiles,
      roles: [tenantRole],
      scopes: [],
      tenantId,
      tokenType: "access",
    };
    const token = await signPrincipalToken({
      expiresInSeconds: ttl,
      principal,
      secret,
      tokenId,
      tokenType: "access",
    });

    recordCoreAuditEvent(params.auditLog, {
      detail: {
        caller: caller.principalId,
        callerType: caller.principalType,
        reason: body.reason ?? null,
        tenantId,
        tokenId,
        ttlSeconds: ttl,
        userId,
      },
      type: "auth.actor_token_minted",
    });

    return c.json({ expires_in: ttl, ok: true, token });
  });
}
