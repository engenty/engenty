/**
 * Tenant-locked database handles for the server lane (Phase A,
 * PLAN-tenant-isolation-a-rls-seam.md).
 *
 * Mints short-lived JWTs with `role: "engenty_server"` + the tenant_id claim and hands
 * out cached supabase-js clients bound to them. engenty_server has NOBYPASSRLS, so the
 * srv_tenant_isolation policies confine every query — scoped or not — to the minted
 * tenant. The explicit `.eq("tenant_id", …)` filters in module DALs stay as the belt;
 * these policies are the wall.
 *
 * The signing secret must be the stack's JWT secret (what PostgREST verifies).
 * Resolution order: SUPABASE_JWT_SECRET, then ENGENTY_SECURITY_JWT_SECRET — the latter
 * already verifies GoTrue-issued browser tokens in security/auth.ts, so in a correctly
 * configured environment it IS the stack secret. assertServerLanePreflight() fails loud
 * at boot when the minted tokens don't verify against PostgREST.
 */

import { envString } from "@engenty/environment/env";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

export const SERVER_LANE_ROLE = "engenty_server";

// The server lane acts for a TENANT, not a user — but the subject claim must
// still be a UUID. Several pre-existing per-user policies read it as
// `(current_jwt() ->> 'sub')::uuid`, and since policies are OR-combined AND
// evaluated for every applicable role, a non-UUID subject makes that cast
// throw at plan time and takes the whole table down for this role (ai.thread,
// ai.thread_message, ai.thread_participant, ai.agent_run, ai.agent_run_event,
// core.user_settings). The nil UUID parses, matches no row, and leaves access
// to the srv_tenant_isolation policy — which is exactly the intent.
export const SERVER_LANE_SUBJECT = "00000000-0000-0000-0000-000000000000";

const TOKEN_TTL_SECONDS = 600;
const TOKEN_REFRESH_MARGIN_SECONDS = 120;
const CLIENT_CACHE_MAX = 500;

interface MintedToken {
  expiresAtEpochSeconds: number;
  token: string;
}

export interface TenantDbConfig {
  anonKey: string;
  jwtSecret: string;
  url: string;
}

export function resolveTenantDbConfig(
  config: Record<string, unknown>
): TenantDbConfig | null {
  const url = envString(config, "supabaseUrl", "SUPABASE_URL");
  const anonKey =
    envString(config, "supabaseAnonKey", "SUPABASE_ANON_KEY") ||
    envString(config, "supabasePublishableKey", "SUPABASE_PUBLISHABLE_KEY") ||
    envString(config, "viteSupabaseAnonKey", "VITE_SUPABASE_ANON_KEY");
  const jwtSecret =
    envString(config, "supabaseJwtSecret", "SUPABASE_JWT_SECRET") ||
    envString(config, "securityJwtSecret", "ENGENTY_SECURITY_JWT_SECRET");
  if (!(url && anonKey && jwtSecret)) {
    return null;
  }
  return { url, anonKey, jwtSecret };
}

export interface TenantDbFactory {
  /** Boot probe: fails loud when minted tokens don't verify against PostgREST. */
  assertServerLanePreflight(): Promise<void>;
  /** Tenant-locked client: every query is confined to this tenant by RLS. */
  getTenantDb(auth: { tenantId: string; principalId?: string }): SupabaseClient;
}

export function createTenantDbFactory(config: TenantDbConfig): TenantDbFactory {
  const secretKey = new TextEncoder().encode(config.jwtSecret);
  const tokenCache = new Map<string, MintedToken>();
  const clientCache = new Map<string, SupabaseClient>();

  async function mintServerToken(tenantId: string): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const cached = tokenCache.get(tenantId);
    if (
      cached &&
      cached.expiresAtEpochSeconds - nowSeconds > TOKEN_REFRESH_MARGIN_SECONDS
    ) {
      return cached.token;
    }
    const expiresAtEpochSeconds = nowSeconds + TOKEN_TTL_SECONDS;
    const token = await new SignJWT({
      role: SERVER_LANE_ROLE,
      tenant_id: tenantId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("engenty-core")
      .setSubject(SERVER_LANE_SUBJECT)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expiresAtEpochSeconds)
      .sign(secretKey);
    tokenCache.set(tenantId, { token, expiresAtEpochSeconds });
    return token;
  }

  function getTenantDb(auth: {
    tenantId: string;
    principalId?: string;
  }): SupabaseClient {
    const tenantId = auth.tenantId?.trim();
    if (!tenantId) {
      throw new Error("getTenantDb requires a non-empty tenantId.");
    }
    const existing = clientCache.get(tenantId);
    if (existing) {
      // Refresh LRU recency.
      clientCache.delete(tenantId);
      clientCache.set(tenantId, existing);
      return existing;
    }
    const client = createClient(config.url, config.anonKey, {
      accessToken: () => mintServerToken(tenantId),
    });
    clientCache.set(tenantId, client);
    if (clientCache.size > CLIENT_CACHE_MAX) {
      const oldest = clientCache.keys().next().value;
      if (oldest !== undefined) {
        clientCache.delete(oldest);
      }
    }
    return client;
  }

  async function assertServerLanePreflight(): Promise<void> {
    const probe = getTenantDb({
      tenantId: "00000000-0000-0000-0000-000000000000",
    });
    const { error } = await probe
      .schema("core")
      .from("tenants")
      .select("id")
      .limit(1);
    if (error) {
      throw new Error(
        `Server-lane preflight failed: minted engenty_server tokens are not accepted by PostgREST (${error.message}). ` +
          "Check that the signing secret (SUPABASE_JWT_SECRET / ENGENTY_SECURITY_JWT_SECRET) matches the stack's JWT secret " +
          "and that migration 20260809200000_core_engenty_server_lane.sql has been applied."
      );
    }
  }

  return { getTenantDb, assertServerLanePreflight };
}
