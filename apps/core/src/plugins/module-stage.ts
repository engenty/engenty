import {
  DEFAULT_MODULE_STAGE,
  isPluginStage,
  PLUGIN_STAGES,
  type PluginStage,
} from "@engenty/plugin-sdk";

/**
 * This install's module stage, from `ENGENTY_MODULE_STAGE`. Unset means
 * `beta`. Decides which modules load at all and which are off per tenant
 * (see isModuleStageInstalled / moduleTenantDefault). A typo fails the
 * plugin load instead of quietly hiding or showing modules.
 */
export function installModuleStage(
  env: NodeJS.ProcessEnv = process.env
): PluginStage {
  const raw = env.ENGENTY_MODULE_STAGE?.trim();
  if (!raw) {
    return DEFAULT_MODULE_STAGE;
  }
  if (!isPluginStage(raw)) {
    throw new Error(
      `ENGENTY_MODULE_STAGE must be one of: ${PLUGIN_STAGES.join(", ")} (got "${raw}")`
    );
  }
  return raw;
}
