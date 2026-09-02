/**
 * Central infra factories for backend adapters.
 * All Supabase client creation goes through here. See docs/dev/backend-abstraction.md.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

export {
  createTenantDbFactory,
  resolveTenantDbConfig,
  SERVER_LANE_ROLE,
  type TenantDbConfig,
  type TenantDbFactory,
} from "./tenant-db.js";

const SESSIONLESS_AUTH = {
  auth: { autoRefreshToken: false, persistSession: false },
} as const;

function readSupabaseUrl(config: Record<string, unknown>): string {
  return String(config.supabaseUrl ?? process.env.SUPABASE_URL ?? "").trim();
}

/**
 * Create Supabase client for server-side use (service role).
 * Returns null if config is missing (e.g. optional modules like offers).
 */
export function createDatabaseAdapter(
  config: Record<string, unknown>
): SupabaseClient | null {
  const url = readSupabaseUrl(config);
  const key = String(
    config.supabaseServiceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  ).trim();
  if (!(url && key)) {
    return null;
  }
  return createClient(url, key, SESSIONLESS_AUTH);
}

/**
 * Anon/publishable-key client for auth flows that must act as a user
 * (OTP verify, impersonation session mint). Not a tenant-locked DB client.
 */
export function createAnonAuthAdapter(
  config: Record<string, unknown>
): SupabaseClient | null {
  const url = readSupabaseUrl(config);
  const key = String(
    config.supabaseAnonKey ??
      process.env.SUPABASE_ANON_KEY ??
      config.supabasePublishableKey ??
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      config.viteSupabaseAnonKey ??
      process.env.VITE_SUPABASE_ANON_KEY ??
      ""
  ).trim();
  if (!(url && key)) {
    return null;
  }
  return createClient(url, key, SESSIONLESS_AUTH);
}
