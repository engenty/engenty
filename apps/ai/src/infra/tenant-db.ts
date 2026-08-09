/**
 * Tenant-locked database handles for apps/ai (Phase A,
 * PLAN-tenant-isolation-a-rls-seam.md).
 *
 * REPLICA — apps/core/src/infra/tenant-db.ts is the source of truth for the
 * minting semantics (role, TTLs, cache sizes, preflight). apps/ai has no
 * package dependency on apps/core, so the factory is replicated here verbatim;
 * keep the two files in sync when either changes.
 *
 * Mints short-lived JWTs with `role: "engenty_server"` + the tenant_id claim and hands
 * out cached supabase-js clients bound to them. engenty_server has NOBYPASSRLS, so the
 * srv_tenant_isolation policies confine every query — scoped or not — to the minted
 * tenant. The explicit `.eq("tenant_id", …)` filters in the DAL stay as the belt;
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
import { createAiDatabaseAdapter } from "./database.js";

export const SERVER_LANE_ROLE = "engenty_server";

// Must stay a UUID — see the note in apps/core/src/infra/tenant-db.ts. A
// non-UUID subject makes the per-user policies on ai.thread / ai.agent_run
// (and friends) throw on their `sub::uuid` cast, which breaks every chat and
// agent run for this role.
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

// ---------------------------------------------------------------------------
// apps/ai additions (NOT in the core original): the env-resolved singleton and
// the dual-lane source the DAL store factories accept.

export type GetTenantDb = TenantDbFactory["getTenantDb"];

let envFactory: TenantDbFactory | null | undefined;

/** Factory built (once) from env; null when the tenant lane is unconfigured. */
export function getTenantDbFactoryFromEnv(): TenantDbFactory | null {
  if (envFactory === undefined) {
    const config = resolveTenantDbConfig(
      process.env as unknown as Record<string, unknown>
    );
    envFactory = config ? createTenantDbFactory(config) : null;
  }
  return envFactory;
}

/**
 * Dual-lane handle bundle for DAL store factories: tenant-keyed work resolves
 * a tenant-locked handle per call; the documented global/cross-tenant
 * residuals (platform model catalog, boot sweeps, tables without tenant_id)
 * keep the service-role client.
 */
export interface TenantScopedDbSource {
  getTenantDb: GetTenantDb;
  serviceDb: SupabaseClient;
}

/**
 * What a store factory accepts: a plain SupabaseClient serves BOTH lanes
 * (tests and callers that already hold the right handle — the pre-Phase-A
 * behavior), a TenantScopedDbSource splits them.
 */
export type DbSource = SupabaseClient | TenantScopedDbSource;

export function normalizeDbSource(source: DbSource): {
  forTenant: (tenantId: string) => SupabaseClient;
  service: SupabaseClient;
} {
  if (
    "getTenantDb" in source &&
    typeof (source as TenantScopedDbSource).getTenantDb === "function"
  ) {
    const scoped = source as TenantScopedDbSource;
    return {
      forTenant: (tenantId) => scoped.getTenantDb({ tenantId }),
      service: scoped.serviceDb,
    };
  }
  const client = source as SupabaseClient;
  return { forTenant: () => client, service: client };
}

/**
 * Both lanes from env, or null when EITHER lane is unconfigured — fail closed,
 * matching the module-plugin pattern (WP4): a store without a tenant lane must
 * not silently run everything on service-role. In a correctly configured
 * environment ENGENTY_SECURITY_JWT_SECRET always exists (security/auth.ts
 * verifies browser tokens with it), so this only trips on genuinely broken env.
 */
export function createDbSourceFromEnv(): TenantScopedDbSource | null {
  const serviceDb = createAiDatabaseAdapter(
    process.env as unknown as Record<string, unknown>
  );
  const factory = getTenantDbFactoryFromEnv();
  if (!(serviceDb && factory)) {
    return null;
  }
  return { getTenantDb: factory.getTenantDb, serviceDb };
}
