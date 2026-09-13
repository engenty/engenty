/**
 * Browser-safe workspace / dev-mode helpers.
 * For `loadWorkspaceDotEnvIntoProcess` (Node `fileURLToPath`), import `@engenty/environment/env`.
 */

export { ENGENTY_DEV_SERVICE_URLS_FIXTURE } from "./dev-service-urls.fixture.js";
export {
  ENGENTY_DESKTOP_APP_ORIGIN,
  type EngentyDevServiceUrls,
  isEngentyCorsOriginAllowed,
  resolveEngentyDevServiceUrls,
} from "./dev-service-urls.js";
export {
  ENGENTY_DEVELOPER_MODE_STORAGE_KEY,
  getDeveloperModePreference,
  isEngentyDeveloperModeUiEnabled,
  setDeveloperModePreference,
  subscribeDeveloperModePreference,
} from "./developer-mode-preference.js";
export {
  engentyEnv,
  isEngentyDevelopmentEnvironment,
} from "./engenty-environment.js";
export {
  disablePluginsInManifest,
  ENGENTY_PLUGIN_MANIFEST,
  type EngentyPluginSpec,
  type EngentyPluginsManifest,
  enabledModuleSlugSet,
  enabledModuleSlugSetFromDir,
  enablePluginsInManifest,
  findEngentyRepoRootFrom,
  isEnabledModuleSlug,
  listEnabledModulesOnDiskFromDir,
  listWorkspaceModuleSlugsOnDisk,
  listWorkspaceModulesOnDisk,
  moduleHasUi,
  modulePackageName,
  type ResolvedEngentyModule,
  readEngentyPluginsManifest,
  readEngentyPluginsManifestFromCwd,
  readPluginManifest,
  resolveEnabledModules,
  resolveModuleDir,
  writeEngentyPluginsManifest,
  writeEngentyPluginsObject,
} from "./engenty-modules.js";
export {
  ENGENTY_HOST_MANDATORY_PLUGINS,
  getMandatoryPluginDeclaration,
  isMandatoryPlugin,
  type MandatoryPluginDeclaration,
} from "./mandatory-plugins.js";
export {
  MASTRA_STUDIO_CONFIG_STORAGE_KEY,
  type MastraStudioStoredConfig,
  seedMastraStudioDevConfig,
} from "./mastra-studio-dev-config.js";
export {
  ENGENTY_RUNTIME_ENV_GLOBAL,
  runtimeEnvOverride,
  setRuntimeEnvOverrides,
} from "./runtime-env.js";
