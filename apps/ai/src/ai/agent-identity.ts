import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureCoreAgentId } from "../dal/registry/core-agent-link.js";
import { createAiDatabaseAdapter } from "../infra/database.js";

/**
 * Best-effort resolution of the core.agents principal uuid for a run's agent
 * key. Null (no service-role DB, provisioning failure) means agent identity is
 * simply not forwarded to core — tools keep working as before, only the
 * agent-aware policy gates stay dormant. Never throws: identity forwarding
 * must not take down a chat run.
 */

let serviceClient: SupabaseClient | null | undefined;

export async function resolveCoreAgentId(
  tenantId: string | null | undefined,
  agentKey: string | null | undefined
): Promise<string | null> {
  if (!(tenantId && agentKey)) {
    return null;
  }
  if (serviceClient === undefined) {
    serviceClient = createAiDatabaseAdapter();
  }
  if (!serviceClient) {
    return null;
  }
  try {
    return await ensureCoreAgentId(serviceClient, tenantId, agentKey);
  } catch (err) {
    console.error("resolveCoreAgentId failed", err);
    return null;
  }
}
