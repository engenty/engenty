import type { FeatureFlagDefinition, ResolvedFlags } from "./types.js";

/**
 * Merges definition defaults + global overrides + commercial-package values +
 * tenant overrides.
 *
 * Precedence: tenant override > package value > global override > definition
 * default. The package layer is optional (defaults to none) so existing 3-arg
 * callers keep the original tenant > global > default behavior.
 */
export function mergeResolved(
  definitions: FeatureFlagDefinition[],
  globalOverrides: Record<string, boolean>,
  tenantOverrides: Record<string, boolean>,
  packageOverrides: Record<string, boolean> = {}
): ResolvedFlags {
  const result: ResolvedFlags = {};

  for (const def of definitions) {
    const key = def.key;
    if (tenantOverrides[key] !== undefined) {
      result[key] = tenantOverrides[key];
    } else if (packageOverrides[key] !== undefined) {
      result[key] = packageOverrides[key];
    } else if (globalOverrides[key] === undefined) {
      result[key] = def.default;
    } else {
      result[key] = globalOverrides[key];
    }
  }

  return result;
}

/**
 * Resolves a single flag from a resolved map.
 */
export function isEnabled(resolved: ResolvedFlags, key: string): boolean {
  return resolved[key] === true;
}

/**
 * Gets nested lookup path (e.g. "contacts.organisation_accounts" -> contacts.organisation_accounts).
 * For flat keys, returns the value directly.
 */
export function getByPath(
  resolved: ResolvedFlags,
  path: string
): boolean | undefined {
  const value = resolved[path];
  return typeof value === "boolean" ? value : undefined;
}
