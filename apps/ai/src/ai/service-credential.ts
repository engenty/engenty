// Token vendor for the AI service principal.
//
// The headless plane (scheduler fires, dispatched task jobs, remote channels)
// has no signed-in user, but every core call it makes needs an authenticated
// principal — RLS scoping, the policy engine, and audit attribution all hang
// off the token.
//
// The one credential is ENGENTY_AI_SERVICE_SECRET (`<credentialId>.<rawSecret>`,
// from `engenty service-token create`). It is durable and never expires; its
// only power is to be exchanged at core's POST /api/auth/service-token for a
// 15-minute engenty service token, minted per tenant on demand. Revocation is
// `engenty service-token revoke` (sets disabled_at) — every future mint fails
// loudly within one token lifetime. No Supabase user, no long-lived bearer in
// an env var, and a misconfiguration fails loudly instead of falling back.
import { createLogger } from "@engenty/telemetry";
import { getEngentyCoreBaseUrlFromEnv } from "./core-http-client.js";

const logger = createLogger({ name: "service-credential" });

/** Re-login when less than this much lifetime remains. Comfortably larger than
 * any single scheduled fire or task run's token use, well under the 15-min
 * service-token lifetime. */
const REFRESH_MARGIN_MS = 120_000;

interface CachedSession {
  accessToken: string;
  /** epoch ms */
  expiresAtMs: number;
}

/**
 * Sessions are cached PER TENANT: a platform-scoped credential mints a
 * separate tenant-scoped token for each tenant it acts for (dispatch, per-
 * tenant reconcile, actor mints). The key is the requested tenant id, or
 * `""` for "the credential's own tenant" (a tenant-bound credential asked
 * with no explicit tenant — the pre-multi-tenant behavior).
 */
const cachedSessions = new Map<string, CachedSession>();
const inflightLogins = new Map<string, Promise<CachedSession>>();

/**
 * The durable service credential, as `<credentialId>.<rawSecret>`.
 *
 * One env var carries both exchange inputs so operators have a single value to
 * set and rotate. A malformed value is treated as unconfigured rather than
 * silently half-parsed — an id with no secret would otherwise produce a
 * confusing 401 from core instead of an obvious "not configured".
 */
function exchangeCredential(): { credentialId: string; secret: string } | null {
  const raw = process.env.ENGENTY_AI_SERVICE_SECRET?.trim();
  if (!raw) {
    return null;
  }
  const separator = raw.indexOf(".");
  if (separator <= 0) {
    return null;
  }
  const credentialId = raw.slice(0, separator).trim();
  const secret = raw.slice(separator + 1).trim();
  return credentialId && secret ? { credentialId, secret } : null;
}

/** True when the service credential is configured. The scheduler and remote
 * channels use this for their boot-time "disabled — not configured" decision;
 * it never performs I/O. */
export function isServiceCredentialConfigured(): boolean {
  return exchangeCredential() !== null;
}

/**
 * Exchange the durable secret for a short-lived engenty service token.
 *
 * This never touches Supabase auth: core verifies the secret against
 * `core.service_credential` and signs a principal token. An auth outage
 * cannot stop scheduled triggers.
 */
async function exchangeForServiceToken(
  credential: {
    credentialId: string;
    secret: string;
  },
  tenantId?: string
): Promise<CachedSession> {
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!coreBaseUrl) {
    throw new Error(
      "service-credential: a core base URL is required to exchange ENGENTY_AI_SERVICE_SECRET"
    );
  }
  const response = await fetch(
    `${coreBaseUrl.replace(/\/$/, "")}/api/auth/service-token`,
    {
      body: JSON.stringify({
        credentialId: credential.credentialId,
        secret: credential.secret,
        ...(tenantId ? { tenantId } : {}),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `service-credential: token exchange failed for credential ${credential.credentialId} — HTTP ${response.status} ${body.slice(0, 300)}`
    );
  }
  const session = (await response.json()) as {
    expiresIn?: number;
    token?: string;
  };
  if (!session.token) {
    throw new Error(
      "service-credential: token exchange response carried no token"
    );
  }
  return {
    accessToken: session.token,
    expiresAtMs: Date.now() + (session.expiresIn ?? 900) * 1000,
  };
}

/**
 * Current access token for the service principal, minting or renewing as
 * needed. Returns null only when no credential is configured at all —
 * a configured-but-failing credential throws, because "no token" and
 * "credential rejected" must not look alike to callers.
 *
 * `tenantId` names the tenant the token must be scoped to. With a
 * platform-scoped credential (row has tenant_id NULL) each tenant gets its
 * own cached session; a tenant-bound credential simply refuses foreign
 * tenants at the exchange (403 → throw). Omitting it mints for the
 * credential's own tenant.
 *
 * Concurrent callers during a (re-)login share one in-flight exchange per
 * tenant.
 */
export async function getServiceAccessToken(options?: {
  tenantId?: string;
}): Promise<string | null> {
  const tenantId = options?.tenantId;
  const credential = exchangeCredential();
  if (!credential) {
    return null;
  }
  const cacheKey = tenantId ?? "";
  const cached = cachedSessions.get(cacheKey);
  if (cached && cached.expiresAtMs - Date.now() > REFRESH_MARGIN_MS) {
    return cached.accessToken;
  }
  let inflight = inflightLogins.get(cacheKey);
  if (!inflight) {
    inflight = exchangeForServiceToken(credential, tenantId)
      .then((session) => {
        cachedSessions.set(cacheKey, session);
        logger.info("service access token minted", {
          expiresAt: new Date(session.expiresAtMs).toISOString(),
          ...(tenantId ? { tenantId } : {}),
        });
        return session;
      })
      .finally(() => {
        inflightLogins.delete(cacheKey);
      });
    inflightLogins.set(cacheKey, inflight);
  }
  const session = await inflight;
  return session.accessToken;
}

/**
 * The `refreshAccessToken` callback for a run acting as the service
 * principal: re-mints through the durable secret so a core 401 mid-run
 * (service tokens live 15 minutes; steps can run longer) retries on a live
 * bearer. Undefined for every other credential — an interactive user token
 * has no mint path, and its 401 must surface unchanged.
 */
export function serviceScopeTokenRefresher(scope: {
  credential?: { kind?: string } | null;
  tenantId?: string;
}): (() => Promise<string | null>) | undefined {
  if (scope.credential?.kind !== "service") {
    return;
  }
  const tenantId = scope.tenantId;
  return () => getServiceAccessToken(tenantId ? { tenantId } : undefined);
}

/** Test seam: drop the cached sessions so the next call re-mints. */
export function resetServiceCredentialCache(): void {
  cachedSessions.clear();
  inflightLogins.clear();
}
