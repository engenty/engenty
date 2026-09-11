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
 * Whatever we sign with, PostgREST has to be willing to verify — and that differs
 * per environment, which is what took prod down on v0.1.113:
 *
 * - **HS256 (local / self-hosted):** the stack has one symmetric JWT secret.
 *   Resolution order SUPABASE_JWT_SECRET, then ENGENTY_SECURITY_JWT_SECRET — the
 *   latter already verifies GoTrue-issued browser tokens in security/auth.ts, so in
 *   a correctly configured environment it IS the stack secret.
 * - **ES256 (Supabase Cloud after the asymmetric migration):** the project publishes
 *   a JWKS and holds the private half, so there is no shared secret to sign with and
 *   HS256 tokens are rejected outright ("No suitable key or wrong key type"). Import
 *   an EC P-256 key of OUR OWN into the project's signing keys; we keep the private
 *   key and mint with it, the project only ever needs the public half.
 *
 * Set ENGENTY_SERVER_LANE_PRIVATE_KEY (PKCS8 PEM, or that PEM base64-encoded so it
 * survives single-line env plumbing) + ENGENTY_SERVER_LANE_KEY_ID to pick ES256;
 * otherwise the symmetric secret is used. assertServerLanePreflight() fails loud at
 * boot when the minted tokens don't verify, and names the algorithm it used.
 */

import { envString } from "@engenty/environment/env";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { type CryptoKey, importPKCS8, SignJWT } from "jose";

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

/**
 * How far `iat` is backdated at mint. PostgREST validates `iat` against ITS
 * clock with a hard-coded ~30s leeway and no config knob — anything further in
 * its future is a 401 PGRST303 "JWT issued at future" on every server-lane
 * query. The minter (this process) and the validator (the Supabase container)
 * run on different clocks, and a Docker VM that lagged behind the host after
 * sleep puts host-minted tokens minutes into the container's future; backdating
 * buys the same 30s again on the mint side. Nothing reads `iat` for
 * authorization and `exp` stays anchored to the un-backdated clock, so the
 * token's usable lifetime is unchanged.
 */
export const SERVER_LANE_IAT_BACKDATE_SECONDS = 30;

interface MintedToken {
  expiresAtEpochSeconds: number;
  token: string;
}

/**
 * How the lane signs. ES256 carries a `kid` because the project's JWKS holds more
 * than one key (ours plus the project's own, plus any legacy secret) and the
 * verifier needs to know which one to try.
 */
export type ServerLaneSigningKey =
  | { alg: "ES256"; kid: string; privateKeyPem: string }
  | { alg: "HS256"; secret: string };

export interface TenantDbConfig {
  anonKey: string;
  signingKey: ServerLaneSigningKey;
  url: string;
}

/**
 * Accepts a PKCS8 PEM directly, or that PEM base64-encoded. The encoded form
 * exists because PEM is multi-line and several of the places this value has to
 * travel through (Coolify env editor, docker --env-file, CI secrets) either
 * mangle newlines or refuse them outright.
 */
function decodePrivateKeyPem(raw: string): string {
  const value = raw.trim();
  if (value.includes("BEGIN")) {
    return value;
  }
  const decoded = Buffer.from(value, "base64").toString("utf8");
  if (!decoded.includes("BEGIN")) {
    throw new Error(
      "ENGENTY_SERVER_LANE_PRIVATE_KEY is neither a PKCS8 PEM nor base64 of one."
    );
  }
  return decoded;
}

