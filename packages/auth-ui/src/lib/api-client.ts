import { setApiClient } from "@engenty/api-client";
import { runtimeEnvOverride } from "@engenty/environment";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAuthClient } from "./supabase-auth-client";

export { getApiBaseUrl, getCurrentAccessToken } from "@engenty/api-client";

import { isDeadRefreshTokenError } from "./auth-session";

/**
 * The bearer for core, or null when there is no live session.
 *
 * `getSession()` refreshes an expiring token on the way, and a refresh
 * token Supabase has already used (a crash mid-rotation, two tabs racing)
 * fails there — returned as `error` or thrown, depending on the path. That
 * is a dead session, not a failed request: forget it locally so the shell
 * falls through to login instead of relaying "Invalid Refresh Token" on a
 * setup card the person cannot leave.
 */
export async function getAccessTokenFromClient(
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error && isDeadRefreshTokenError(error)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return null;
    }
    return data.session?.access_token ?? null;
  } catch (thrown) {
    if (
      thrown instanceof Error &&
      isDeadRefreshTokenError({ code: undefined, message: thrown.message })
    ) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return null;
    }
    throw thrown;
  }
}

function getApiBaseUrlFromEnv(): string {
  const env =
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
      .env ?? {};
  return runtimeEnvOverride("VITE_API_BASE_URL") ?? env.VITE_API_BASE_URL ?? "";
}

setApiClient({
  getApiBaseUrl: getApiBaseUrlFromEnv,
  getAccessToken: async () => getAccessTokenFromClient(getSupabaseAuthClient()),
});

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await getSupabaseAuthClient().auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
