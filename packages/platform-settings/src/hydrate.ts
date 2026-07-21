// Boot-time hydration of PLATFORM-scoped settings into process.env.
//
// Some consumers read provider keys synchronously at module/provider
// construction (e.g. the AI gateway key, ingest API keys). Rather than rewrite
// those hot paths to be async + tenant-aware, we resolve their platform-scoped
// DB value once at app startup and, when set, write it into process.env so the
// existing synchronous env readers transparently pick up the override.
//
// Scope: PLATFORM only (no tenant) — these keys are installation-wide. A change
// made in the Setup UI takes effect on the next restart. Tenant-scoped keys
// (e.g. connector OAuth clients, bot tokens) must be resolved per-request
// instead, where the tenant context is available.

import {
  createPlatformSettingsRepoSupabase,
  type SettingsLogger,
} from "./dal.js";

export async function hydratePlatformSettingsIntoEnv(params: {
  supabase: unknown;
  /** Platform-scoped env keys to hydrate (must be `configurable: "platform"`). */
  keys: readonly string[];
  logger?: SettingsLogger;
  env?: Record<string, string | undefined>;
}): Promise<string[]> {
  const env = params.env ?? process.env;
  const repo = createPlatformSettingsRepoSupabase(params.supabase, {
    logger: params.logger,
  });
  const hydrated: string[] = [];
  await Promise.all(
    params.keys.map(async (key) => {
      let entry: Awaited<ReturnType<typeof repo.getPlatform>> = null;
      try {
        entry = await repo.getPlatform(key);
      } catch (error) {
        params.logger?.(`platform-settings: hydrate failed for ${key}`, error);
        return;
      }
      const value = entry?.value;
      if (typeof value === "string" && value.length > 0) {
        env[key] = value;
        hydrated.push(key);
      }
    })
  );
  return hydrated;
}
