import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DAL for core.agent_goal_grants (Phase 4). Goal-scoped approval grants: a
 * capability a human approved for an agent while it pursues a specific goal.
 * Read during policy evaluation (unioned with the agent's role grants); written
 * when an approval is decided with the "allow for this goal" scope; reaped when
 * the goal ends. Service-role client.
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
 * Capabilities granted for (goal, agent) that have not expired. Includes rows
 * with a null agent_id (granted to any agent on the goal).
 */
export async function listGoalGrantCapabilities(
  db: SupabaseClient,
  input: {
    tenantId: string;
    goalId: string;
    agentId?: string | null;
    now?: string;
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
          // A null agent_id grant applies to any agent on the goal; an
          // agent-specific grant applies ONLY to that agent. When no agentId is
          // supplied, drop every agent-specific row so agent a2's grant can
          // never leak to an unspecified/other caller.
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

export async function grantForGoal(
  db: SupabaseClient,
  input: {
    tenantId: string;
    goalId: string;
    agentId?: string | null;
    capability: string;
    grantedBy?: string | null;
    expiresAt?: string | null;
  }
): Promise<AgentGoalGrantRow> {
  const { data, error } = await db
    .schema("core")
    .from("agent_goal_grants")
    .upsert(
      {
        tenant_id: input.tenantId,
        goal_id: input.goalId,
        agent_id: input.agentId ?? null,
        capability: input.capability,
        granted_by: input.grantedBy ?? null,
        expires_at: input.expiresAt ?? null,
      },
      { onConflict: "tenant_id,goal_id,agent_id,capability" }
    )
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as AgentGoalGrantRow;
}

/** Reap all grants for a goal (call when the goal completes or fails). */
export async function revokeGoalGrants(
  db: SupabaseClient,
  tenantId: string,
  goalId: string
): Promise<void> {
  const { error } = await db
    .schema("core")
    .from("agent_goal_grants")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("goal_id", goalId);
  if (error) {
    throw error;
  }
}
