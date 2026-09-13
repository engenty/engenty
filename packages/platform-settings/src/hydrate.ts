// Hydration of PLATFORM-scoped settings into process.env.
//
// Some consumers read provider keys synchronously at module/provider
// construction (e.g. the AI gateway key, ingest API keys), or at call time
// straight from process.env. Rather than rewrite those hot paths to be async +
// tenant-aware, we resolve their platform-scoped DB value and, when set, write
// it into process.env so the existing synchronous env readers transparently
// pick up the override.
//
// Runs once at boot and again whenever a platform setting is written through
// the settings API: core applies the write to its own process.env and asks
// apps/ai to re-hydrate (`POST /ai/internal/settings/reload`), so a key saved
// in the browser is live for the next request. The one exception is the
// observability sinks, which Mastra reads at construction — those stay
// boot-only and say so in the reload response.
//
// Scope: PLATFORM only (no tenant) — these keys are installation-wide.
// Tenant-scoped keys (e.g. connector OAuth clients, bot tokens) must be
// resolved per-request instead, where the tenant context is available.

import {
  createPlatformSettingsRepoSupabase,
  type SettingsLogger,
} from "./dal.js";

type Env = Record<string, string | undefined>;

/**
 * What each env object held for a key BEFORE the first hydrated value replaced
 * it — the `.env` file's value, or nothing. Clearing a setting restores that,
 * so deleting a row in the Setup UI hands the key back to the environment
 * instead of leaving the last database value behind in the process.
 */
const bootValues = new WeakMap<Env, Map<string, string | undefined>>();

function rememberBootValue(env: Env, key: string): void {
  let byKey = bootValues.get(env);
  if (!byKey) {
    byKey = new Map();
    bootValues.set(env, byKey);
  }
  if (!byKey.has(key)) {
    byKey.set(key, env[key]);
  }
}

/**
 * Put one platform setting into the environment, or take it back out.
 *
 * `value` null/empty restores what the environment held at boot. Returns true
 * when the env actually changed.
 */
export function applyPlatformSettingToEnv(params: {
  env?: Env;
  key: string;
  value: string | null | undefined;
}): boolean {
  const env = params.env ?? process.env;
  rememberBootValue(env, params.key);
  const next =
    typeof params.value === "string" && params.value.length > 0
      ? params.value
      : bootValues.get(env)?.get(params.key);
  if (env[params.key] === next) {
    return false;
  }
  if (next === undefined) {
    delete env[params.key];
  } else {
    env[params.key] = next;
  }
  return true;
}

export interface HydratePlatformSettingsResult {
  /** Keys with no stored value that were restored to their boot value. */
  cleared: string[];
  /** Keys whose stored value is now in the environment. */
  hydrated: string[];
}

export async function hydratePlatformSettingsIntoEnv(params: {
  supabase: unknown;
  /** Platform-scoped env keys to hydrate (must be `configurable: "platform"`). */
  keys: readonly string[];
  logger?: SettingsLogger;
  env?: Env;
  /**
   * Restore the boot value for keys that have no stored row. Off at boot
   * (nothing to clear yet); on for a reload, where a deleted row must leave
   * the process too.
   */
  clearMissing?: boolean;
}): Promise<HydratePlatformSettingsResult> {
  const env = params.env ?? process.env;
  const repo = createPlatformSettingsRepoSupabase(params.supabase, {
    logger: params.logger,
  });
  const hydrated: string[] = [];
  const cleared: string[] = [];
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
      // Booleans and numbers hydrate too: process.env holds strings, and the
      // readers (`envIsTruthy`, `Number(...)`) parse them back. Without this a
      // boolean toggle saved in the Setup UI never reached the process — the
      // row was there, the env stayed unset.
      const text =
        typeof value === "boolean" || typeof value === "number"
          ? String(value)
          : value;
      if (typeof text === "string" && text.length > 0) {
        applyPlatformSettingToEnv({ env, key, value: text });
        hydrated.push(key);
      } else if (
        params.clearMissing &&
        applyPlatformSettingToEnv({ env, key, value: null })
      ) {
        cleared.push(key);
      }
    })
  );
  return { hydrated, cleared };
}
