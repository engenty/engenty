// Boot-time hydration of PLATFORM-scoped settings into process.env.
//
// Runs in `index.ts` BEFORE `app.js` is imported: importing it evaluates
// `../ai/index.js`, which constructs the Mastra instance — and its
// observability config reads the sink keys at that moment. Provider keys are
// read lazily and would have tolerated a later hydration; the tracing sinks
// do not.
//
// Platform scope only. SERVICE lane on purpose: platform settings have no
// tenant dimension, so there is no tenant to mint a handle for at boot. A
// write through core's settings API reaches this process through
// `POST /ai/internal/settings/reload` (settings-reload-routes.ts).
//
// The key list is hand-kept: apps/ai has no access to the env manifest core
// builds from the module contributions.
import type { RuntimeLogger } from "@engenty/telemetry";
import { OBSERVABILITY_SETTING_KEYS } from "../ai/observability.js";

export const AI_PLATFORM_SETTING_KEYS: readonly string[] = [
  "AI_GATEWAY_API_KEY",
  "ELEVENLABS_API_KEY",
  // The remote-channel master switch is platform-configurable, so the Setup UI
  // offers it — without hydration that toggle would silently do nothing here,
  // since isRemoteChannelsEnabled() reads process.env.
  "ENGENTY_REMOTE_CHANNELS_ENABLED",
  "MISTRAL_API_KEY",
  "OPENAI_API_KEY",
  // Second model gateway. Hydrated alongside the Vercel key rather than
  // instead of it: a role bound to OpenRouter and a role bound to Vercel run
  // in the same process.
  "OPENROUTER_API_KEY",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "TELEGRAM_BOT_TOKEN",
  ...OBSERVABILITY_SETTING_KEYS,
];

export interface AiPlatformSettingsHydration {
  cleared: string[];
  hydrated: string[];
}

/**
 * Best-effort at boot: a missing settings DB must not stop the process.
 *
 * `reload` is the settings API's path (`POST /ai/internal/settings/reload`):
 * every key that is read at call time is re-read, and a key whose row is gone
 * goes back to what the environment held at boot. The observability sinks
 * are left out — Mastra read them at construction, so a reload cannot move
 * them; the route names them as boot-only.
 */
export async function hydrateAiPlatformSettings(
  logger: RuntimeLogger,
  options: { reload?: boolean } = {}
): Promise<AiPlatformSettingsHydration> {
  const empty: AiPlatformSettingsHydration = { cleared: [], hydrated: [] };
  try {
    const [{ createAiDatabaseAdapter }, { hydratePlatformSettingsIntoEnv }] =
      await Promise.all([
        import("./infra/database.js"),
        import("@engenty/platform-settings"),
      ]);
    const settingsDb = createAiDatabaseAdapter();
    if (!settingsDb) {
      return empty;
    }
    const keys = options.reload
      ? AI_PLATFORM_SETTING_KEYS.filter(
          (key) =>
            !(OBSERVABILITY_SETTING_KEYS as readonly string[]).includes(key)
        )
      : AI_PLATFORM_SETTING_KEYS;
    const result = await hydratePlatformSettingsIntoEnv({
      clearMissing: options.reload === true,
      keys,
      logger: (msg, err) => logger.warn(msg, { error: String(err) }),
      supabase: settingsDb,
    });
    if (result.hydrated.length > 0 || result.cleared.length > 0) {
      logger.info(
        options.reload
          ? "reloaded platform settings from DB"
          : "hydrated platform settings from DB",
        { cleared: result.cleared, keys: result.hydrated }
      );
    }
    return result;
  } catch (err) {
    logger.warn("platform settings hydration failed (non-fatal)", {
      error: String(err),
    });
    return empty;
  }
}

/** Keys a reload cannot move: Mastra read them when it was constructed. */
export function bootOnlyAiSettingKeys(): readonly string[] {
  return OBSERVABILITY_SETTING_KEYS;
}
