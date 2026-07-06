/**
 * Browser-safe workspace / dev-mode helpers.
 * For `loadWorkspaceDotEnvIntoProcess` (Node `fileURLToPath`), import `@engenty/environment/env`.
 */

export { ENGENTY_DEV_SERVICE_URLS_FIXTURE } from "./dev-service-urls.fixture.js";
export {
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
  type EngentyModulesManifest,
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
  readEngentyModulesManifest,
  readEngentyModulesManifestFromCwd,
  readEngentyPluginsManifest,
  readEngentyPluginsManifestFromCwd,
  readPluginManifest,
  resolveEnabledModules,
  resolveModuleDir,
  writeEngentyModulesManifest,
  writeEngentyPluginsManifest,
  writeEngentyPluginsObject,
} from "./engenty-modules.js";
export {
  MASTRA_STUDIO_CONFIG_STORAGE_KEY,
  type MastraStudioStoredConfig,
  seedMastraStudioDevConfig,
} from "./mastra-studio-dev-config.js";
