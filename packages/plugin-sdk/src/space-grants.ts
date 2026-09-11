/**
 * Mount → capability derivation (PLAN-spaces.md Phase 3, "mount = grant").
 *
 * The point of the keystone: a space's mount row is the AUTHORING surface for
 * what its engentys may reach, and this function turns it into capability ids.
 * Authorization itself stays entirely in the capability system — nothing here
 * decides anything, it only says which grants a mount implies. That separation
 * is what keeps §1c's "never infer authorization from membership" true: being
 * in a space grants nothing; a mount row does, and only through capabilities.
 *
 * Lives in plugin-sdk so core (which writes the grants) and apps/ai (which
 * narrows a run from them) derive the SAME ids from the same rule.
 */

/** What a space's engentys may do with a mounted module's data. */
export type SpaceAgentAccessLevel = "none" | "read" | "write";

/**
 * Sibling namespaces a module owns that are not the module id itself.
 *
 * The matcher does not infer facets from the module id — this table is the
 * named mapping, shared by space mounts and role packs so they cannot drift.
 * Empty after Tasks Goals were removed (`module.goals.*` is gone).
 */
export const MODULE_FACETS: Readonly<Record<string, readonly string[]>> = {};

/** Capability ids for a module pack at a given access level (facets included). */
export function capabilitiesForModuleAccess(
  moduleId: string,
  access: Exclude<SpaceAgentAccessLevel, "none">
): string[] {
  const id = moduleId.trim();
  if (!id) {
    return [];
  }
  const granted = new Set<string>();
  const namespaces = [id, ...(MODULE_FACETS[id] ?? [])];
  for (const namespace of namespaces) {
    granted.add(`module.${namespace}.read`);
    if (access === "write") {
      granted.add(`module.${namespace}.write`);
    }
  }
  return [...granted].sort();
}

export interface SpaceModuleGrantInput {
  agentAccess: SpaceAgentAccessLevel;
  moduleId: string;
}

export interface SpaceGrantInput {
  /**
   * CONNECTOR ids the space's mounted accounts belong to — not the account ids
   * themselves (PLAN-spaces.md Phase CN.3).
   *
   * Mounts name accounts since CN.3, but the capability selector CON-02 scopes
   * roles with is connector-shaped, so the caller resolves accounts to their
   * connectors before calling. Naming the field `connectors` is the guard: the
   * previous name took connection ids and would silently keep accepting them,
   * emitting capability ids that nothing in the matcher ever matches.
   */
  connectors?: readonly string[];
  modules: readonly SpaceModuleGrantInput[];
}

/**
 * Capability ids implied by a space's mounts.
 *
 * - `none` yields NOTHING. Mounting a module so it appears in the Apps tab must
 *   not, on its own, hand the space's engentys its data — that is the whole
 *   reason `agent_access` is a separate column from the mount's existence.
 * - `write` implies `read`: there is no useful write-without-read agent, and
 *   leaving it out would make every caller remember to ask for both.
 * - Connectors use the connector scope shape (`module.connections.write.<id>`),
 *   which is deliberately never a wildcard — a space that mounts one connector
 *   must not thereby reach the rest. This axis stops at the CONNECTOR: which
 *   ACCOUNT of it a space may use is the mount itself, enforced against the
 *   resolved connection where the call happens (CN.3), not expressible here.
 *
 * Returns a sorted, de-duplicated list so two callers comparing grant sets do
 * not diff on ordering.
 */
export function deriveSpaceAgentCapabilities(input: SpaceGrantInput): string[] {
  const granted = new Set<string>();
  for (const mount of input.modules) {
    if (mount.agentAccess === "none") {
      continue;
    }
    for (const cap of capabilitiesForModuleAccess(
      mount.moduleId,
      mount.agentAccess
    )) {
      granted.add(cap);
    }
  }
  for (const connectorId of input.connectors ?? []) {
    const id = connectorId.trim();
    if (!id) {
      continue;
    }
    granted.add(`module.connections.read.${id}`);
    granted.add(`module.connections.write.${id}`);
  }
  return [...granted].sort();
}

/**
 * Plan-module caps a locked-down AI service credential must list explicitly.
 * `module.read` / `module.write` do not cover `module.tasks.*` — the matcher
 * has no infix wildcards.
 */
export const AI_SERVICE_PLAN_CAPABILITIES = capabilitiesForModuleAccess(
  "tasks",
  "write"
);
