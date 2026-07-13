/**
 * Effective enablement for a plugin in a tenant scope: an explicit tenant
 * override wins; otherwise the global default applies. Single source for the
 * badges shown in both the modules list and the tenant modules tab.
 */
export function resolveEffectiveEnabled({
  globalEnabled,
  tenantOverride,
}: {
  globalEnabled: boolean;
  tenantOverride: boolean | null;
}): boolean {
  return tenantOverride === null ? globalEnabled : tenantOverride;
}
