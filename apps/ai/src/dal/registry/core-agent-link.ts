import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../../ai/core-http-client.js";
import {
  getServiceAccessToken,
  isServiceCredentialConfigured,
} from "../../ai/service-credential.js";

/**
 * Resolves the core.agents principal uuid for an AI-plane agent key
 * (e.g. "engenty.copilot"). Grants and audit key on that uuid; the AI plane
 * only knows text agent keys.
 *
 * Registry agents carry the mapping on ai.engenty_ai_agents.core_agent_id.
 * Builtin agents have no registry row, so their principal is found-or-created
 * through CORE (`core_agents_ensure`), which also attaches the module's read
 * role the first time an agent appears — a module agent that cannot read its
 * own module is broken on arrival. Minting lives in core because an agent
 * principal is an authz subject and the grant is an authz write; the AI plane
 * knows keys, core knows what a key means as a subject.
 *
 * Idempotent; the registry mapping column (an AI-plane table) is written back
 * here when a registry row exists without one.
 */

const cache = new Map<string, string>();

function cacheKey(tenantId: string, agentKey: string): string {
  return `${tenantId}:${agentKey}`;
}

/** Ask core to find-or-create the principal. Returns null when unconfigured. */
async function ensureViaCore(
  tenantId: string,
  agentKey: string
): Promise<string | null> {
  if (!isServiceCredentialConfigured()) {
    return null;
  }
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const accessToken = await getServiceAccessToken({ tenantId });
  if (!(coreBaseUrl && accessToken)) {
    return null;
  }
  const result = (await new EngentyCoreClient({
    accessToken,
    coreBaseUrl,
  }).invokeTool("core_agents_ensure", { name: agentKey })) as {
    id?: string;
  } | null;
  return result?.id ?? null;
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

  const coreAgentId = await ensureViaCore(tenantId, agentKey);
  if (!coreAgentId) {
    throw new Error(
      "ensureCoreAgentId: core could not mint the agent principal (service credential or core base URL missing)"
    );
  }

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
