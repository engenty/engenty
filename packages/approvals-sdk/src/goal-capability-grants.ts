import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DAL for `core.agent_goal_grants` — goal-scoped CAPABILITY elevation.
 *
 * Why this is not folded into core.approval_grants
 * ------------------------------------------------
 * It looks like the same thing and isn't. `approval_grants` records that a
 * specific OPERATION was approved for a subject, and `consumeApprovalGrant`
 * matches `operation_id` EXACTLY. This table records that a CAPABILITY was
 * elevated for the duration of a goal, and its reader matches through
 * `capabilityCovers` — hierarchical, wildcard-aware (`module.*` covers
 * `module.secrets.read`). Storing capability strings in `operation_id` would
 * put wildcard-matched values in an exact-match column, and any later attempt
 * to match them loosely would re-open the capability sub-tree escalation
 * trap. Two mechanisms, deliberately two tables — see the audit's TRK-03.
 *
 * What DID need fixing: there were two independent implementations of the read
 * (apps/core's DAL and an inline copy in modules/secrets, because modules
 * cannot import apps/core), a writer with no callers, and a documented
 * goal-end reap that nothing ever called — so grants outlived their goals and
 * were bounded only by `expires_at`. This module is the single implementation
 * both sides import; the reap is wired to goal completion.
 *
 * Service-role client — a user must never insert their own grant.
 */

export interface AgentGoalGrantRow {
  agent_id: string | null;
  capability: string;
  created_at: string;
  expires_at: string | null;
  goal_id: string;
  granted_by: string | null;
  id: string;
  tenant_id: string;
}

/**
 * Capabilities elevated for (goal, agent) that have not expired.
 *
 * A row with `agent_id = null` applies to any agent on the goal; an
 * agent-specific row applies ONLY to that agent. When no agentId is supplied
 * every agent-specific row is dropped, so one agent's grant can never leak to
 * an unspecified or different caller.
 */
export async function listGoalGrantCapabilities(
  db: SupabaseClient,
  input: {
    agentId?: string | null;
    goalId: string;
    now?: string;
    tenantId: string;
  }
): Promise<string[]> {
  const { data, error } = await db
    .schema("core")
    .from("agent_goal_grants")
    .select("capability, agent_id, expires_at")
    .eq("tenant_id", input.tenantId)
    .eq("goal_id", input.goalId);
  if (error) {
    throw error;
  }
  const nowMs = input.now ? Date.parse(input.now) : Date.now();
  const agentId = input.agentId ?? null;
  return [
    ...new Set(
      (data ?? [])
        .filter((r) => {
          const row = r as {
            agent_id: string | null;
            capability: string;
            expires_at: string | null;
          };
          if (row.agent_id !== null && row.agent_id !== agentId) {
            return false;
          }
          if (row.expires_at && Date.parse(row.expires_at) <= nowMs) {
            return false;
          }
          return true;
        })
        .map((r) => (r as { capability: string }).capability)
    ),
  ];
}

/**
 * Elevate a capability for (goal, agent). Upsert rather than insert: once
 * grants lapse, a second approval has to RENEW the existing row — skipping the
 * write would leave an expired grant in place and re-ask the human forever.
 */
export async function grantCapabilityForGoal(
  db: SupabaseClient,
  input: {
    agentId?: string | null;
    capability: string;
    expiresAt?: string | null;
    goalId: string;
    grantedBy?: string | null;
    tenantId: string;
  }
): Promise<void> {
  const { error } = await db
    .schema("core")
    .from("agent_goal_grants")
    .upsert(
      {
        agent_id: input.agentId ?? null,
        capability: input.capability,
        expires_at: input.expiresAt ?? null,
        goal_id: input.goalId,
        granted_by: input.grantedBy ?? null,
        tenant_id: input.tenantId,
      },
      {
        ignoreDuplicates: false,
        onConflict: "tenant_id, goal_id, agent_id, capability",
      }
    );
  if (error) {
    throw error;
  }
}

/**
 * Reap every capability elevation for a goal. Call when the goal reaches a
 * terminal state: elevation is scoped to the pursuit of that goal, so it must
 * not survive it. Until 2026-08-04 nothing called this, and grants lingered
 * until `expires_at` (or forever, for rows written without one).
 */
export async function revokeGoalGrants(
  db: SupabaseClient,
  input: { goalId: string; tenantId: string }
): Promise<void> {
  const { error } = await db
    .schema("core")
    .from("agent_goal_grants")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("goal_id", input.goalId);
  if (error) {
    throw error;
  }
}
