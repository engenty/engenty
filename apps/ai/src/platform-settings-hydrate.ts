// Boot-time hydration of PLATFORM-scoped settings into process.env.
//
// Runs in `index.ts` BEFORE `app.js` is imported: importing it evaluates
// `../ai/index.js`, which constructs the Mastra instance — and its
// observability config reads the sink keys at that moment. Provider keys are
// read lazily and would have tolerated a later hydration; the tracing sinks
// do not.
//
// Platform scope only — a change made in the Setup UI takes effect on the
// next restart. SERVICE lane on purpose: platform settings have no tenant
// dimension, so there is no tenant to mint a handle for at boot.
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

/** Best-effort: a missing settings DB must not stop the process from booting. */
export async function hydrateAiPlatformSettings(
  logger: RuntimeLogger
): Promise<void> {
  try {
    const [{ createAiDatabaseAdapter }, { hydratePlatformSettingsIntoEnv }] =
      await Promise.all([
        import("./infra/database.js"),
        import("@engenty/platform-settings"),
      ]);
    const settingsDb = createAiDatabaseAdapter();
    if (!settingsDb) {
      return;
    }
    const hydrated = await hydratePlatformSettingsIntoEnv({
      supabase: settingsDb,
      keys: AI_PLATFORM_SETTING_KEYS,
      logger: (msg, err) => logger.warn(msg, { error: String(err) }),
    });
    if (hydrated.length > 0) {
      logger.info("hydrated platform settings from DB", { keys: hydrated });
    }
  } catch (err) {
    logger.warn("platform settings hydration failed (non-fatal)", {
      error: String(err),
    });
  }
}
