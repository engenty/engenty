export {
  dedupeDefinitions,
  groupByNamespace,
  isValidKey,
  normalizeKey,
} from "./catalog.js";
export { getByPath, isEnabled, mergeResolved } from "./merge.js";
export type {
  FeatureFlagCatalogEntry,
  FeatureFlagDefinition,
  FlagOverride,
  ResolvedFlags,
} from "./types.js";
