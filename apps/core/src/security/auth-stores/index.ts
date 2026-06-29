import { createMemoryAuthStores } from "./memory.js";
import {
  createSupabaseAuthStores,
  createSupabaseClientFromConfig,
} from "./supabase.js";
import type { AuthStores } from "./types.js";

export { createMemoryAuthStores } from "./memory.js";
export type {
  AuthStores,
  DeviceAuthorizationRecord,
  DeviceAuthorizationStatus,
  DeviceGrantScopes,
  SessionRecord,
} from "./types.js";

/** Supabase-backed when configured (production truth), memory otherwise. */
export function createAuthStores(config: Record<string, unknown>): AuthStores {
  const client = createSupabaseClientFromConfig(config);
  if (client) {
    return createSupabaseAuthStores(client);
  }
  return createMemoryAuthStores();
}
