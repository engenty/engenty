/**
 * THE canonical user-role → capability mapping, reused by every surface
 * (Supabase session fallback, device-flow approval, API-token creation).
 * When granular roles/permissions arrive, change it here and all interfaces
 * (API, tools, CLI, MCP) follow.
 */

import { capabilityCovers } from "@engenty/plugin-sdk";
import { CORE_ROLE_PROFILES } from "./role-profiles.js";

export interface UserRoleInput {
  isSuperAdmin: boolean;
  tenantRole: "admin" | "member" | null;
}

function capabilitiesForRoleId(roleId: string): string[] {
  return CORE_ROLE_PROFILES.find((p) => p.id === roleId)?.capabilities ?? [];
}

/**
 * The base capability bundle for a user's role, WITHOUT DB role assignments.
 * Derived from the same {@link CORE_ROLE_PROFILES} that `resolveGrants` maps
 * base roles to, so the un-assigned result is identical on every surface
 * (Supabase-session fallback, device-flow approval, API-token clamp). Surfaces
 * that go through the grants service additionally layer on assignments.
 */
export function capabilitiesForUser(input: UserRoleInput): string[] {
  if (input.isSuperAdmin) {
    return capabilitiesForRoleId("core.superadmin");
  }
  if (input.tenantRole === "admin") {
    return capabilitiesForRoleId("tenant.admin");
  }
  if (input.tenantRole === "member") {
    return capabilitiesForRoleId("tenant.member");
  }
  return [];
}

// The clamp and server enforcement must use the exact same coverage rule —
// delegate to the shared matcher (see @engenty/plugin-sdk capabilityCovers).
const grantCovers = capabilityCovers;

/**
 * Clamp a requested capability list to what the granting user holds.
 * Empty request = "everything my role allows" → the full granted set.
 * The result is NEVER broader than `granted`: a requested wildcard only
 * passes through when the grant itself covers it.
 */
export function clampCapabilities(
  requested: string[],
  granted: string[]
): string[] {
  if (requested.length === 0) {
    return [...granted];
  }
  return requested.filter((capability) => grantCovers(granted, capability));
}
