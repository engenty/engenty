import { ensureCoreAgentId } from "../dal/registry/core-agent-link.js";
import { getTenantDbFactoryFromEnv } from "../infra/tenant-db.js";

/**
 * Best-effort resolution of the core.agents principal uuid for a run's agent
 * key. Null (no tenant-lane DB, provisioning failure) means agent identity is
 * simply not forwarded to core — tools keep working as before, only the
 * agent-aware policy gates stay dormant. Never throws: identity forwarding
 * must not take down a chat run.
 *
 * Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): both tables touched
 * (ai.engenty_ai_agents, core.agents) carry tenant_id, so the lookup rides a
 * tenant-locked handle minted for the run's tenant.
 */

export async function resolveCoreAgentId(
  tenantId: string | null | undefined,
  agentKey: string | null | undefined
): Promise<string | null> {
  if (!(tenantId && agentKey)) {
    return null;
  }
  const factory = getTenantDbFactoryFromEnv();
  if (!factory) {
    return null;
  }
  try {
    return await ensureCoreAgentId(
      factory.getTenantDb({ tenantId }),
      tenantId,
      agentKey
    );
  } catch (err) {
    console.error("resolveCoreAgentId failed", err);
    return null;
  }
}
