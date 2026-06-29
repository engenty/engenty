/**
 * Feature flag definition for plugin/module registration.
 * Keys use dot-notation: namespace.subkey (e.g. contacts.organisation_accounts).
 */
export interface FeatureFlagDefinition {
  /** Default value when no override exists */
  default: boolean;
  /** i18n key for description (optional) */
  descriptionKey?: string;
  /** Unique key in dot-notation, e.g. contacts.entities */
  key: string;
  /** i18n key for label (optional) */
  labelKey?: string;
  /** Logical grouping for UI (e.g. contacts, modules, offers) */
  namespace: string;
  /** Owning plugin/module id */
  pluginId: string;
}

/**
 * Resolved flag value for a tenant.
 * Global defaults + tenant overrides merged.
 */
export type ResolvedFlags = Record<string, boolean>;

/**
 * Override record (global or tenant-scoped).
 */
export interface FlagOverride {
  enabled: boolean;
  key: string;
  tenant_id: string | null;
}

/**
 * Definition with optional validation constraints (v1: none, reserved for future).
 */
export type FeatureFlagCatalogEntry = FeatureFlagDefinition;
