import {
  capabilityCovers,
  type PluginProfilePolicy,
} from "@engenty/plugin-sdk";

/**
 * Phase 4 — agent escalation-to-approval policy.
 *
 * When an agent drives an operation (agent id in context), the operation is
 * allowed only if the required capabilities are covered by the agent's own role
 * grants UNIONED with any goal-scoped approval grants for the goal the run is
 * executing. Anything in the gap escalates to `require_approval` — in chat the
 * present human approves in-context; in autonomous runs the approval is async.
 *
 * The agent's role grants are the durable, admin-managed baseline. Goal grants
 * are the ephemeral, human-approved elevation bound to the goal (never written
 * back onto the agent). Approving with the "allow for this goal" scope inserts a
 * goal grant so the rest of the goal proceeds without re-prompting.
 *
 * When the call names a space (`auth.spaceId`), the space's derived mount caps
 * join that union — mounting Projects write is how the planner later gets
 * `module.projects.*` without stuffing every module into one role pack.
 * The token remains the ceiling (checked upstream). Space caps only widen the
 * agent's attempt set under that ceiling.
 *
 * In chat the acting user's own grants remain the hard ceiling — enforced
 * upstream by the forwarded user token's capability check (an op the user can't
 * do is denied before this policy runs). This policy only governs the band
 * between the agent's grants and that ceiling.
 */
export function createAgentEscalationPolicy(deps: {
  /** Capabilities from the agent's role assignments (resolveGrants). */
  resolveAgentCapabilities: (
    agentId: string,
    tenantId: string
  ) => Promise<string[]>;
  /** Capabilities approved for this (goal, agent). */
  listGoalGrantCapabilities: (
    tenantId: string,
    goalId: string,
    agentId: string
  ) => Promise<string[]>;
  /** Capability ids implied by the space's mounts. Empty when no space. */
  resolveSpaceCapabilities?: (
    tenantId: string,
    spaceId: string
  ) => Promise<string[]>;
}): PluginProfilePolicy {
  return async (input) => {
    const agentId = input.auth.agentId;
    if (!agentId) {
      return null; // not an agent-driven operation
    }
    const required = input.requiredCapabilities ?? [];
    if (required.length === 0) {
      // No declared capability to check against — abstain (the core capability
      // + inference step already ran on the forwarded token).
      return null;
    }

    const agentCaps = await deps.resolveAgentCapabilities(
      agentId,
      input.auth.tenantId
    );
    const goalCaps = input.auth.goalId
      ? await deps.listGoalGrantCapabilities(
          input.auth.tenantId,
          input.auth.goalId,
          agentId
        )
      : [];
    const spaceCaps =
      input.auth.spaceId && deps.resolveSpaceCapabilities
        ? await deps.resolveSpaceCapabilities(
            input.auth.tenantId,
            input.auth.spaceId
          )
        : [];
    const effective = [...agentCaps, ...goalCaps, ...spaceCaps];

    const covered = required.every((cap) => capabilityCovers(effective, cap));
    if (covered) {
      return null; // within agent grants (± goal grants) → allow
    }
    return {
      action: "require_approval",
      reason: `${input.operationId}: needs your approval (agent acting${
        input.auth.actingForUserId ? " for you" : ""
      })`,
    };
  };
}
