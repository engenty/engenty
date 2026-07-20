import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the core.agents principal uuid for an AI-plane agent key
 * (e.g. "engenty.copilot"). Grants and audit key on that uuid; the AI plane
 * only knows text agent keys.
 *
 * Registry agents carry the mapping on ai.engenty_ai_agents.core_agent_id.
 * Builtin agents have no registry row, so their principal is found-or-created
 * by (tenant_id, name) — race-safe via the agents_tenant_name_key unique
 * index. Idempotent; the registry mapping column is written back when a
 * registry row exists without one.
 */

interface CoreAgentRow {
  id: string;
}

const cache = new Map<string, string>();

function cacheKey(tenantId: string, agentKey: string): string {
  return `${tenantId}:${agentKey}`;
}

export async function ensureCoreAgentId(
  client: SupabaseClient,
  tenantId: string,
  agentKey: string
): Promise<string> {
  const cached = cache.get(cacheKey(tenantId, agentKey));
  if (cached) {
    return cached;
  }

  const ai = client.schema("ai");
  const core = client.schema("core");

  const { data: registryRow, error: registryError } = await ai
    .from("engenty_ai_agents")
    .select("id, core_agent_id")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentKey)
    .maybeSingle();
  if (registryError) {
    throw new Error(`ensureCoreAgentId: ${registryError.message}`);
  }

  const linked = registryRow?.core_agent_id as string | null | undefined;
  if (linked) {
    cache.set(cacheKey(tenantId, agentKey), linked);
    return linked;
  }

  const { data: agentRow, error: upsertError } = await core
    .from("agents")
    .upsert(
      { tenant_id: tenantId, name: agentKey, status: "active" },
      { onConflict: "tenant_id, name" }
    )
    .select("id")
    .single();
  if (upsertError) {
    throw new Error(`ensureCoreAgentId: ${upsertError.message}`);
  }
  const coreAgentId = (agentRow as CoreAgentRow).id;

  if (registryRow) {
    const { error: linkError } = await ai
      .from("engenty_ai_agents")
      .update({ core_agent_id: coreAgentId })
      .eq("id", (registryRow as { id: string }).id);
    if (linkError) {
      throw new Error(`ensureCoreAgentId: ${linkError.message}`);
    }
  }

  cache.set(cacheKey(tenantId, agentKey), coreAgentId);
  return coreAgentId;
}
