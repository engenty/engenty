import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

export interface AiDatabaseConfig {
  supabaseServiceRoleKey?: unknown;
  supabaseUrl?: unknown;
}

export function createAiDatabaseAdapter(
  config: AiDatabaseConfig = process.env
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
