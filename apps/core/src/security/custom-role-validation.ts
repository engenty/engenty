import { clampCapabilities } from "./user-capabilities.js";

/** custom.<slug> — slug is lowercase alphanumerics/hyphens. */
const ROLE_ID_RE = /^custom\.[a-z0-9-]+$/;
/** A concrete capability: dotted segments, never a wildcard. */
const CAPABILITY_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export interface CustomRoleValidationResult {
  /** Capabilities after clamping to the creator's grants. */
  capabilities: string[];
  errors: string[];
  ok: boolean;
}

/**
 * Guardrails for tenant-defined custom roles (Phase 7):
 * - role id must be `custom.<slug>` (can never shadow a code profile);
 * - NO wildcards — custom roles are explicit capability lists only;
 * - clamped to the creator's grants (you can only delegate what you hold);
 * - each capability must exist in the catalog (when one is supplied) to
 *   prevent typo-roles that silently grant nothing.
 */
export function validateCustomRole(input: {
  roleId: string;
  capabilities: string[];
  creatorCapabilities: string[];
  /** Known capability strings from the catalog; omit to skip that check. */
  catalog?: Set<string>;
}): CustomRoleValidationResult {
  const errors: string[] = [];

  if (!ROLE_ID_RE.test(input.roleId)) {
    errors.push(
      `role id must match custom.<slug> (lowercase, alphanumeric + hyphens): "${input.roleId}"`
    );
  }

  const requested = [...new Set(input.capabilities)];
  if (requested.length === 0) {
    errors.push("a custom role must grant at least one capability");
  }

  for (const cap of requested) {
    if (cap.endsWith(".*") || cap === "*" || cap === "core.superadmin") {
      errors.push(`wildcards are not allowed in custom roles: "${cap}"`);
      continue;
    }
    if (!CAPABILITY_RE.test(cap)) {
      errors.push(`invalid capability format: "${cap}"`);
      continue;
    }
    if (input.catalog && !input.catalog.has(cap)) {
      errors.push(`unknown capability (not in catalog): "${cap}"`);
    }
  }

  // Clamp to the creator's grants — you can only delegate what you hold. This is
  // moot for a tenant admin holding "*", but keeps the endpoint safe for a
  // future core.roles.manage delegation to a non-admin.
  const clamped = clampCapabilities(requested, input.creatorCapabilities);
  const dropped = requested.filter((c) => !clamped.includes(c));
  for (const cap of dropped) {
    errors.push(`you may not delegate a capability you do not hold: "${cap}"`);
  }

  return { ok: errors.length === 0, errors, capabilities: clamped };
}
