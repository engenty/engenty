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
  const response = await fetch(new URL("/auth/v1/user", authConfig.url), {
    headers: {
      apikey: authConfig.anonKey,
      authorization: `Bearer ${accessToken}`,
    },
    method: "GET",
    signal: AbortSignal.timeout(AUTH_USER_FETCH_TIMEOUT_MS),
  });
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
  if (row.error || !row.data) {
    return null;
  }
  return row.data.tenant_id as string;
}

export async function isAuthUserAdmin(
  client: SupabaseClient,
  accessToken: string,
  authConfig: SupabaseAuthVerificationConfig
): Promise<boolean> {
  const authUser = await resolveAuthUser(client, accessToken, authConfig);
  const row = await client
    .schema("core")
    .from("users")
    .select("tenant_id")
    .eq("id", authUser.id)
    .maybeSingle();
  const tenantId =
    row.error || !row.data ? null : (row.data.tenant_id as string);
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
  const row = await client
    .schema("core")
    .from("users")
    .select("tenant_id")
    .eq("id", authUser.id)
    .maybeSingle();
  const tenantId =
    row.error || !row.data ? null : (row.data.tenant_id as string);
  if (!tenantId) {
    return false;
  }
  const user = await getUserById(client, authUser.id, tenantId);
  return (
    user?.is_super_admin === true ||
    authUser.app_metadata?.is_super_admin === true
  );
}
