/**
 * The role a module's agent gets the moment its principal exists.
 *
 * A module agent that cannot READ its own module is broken on arrival: every
 * call parks for approval, and someone has to hand-grant `<module>.viewer` per
 * tenant before the agent does anything useful. That grant is not a decision
 * anyone makes differently — "the contacts agent may read contacts" is what
 * installing the contacts agent MEANS — so it happens at provisioning instead.
 *
 * Deliberately narrow for module agents:
 * - READ only. Writing is a real decision and stays an explicit grant.
 * - The agent's OWN module only, derived from its key's prefix.
 * - Only when that role actually exists. `engenty.*` is the platform prefix
 *   (copilot, cli), not a module, so those agents get nothing here.
 *
 * Defaults land only on create. A revoked viewer stays revoked.
 */

export function defaultAgentRoleReapplies(_agentTypeKey: string): boolean {
  return false;
}

export function defaultAgentRoleId(
  agentTypeKey: string,
  roleExists: (roleId: string) => boolean
): string | null {
  const prefix = agentTypeKey.split(".")[0]?.trim();
  if (!prefix || prefix === agentTypeKey) {
    return null;
  }
  const candidate = `${prefix}.viewer`;
  return roleExists(candidate) ? candidate : null;
}

export function shouldAssignDefaultAgentRole(input: {
  agentTypeKey: string;
  assignedRoleIds: readonly string[];
  created: boolean;
  roleId: string | null;
}): boolean {
  if (!input.roleId) {
    return false;
  }
  if (input.assignedRoleIds.includes(input.roleId)) {
    return false;
  }
  if (input.created) {
    return true;
  }
  return defaultAgentRoleReapplies(input.agentTypeKey);
}
