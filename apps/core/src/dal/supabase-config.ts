import { envString } from "@engenty/environment/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function resolveSupabaseConfig(config: Record<string, unknown>): {
  url: string;
  serviceRoleKey: string;
  /** Anon/publishable key for user JWT verification (getUser). Required when using createCoreUsersDal. */
  anonKey?: string;
} {
  const url = envString(config, "supabaseUrl", "SUPABASE_URL");
  const serviceRoleKey = envString(
    config,
    "supabaseServiceRoleKey",
    "SUPABASE_SERVICE_ROLE_KEY"
  );
  if (!(url && serviceRoleKey)) {
    throw new Error("Missing Supabase service configuration.");
  }
  const anonKey =
    envString(config, "supabaseAnonKey", "SUPABASE_ANON_KEY") ||
    envString(config, "supabasePublishableKey", "SUPABASE_PUBLISHABLE_KEY") ||
    envString(config, "viteSupabaseAnonKey", "VITE_SUPABASE_ANON_KEY") ||
    "";
  return {
    url,
    serviceRoleKey,
    ...(anonKey && { anonKey }),
  };
}

/** Service-role client for server-side DAL access (no session persistence). */
export function createServiceRoleClient(
  config: Record<string, unknown>
): SupabaseClient {
  const { url, serviceRoleKey } = resolveSupabaseConfig(config);
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
