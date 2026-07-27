// Token vendor for the AI service principal.
//
// The service identity (service@engenty.local) needs a Supabase access token —
// it doubles as the RLS credential for every module operation a headless run
// performs. Access tokens expire by design; the old approach froze one into
// ENGENTY_AI_SERVICE_JWT at deploy time, so the scheduler silently died when
// the token did (an hour on hosted Supabase, a week locally at best).
//
// This module holds the durable credential instead — the service user's
// email + password — and vends short-lived access tokens on demand: sign in
// via password grant, cache the session, re-login shortly before expiry.
// Revocation is the identity itself: disable or delete the service user and
// every future mint fails. No project-wide jwt_expiry change, no long-lived
// bearer token in an env var.
//
// ENGENTY_AI_SERVICE_JWT still wins when set. It is the local-dev path
// (pnpm service:jwt) and the escape hatch; a deployment sets either it or the
// email/password pair, not both.
import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "service-credential" });

/** Re-login when less than this much lifetime remains. Comfortably larger than
 * any single scheduled fire or task run's token use, well under the 1h floor
 * of Supabase access-token lifetimes. */
const REFRESH_MARGIN_MS = 120_000;

interface CachedSession {
  accessToken: string;
  /** epoch ms */
  expiresAtMs: number;
}

let cachedSession: CachedSession | null = null;
let inflightLogin: Promise<CachedSession> | null = null;

function staticJwt(): string | null {
  return process.env.ENGENTY_AI_SERVICE_JWT?.trim() || null;
}

function passwordCredential(): { email: string; password: string } | null {
  const email = process.env.ENGENTY_AI_SERVICE_EMAIL?.trim();
  const password = process.env.ENGENTY_AI_SERVICE_PASSWORD?.trim();
  return email && password ? { email, password } : null;
}

/** True when any form of service credential is configured. The scheduler and
 * remote channels use this for their boot-time "disabled — not configured"
 * decision; it never performs I/O. */
export function isServiceCredentialConfigured(): boolean {
  return staticJwt() !== null || passwordCredential() !== null;
}

async function loginWithPassword(credential: {
  email: string;
  password: string;
}): Promise<CachedSession> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  // Password grant needs any valid API key; anon is the natural one but the
  // AI container is only guaranteed the service-role key.
  const apiKey =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!(supabaseUrl && apiKey)) {
    throw new Error(
      "service-credential: SUPABASE_URL and an API key are required to sign in the service identity"
    );
  }
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      body: JSON.stringify({
        email: credential.email,
        password: credential.password,
      }),
      headers: { apikey: apiKey, "content-type": "application/json" },
      method: "POST",
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `service-credential: sign-in failed for ${credential.email} — HTTP ${response.status} ${body.slice(0, 300)}`
    );
  }
  const session = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!session.access_token) {
    throw new Error(
      "service-credential: sign-in response carried no access_token"
    );
  }
  return {
    accessToken: session.access_token,
    expiresAtMs: Date.now() + (session.expires_in ?? 3600) * 1000,
  };
}

/**
 * Current access token for the service principal, minting or renewing as
 * needed. Returns null only when no credential is configured at all —
 * a configured-but-failing credential throws, because "no token" and
 * "credential rejected" must not look alike to callers.
 *
 * Concurrent callers during a (re-)login share one in-flight sign-in.
 */
export async function getServiceAccessToken(): Promise<string | null> {
  const jwt = staticJwt();
  if (jwt) {
    return jwt;
  }
  const credential = passwordCredential();
  if (!credential) {
    return null;
  }
  if (
    cachedSession &&
    cachedSession.expiresAtMs - Date.now() > REFRESH_MARGIN_MS
  ) {
    return cachedSession.accessToken;
  }
  if (!inflightLogin) {
    inflightLogin = loginWithPassword(credential)
      .then((session) => {
        cachedSession = session;
        logger.info("service access token minted", {
          expiresAt: new Date(session.expiresAtMs).toISOString(),
        });
        return session;
      })
      .finally(() => {
        inflightLogin = null;
      });
  }
  const session = await inflightLogin;
  return session.accessToken;
}

/** Test seam: drop the cached session so the next call re-mints. */
export function resetServiceCredentialCache(): void {
  cachedSession = null;
  inflightLogin = null;
}
