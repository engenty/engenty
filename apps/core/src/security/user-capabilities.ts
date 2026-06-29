/**
 * THE canonical user-role → capability mapping, reused by every surface
 * (Supabase session fallback, device-flow approval, API-token creation).
 * When granular roles/permissions arrive, change it here and all interfaces
 * (API, tools, CLI, MCP) follow.
 */

export interface UserRoleInput {
  isSuperAdmin: boolean;
  tenantRole: "admin" | "member" | null;
}

/** Mirrors the app's effective permissions (see auth-provider fallback). */
export function capabilitiesForUser(input: UserRoleInput): string[] {
  if (input.isSuperAdmin) {
    return ["core.superadmin", "*"];
  }
  if (input.tenantRole === "admin") {
    return ["*"];
  }
  return [
    "tenant-settings.read",
    "tenant-settings.write",
    "user-settings.read",
    "user-settings.write",
  ];
}

function grantCovers(granted: string[], requested: string): boolean {
  if (
    granted.includes("*") ||
    granted.includes("core.superadmin") ||
    granted.includes("core.*")
  ) {
    return true;
  }
  if (granted.includes(requested)) {
    return true;
  }
  const [prefix] = requested.split(".");
  return granted.includes(`${prefix}.*`);
}

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
