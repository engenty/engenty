/**
 * Whose personal accounts a call may use (PLAN-personal-connections.md).
 *
 * A personal account serves its owner and their Copilot, live. So a call
 * reaches its caller's personal accounts only when it is:
 *
 * - a **user** principal — agent and service principals run unattended;
 * - not an engenty **App** call (`callOrigin: "app"`) — an App rides the
 *   viewing user's token with nobody watching the turn;
 * - driven by nobody, or by the **Copilot** (`x-engenty-agent-id` names the
 *   core.agents row of `engenty.copilot`). A Space engenty in a live chat
 *   also forwards the user's token; its agent id is what keeps it out.
 *
 * Naming the Copilot's id as a user grants nothing new: the result is that
 * user's own accounts, which they may use directly anyway.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** core.agents `name` of the Copilot principal (its registry key). */
export const COPILOT_AGENT_NAME = "engenty.copilot";

export interface PersonalReachAuth {
  agentId?: string | null;
  callOrigin?: string | null;
  principalId: string;
  principalType?: "user" | "agent" | "service";
  tenantId: string;
}

/** The person whose own accounts this call reaches, or null. */
export async function resolvePersonalReach(
  client: SupabaseClient,
  auth: PersonalReachAuth
): Promise<string | null> {
  if ((auth.principalType ?? "user") !== "user" || auth.callOrigin === "app") {
    return null;
  }
  const agentId = auth.agentId?.trim();
  if (!agentId) {
    return auth.principalId;
  }
  const agent = await client
    .schema("core")
    .from("agents")
    .select("name")
    .eq("tenant_id", auth.tenantId)
    .eq("id", agentId)
    .maybeSingle();
  if (agent.error || !agent.data) {
    return null;
  }
  return (agent.data as { name: string }).name === COPILOT_AGENT_NAME
    ? auth.principalId
    : null;
}
