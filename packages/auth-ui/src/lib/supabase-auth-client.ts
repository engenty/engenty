import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function readSupabaseAuthEnv(): {
  anonKey: string | undefined;
  url: string | undefined;
} {
  const env =
    (
      import.meta as ImportMeta & {
        env?: Record<string, string | undefined>;
      }
    ).env ?? {};
  return {
    anonKey: env.VITE_SUPABASE_ANON_KEY,
    url: env.VITE_SUPABASE_URL,
  };
}

function createSupabaseAuthClient(): SupabaseClient {
  if (client) {
    return client;
  }
  const { anonKey, url } = readSupabaseAuthEnv();
  if (!(url && anonKey)) {
    throw new Error(
      "Missing Supabase environment: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required."
    );
  }
  client = createClient(url, anonKey);
  return client;
}

export function getOptionalSupabaseAuthClient(): SupabaseClient | null {
  const { anonKey, url } = readSupabaseAuthEnv();
  if (!(url && anonKey)) {
    return null;
  }
  try {
    return createSupabaseAuthClient();
  } catch {
    return null;
  }
}

export function getSupabaseAuthClient(): SupabaseClient {
  return createSupabaseAuthClient();
}