export function resolveTenantDbConfig(
  config: Record<string, unknown>
): TenantDbConfig | null {
  const url = envString(config, "supabaseUrl", "SUPABASE_URL");
  const anonKey =
    envString(config, "supabaseAnonKey", "SUPABASE_ANON_KEY") ||
    envString(config, "supabasePublishableKey", "SUPABASE_PUBLISHABLE_KEY") ||
    envString(config, "viteSupabaseAnonKey", "VITE_SUPABASE_ANON_KEY");
  if (!(url && anonKey)) {
    return null;
  }

  const privateKey = envString(
    config,
    "serverLanePrivateKey",
    "ENGENTY_SERVER_LANE_PRIVATE_KEY"
  );
  const keyId = envString(
    config,
    "serverLaneKeyId",
    "ENGENTY_SERVER_LANE_KEY_ID"
  );
  // Half-configured is a deployment mistake, not a reason to quietly fall back to
  // HS256 — on an asymmetric project that fallback fails the preflight with a
  // message pointing at the wrong thing, which is exactly how v0.1.113 went down.
  if (Boolean(privateKey) !== Boolean(keyId)) {
    throw new Error(
      "Server lane signing key is half-configured: set BOTH " +
        "ENGENTY_SERVER_LANE_PRIVATE_KEY and ENGENTY_SERVER_LANE_KEY_ID (or neither)."
    );
  }
  if (privateKey && keyId) {
    return {
      url,
      anonKey,
      signingKey: {
        alg: "ES256",
        kid: keyId,
        privateKeyPem: decodePrivateKeyPem(privateKey),
      },
    };
  }

  const secret =
    envString(config, "supabaseJwtSecret", "SUPABASE_JWT_SECRET") ||
    envString(config, "securityJwtSecret", "ENGENTY_SECURITY_JWT_SECRET");
  if (!secret) {
    return null;
  }
  return { url, anonKey, signingKey: { alg: "HS256", secret } };
}

export interface TenantDbFactory {
  /** Boot probe: fails loud when minted tokens don't verify against PostgREST. */
  assertServerLanePreflight(): Promise<void>;
  /** Tenant-locked client: every query is confined to this tenant by RLS. */
  getTenantDb(auth: { tenantId: string; principalId?: string }): SupabaseClient;
}

export function createTenantDbFactory(config: TenantDbConfig): TenantDbFactory {
  const { signingKey } = config;
  // HS256 keys are just bytes; ES256 needs an async import, so it is done once
  // and the PROMISE is cached — concurrent first requests must not each pay for
  // (or race on) the import.
  const symmetricKey =
    signingKey.alg === "HS256"
      ? new TextEncoder().encode(signingKey.secret)
      : null;
  let privateKeyPromise: Promise<CryptoKey> | null = null;
  const resolveSigningKey = (): Promise<CryptoKey> | Uint8Array => {
    if (symmetricKey) {
      return symmetricKey;
    }
    if (signingKey.alg !== "ES256") {
      throw new Error("unreachable: no signing key configured");
    }
    privateKeyPromise ??= importPKCS8(signingKey.privateKeyPem, "ES256");
    return privateKeyPromise;
  };

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
    const header =
      signingKey.alg === "ES256"
        ? { alg: "ES256" as const, kid: signingKey.kid, typ: "JWT" }
        : { alg: "HS256" as const, typ: "JWT" };
    const token = await new SignJWT({
      role: SERVER_LANE_ROLE,
      tenant_id: tenantId,
    })
      .setProtectedHeader(header)
      .setIssuer("engenty-core")
      .setSubject(SERVER_LANE_SUBJECT)
      .setIssuedAt(nowSeconds - SERVER_LANE_IAT_BACKDATE_SECONDS)
      .setExpirationTime(expiresAtEpochSeconds)
      .sign(await resolveSigningKey());
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
      // Name the algorithm actually used. "No suitable key or wrong key type"
      // while signing HS256 almost always means the project has migrated to
      // asymmetric keys and there is no shared secret left to sign with — the
      // v0.1.113 outage — so say so rather than sending the reader back to
      // re-check a secret that was never going to work.
      const how =
        signingKey.alg === "ES256"
          ? `ES256 (kid=${signingKey.kid})`
          : "HS256 (shared secret)";
      const hint =
        signingKey.alg === "HS256" &&
        /no suitable key|wrong key type/i.test(error.message)
          ? "The project appears to verify ASYMMETRIC keys only: import an EC P-256 key into its JWT signing keys, " +
            "then set ENGENTY_SERVER_LANE_PRIVATE_KEY + ENGENTY_SERVER_LANE_KEY_ID so this lane mints ES256."
          : "Check that the signing key is one the project's JWKS trusts, and that migration " +
            "20260809200000_core_engenty_server_lane.sql has been applied.";
      throw new Error(
        `Server-lane preflight failed: minted engenty_server tokens signed with ${how} are not accepted by PostgREST (${error.message}). ${hint}`
      );
    }
  }

  return { getTenantDb, assertServerLanePreflight };
}
