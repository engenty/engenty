import type { RoleProfile } from "@engenty/plugin-sdk";

/**
 * Core built-in role profiles — the single source of truth for base
 * role→capability bundles. `resolveGrants` maps a subject's base role to these,
 * and `capabilitiesForUser` (the no-assignments static path used by device-flow
 * / API-token clamps) derives from the same table, so every surface agrees on
 * what an un-assigned user of a given role can do.
 */
export const CORE_ROLE_PROFILES: RoleProfile[] = [
  {
    id: "core.superadmin",
    title: "Superadmin",
    system: true,
    capabilities: ["core.superadmin", "*"],
  },
  {
    // `core.credentials.manage` is redundant against `*` for the matcher, and
    // listed anyway: minting a never-expiring service credential or a 30-day
    // API token is the one power worth naming rather than leaving implied by
    // a wildcard. Members must never acquire it — that is the AUTH-02 gate.
    id: "tenant.admin",
    title: "Tenant admin",
    system: true,
    capabilities: ["core.credentials.manage", "*"],
  },
  {
    // Members are capable staff: full access to all business modules
    // (module.* covers module.<id>.read/write for every module), plus their
    // own + tenant settings. Deliberately NOT core/tenant administration —
    // module.* does not cover core.* / core.users.manage / "*", so managing
    // users, roles, and tenant config stays admin-only. Guardrails at the
    // action level (per-op approval/risk, ownership policies) constrain
    // specifics; the capability floor is intentionally broad.
    id: "tenant.member",
    title: "Member",
    system: true,
    capabilities: [
      "module.*",
      "tenant-settings.read",
      "tenant-settings.write",
      "user-settings.read",
      "user-settings.write",
      "notifications.read",
      "notifications.write",
    ],
  },
  {
    // Default agent bundle: capable read+write (matches today's
    // defaultCapabilities("agent")). Agents are CAPABLE by default, but their
    // actions are gated to approval — the escalation gate parks risky/approval
    // ops for non-user principals, and goal-scoped pre-approvals + the
    // task/comment surface let a human interact with long-running agents. This
    // is the base an unassigned agent resolves to.
    id: "agent.assistant",
    title: "Agent (assistant)",
    system: true,
    capabilities: ["module.read", "module.write"],
  },
  {
    // Read-only floor for agents that should be locked down — assign explicitly.
    id: "agent.base",
    title: "Agent (read-only)",
    system: true,
    capabilities: ["module.read"],
  },
];

/** Register the core built-ins into a plugin-sdk RoleProfileRegistry. */
export function registerCoreRoleProfiles(registry: {
  register: (pluginId: string, profile: RoleProfile) => void;
}): void {
  for (const profile of CORE_ROLE_PROFILES) {
    registry.register("core", profile);
  }
}
