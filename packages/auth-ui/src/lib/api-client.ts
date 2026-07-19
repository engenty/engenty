import { setApiClient } from "@engenty/api-client";
import { runtimeEnvOverride } from "@engenty/environment";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAuthClient } from "./supabase-auth-client";

export { getApiBaseUrl, getCurrentAccessToken } from "@engenty/api-client";

export function getAccessTokenFromClient(
  supabase: SupabaseClient
): Promise<string | null> {
  return supabase.auth
    .getSession()
    .then((r) => r.data.session?.access_token ?? null);
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
