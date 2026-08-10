// Browser “Login as” for platform superadmins.
//
// Mints a real Supabase session for a target user (generateLink + verifyOtp)
// so the admin UI can setSession and act as that member. Distinct from
// `/api/auth/actor-token`, which issues short-lived engenty principal JWTs for
// headless remote-channel turns — not a browser refresh session.
//
// Guard rails:
//   * caller must hold `core.superadmin` (platform superadmin only — tenant
//     admins with `*` alone are refused).
//   * cannot impersonate self; target must exist and have an email.
//   * rate-limited; every successful mint is audited.

import { envString } from "@engenty/environment/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AuthUnavailableError } from "../../../dal/core-users/auth.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { recordCoreAuditEvent } from "../../../security/audit-service.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import { checkRateLimit } from "./auth-routes.js";

/** Explicit capability that only platform superadmins carry. */
export const IMPERSONATE_SUPERADMIN_CAPABILITY = "core.superadmin";

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

export interface ImpersonationUserLabel {
  display_name: string | null;
  email: string;
  id: string;
}

export interface ImpersonationSessionResult {
  access_token: string;
  refresh_token: string;
}

function readSupabaseUrl(config: Record<string, unknown>): string {
  return envString(config, "supabaseUrl", "SUPABASE_URL");
}

function readServiceRoleKey(config: Record<string, unknown>): string {
  return envString(
    config,
    "supabaseServiceRoleKey",
    "SUPABASE_SERVICE_ROLE_KEY"
  );
}

function readAnonKey(config: Record<string, unknown>): string {
  return (
    envString(config, "supabaseAnonKey", "SUPABASE_ANON_KEY") ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  );
}

function displayNameFromAuthUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string | null {
  const meta = user.user_metadata ?? {};
  const fromMeta =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.display_name === "string" && meta.display_name.trim()) ||
    "";
  if (fromMeta) {
    return fromMeta;
  }
  const email = user.email?.trim();
  return email ? (email.split("@")[0] ?? null) : null;
}

/**
 * Exchange an admin-generated magiclink token_hash for a Supabase session.
 * Exported for unit tests.
 */
export async function mintSupabaseSessionForEmail(
  admin: SupabaseClient,
  anon: SupabaseClient,
  email: string
): Promise<ImpersonationSessionResult> {
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
  if (linkError) {
    throw new Error(`generateLink failed: ${linkError.message}`);
  }
  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error("generateLink returned no hashed_token");
  }
  const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (otpError || !otpData.session) {
    throw new Error(
      `verifyOtp failed: ${otpError?.message ?? "no session returned"}`
    );
  }
  return {
    access_token: otpData.session.access_token,
    refresh_token: otpData.session.refresh_token,
  };
}

export function registerImpersonateRoutes(params: {
  app: HonoLikeApp;
  auditLog: SecurityAuditLogAdapter;
  authProvider: AuthProvider;
  config: Record<string, unknown>;
  /** Optional override for tests — skips real Supabase clients. */
  mintSession?: (
    admin: SupabaseClient,
    anon: SupabaseClient,
    email: string
  ) => Promise<ImpersonationSessionResult>;
  /** Optional override for tests — skips real admin user lookups. */
  lookupAuthUser?: (
    admin: SupabaseClient,
    userId: string
  ) => Promise<ImpersonationUserLabel | null>;
}): void {
  const mintSession = params.mintSession ?? mintSupabaseSessionForEmail;
  const lookupAuthUser =
    params.lookupAuthUser ??
    (async (admin, userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data?.user) {
        return null;
      }
      const user = data.user;
      return {
        id: user.id,
        email: user.email ?? "",
        display_name: displayNameFromAuthUser(user),
      };
    });

  params.app.post("/api/auth/impersonate", async (c) => {
    let caller: Awaited<
      ReturnType<typeof params.authProvider.resolvePrincipal>
    >;
    try {
      caller = await params.authProvider.resolvePrincipal(
        c.req.header("authorization")
      );
    } catch (error) {
      if (error instanceof AuthUnavailableError) {
        return c.json({ error: "Auth service unavailable" }, 503);
      }
      throw error;
    }
    if (!caller) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (caller.principalType !== "user") {
      return c.json({ error: "Forbidden" }, 403);
    }
    // Platform superadmin only — `*` alone (tenant admin) must not pass.
    if (!caller.capabilities.includes(IMPERSONATE_SUPERADMIN_CAPABILITY)) {
      recordCoreAuditEvent(params.auditLog, {
        detail: {
          caller: caller.principalId,
          callerType: caller.principalType,
          required: IMPERSONATE_SUPERADMIN_CAPABILITY,
        },
        type: "auth.impersonation_denied",
      });
      return c.json({ error: "Forbidden" }, 403);
    }

    const sourceIp = c.req.header("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`impersonate:${caller.principalId}:${sourceIp}`)) {
      recordCoreAuditEvent(params.auditLog, {
        detail: {
          caller: caller.principalId,
          route: "impersonate",
          sourceIp,
        },
        type: "auth.rate_limited",
      });
      return c.json({ error: "Too Many Requests" }, 429);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      user_id?: string;
    };
    const userId = body.user_id?.trim();
    if (!userId) {
      return c.json({ error: "user_id is required" }, 400);
    }
    if (userId === caller.principalId) {
      return c.json({ error: "cannot impersonate yourself" }, 400);
    }

    const supabaseUrl = readSupabaseUrl(params.config);
    const serviceRoleKey = readServiceRoleKey(params.config);
    const anonKey = readAnonKey(params.config);
    if (!(supabaseUrl && serviceRoleKey && anonKey)) {
      return c.json({ error: "Supabase not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const target = await lookupAuthUser(admin, userId);
    if (!target) {
      return c.json({ error: "user not found" }, 404);
    }
    if (!target.email.trim()) {
      return c.json({ error: "user has no email" }, 400);
    }

    const actor =
      (await lookupAuthUser(admin, caller.principalId)) ??
      ({
        id: caller.principalId,
        email: "",
        display_name: null,
      } satisfies ImpersonationUserLabel);

    let session: ImpersonationSessionResult;
    try {
      session = await mintSession(admin, anon, target.email);
    } catch (error) {
      recordCoreAuditEvent(params.auditLog, {
        detail: {
          caller: caller.principalId,
          targetUserId: userId,
          error: error instanceof Error ? error.message : String(error),
        },
        type: "auth.impersonation_failed",
      });
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to mint impersonation session",
        },
        500
      );
    }

    recordCoreAuditEvent(params.auditLog, {
      detail: {
        caller: caller.principalId,
        callerType: caller.principalType,
        targetUserId: target.id,
        targetEmail: target.email,
        tenantId: caller.tenantId ?? null,
      },
      type: "auth.impersonation_started",
    });

    return c.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      target: {
        id: target.id,
        email: target.email,
        display_name: target.display_name,
      },
      actor: {
        id: actor.id,
        email: actor.email,
        display_name: actor.display_name,
      },
    });
  });
}
