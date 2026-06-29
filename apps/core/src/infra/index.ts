/**
 * Central infra factories for backend adapters.
 * All Supabase client creation goes through here. See docs/dev/backend-abstraction.md.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

/**
 * Create Supabase client for server-side use (service role).
 * Returns null if config is missing (e.g. optional modules like offers).
 */
export function createDatabaseAdapter(
  config: Record<string, unknown>
): SupabaseClient | null {
  const url = String(
    config.supabaseUrl ?? process.env.SUPABASE_URL ?? ""
  ).trim();
  const key = String(
    config.supabaseServiceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  ).trim();
  if (!(url && key)) {
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
