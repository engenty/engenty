import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getUserById } from "./crud.js";

const AUTH_USER_CACHE_TTL_MS = 10_000;
const AUTH_USER_FETCH_TIMEOUT_MS = 8000;
const authUserCache = new Map<
  string,
  { expiresAt: number; promise: Promise<User> }
>();

export interface SupabaseAuthVerificationConfig {
  anonKey: string;
  url: string;
}

/** Supabase rejected the bearer token (expired session, bad JWT, etc.). */
export class AuthVerificationError extends Error {
  readonly status = 401 as const;

  constructor(message: string) {
    super(message);
    this.name = "AuthVerificationError";
  }
}

/**
 * The auth server could not be reached or did not answer in time — a timeout,
 * a network failure, or a 5xx. The credential is NOT known to be bad, so this
 * must never be reported as 401: doing so tells the user their session is
 * invalid and sends everyone hunting through permissions, when the real cause
 * is that the auth service is down. A slow local Supabase container produced
 * exactly that dead end once.
 */
export class AuthUnavailableError extends Error {
  readonly status = 503 as const;

  constructor(message: string) {
    super(message);
    this.name = "AuthUnavailableError";
  }
}

function readSupabaseAuthErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "Unauthorized";
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error_code?: string;
      message?: string;
      msg?: string;
    };
    return parsed.msg ?? parsed.message ?? trimmed;
  } catch {
    return trimmed;
  }
}

function getAuthUserCacheKey(
  accessToken: string,
  authConfig: SupabaseAuthVerificationConfig
) {
  return `${authConfig.url}\0${accessToken}`;
}

async function fetchAuthUser(
  accessToken: string,
  authConfig: SupabaseAuthVerificationConfig
): Promise<User> {
  let response: Response;
  try {
    response = await fetch(new URL("/auth/v1/user", authConfig.url), {
      headers: {
        apikey: authConfig.anonKey,
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      signal: AbortSignal.timeout(AUTH_USER_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    // Timeout or transport failure — the token was never judged.
    throw new AuthUnavailableError(
      `auth server unreachable at ${authConfig.url}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (response.status >= 500) {
    // The auth server itself is broken (it answers 500 when it cannot reach
    // its database). Not a credential problem.
    throw new AuthUnavailableError(
      `auth server returned ${response.status}: ${readSupabaseAuthErrorMessage(
        await response.text()
      )}`
    );
  }
  if (!response.ok) {
    const message = readSupabaseAuthErrorMessage(await response.text());
    throw new AuthVerificationError(message);
  }
  const user = (await response.json()) as User | null;
  if (!user?.id) {
    throw new AuthVerificationError("Unauthorized");
  }
  return user;
}

/**
 * Resolves the auth user by calling the Auth server directly.
 * This follows the Supabase guidance for legacy/shared-secret JWT setups:
 * GET /auth/v1/user with apikey + Authorization: Bearer <JWT>.
 */
export async function resolveAuthUser(
  _client: SupabaseClient,
  accessToken: string,
  authConfig: SupabaseAuthVerificationConfig
): Promise<User> {
  const cacheKey = getAuthUserCacheKey(accessToken, authConfig);
  const now = Date.now();
  const cached = authUserCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }
  const promise = fetchAuthUser(accessToken, authConfig).catch((error) => {
    authUserCache.delete(cacheKey);
    throw error;
  });
  authUserCache.set(cacheKey, {
    expiresAt: now + AUTH_USER_CACHE_TTL_MS,
    promise,
  });
  return promise;
}

export async function getTenantIdForAuthUser(
  client: SupabaseClient,
  accessToken: string,
  authConfig: SupabaseAuthVerificationConfig
): Promise<string | null> {
  const authUser = await resolveAuthUser(client, accessToken, authConfig);
  const row = await client
    .schema("core")
    .from("users")
    .select("tenant_id")
    .eq("id", authUser.id)
    .maybeSingle();
  if (row.error) {
    // A failed lookup is not "this user belongs to no tenant" — callers turn
    // that answer into 401 Unauthorized or 403 "not yet onboarded", both of
    // which describe the user's account rather than the outage that actually
    // happened.
    throw new AuthUnavailableError(
      `could not read core.users for ${authUser.id}: ${row.error.message}`
    );
  }
  if (!row.data) {
    return null;
  }
  return row.data.tenant_id as string;
}

/**
 * Resolves the caller's tenant for the role checks below. Kept separate so a
 * DB failure raises AuthUnavailableError instead of silently demoting the
 * caller to "not an admin" — a security decision computed from an error.
 */
async function tenantIdForRoleCheck(
  client: SupabaseClient,
  userId: string
): Promise<string | null> {
  const row = await client
    .schema("core")
    .from("users")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (row.error) {
    throw new AuthUnavailableError(
      `could not read core.users for ${userId}: ${row.error.message}`
    );
  }
  return row.data ? (row.data.tenant_id as string) : null;
}

export async function isAuthUserAdmin(
  client: SupabaseClient,
  accessToken: string,
  authConfig: SupabaseAuthVerificationConfig
): Promise<boolean> {
  const authUser = await resolveAuthUser(client, accessToken, authConfig);
  const tenantId = await tenantIdForRoleCheck(client, authUser.id);
  if (!tenantId) {
    return false;
  }
  const user = await getUserById(client, authUser.id, tenantId);
  return user?.role === "admin" || user?.is_super_admin === true;
}

export async function isAuthUserSuperAdmin(
  client: SupabaseClient,
  accessToken: string,
  authConfig: SupabaseAuthVerificationConfig
): Promise<boolean> {
  const authUser = await resolveAuthUser(client, accessToken, authConfig);
  const tenantId = await tenantIdForRoleCheck(client, authUser.id);
  if (!tenantId) {
    return false;
  }
  const user = await getUserById(client, authUser.id, tenantId);
  return (
    user?.is_super_admin === true ||
    authUser.app_metadata?.is_super_admin === true
  );
}
