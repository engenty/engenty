/**
 * Resolve the effective agent-approval mode for one invoke.
 *
 * Layers: the per-agent map on the tenant setting (keyed by agent type key)
 * decides when set, looser or stricter; else the agent's platform default
 * (the copilot: `auto`); else the space column; else tenant `ai.config`.
 * Token and agent grants are Axis A and are not consulted here.
 */

import {
  type AgentApprovalMode,
  capabilityCovers,
  parseAgentApprovalMode,
  resolveAgentApprovalMode,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgentById } from "../dal/role-assignments.js";
import { resolveSpaceResourceSurface } from "../dal/space-mounts.js";
import { getSpaceById } from "../dal/spaces.js";
import { readTenantAiConfig } from "../dal/tenant-ai-config.js";
import type { PolicyInput } from "./policy.js";

export interface ResolvedAgentApproval {
  mode: AgentApprovalMode;
  spaceWriteMounted: boolean;
}

export function createSpaceCapabilityLoader(deps: {
  getDb?: (auth: { tenantId: string }) => SupabaseClient | null;
}): (tenantId: string, spaceId: string) => Promise<string[]> {
  return async (tenantId, spaceId) => {
    const client = deps.getDb?.({ tenantId }) ?? null;
    if (!client) {
      return [];
    }
    const surface = await resolveSpaceResourceSurface(
      client,
      tenantId,
      spaceId
    );
    return surface.capabilities;
  };
}

/**
 * Every layer is read through `getDb` and nothing else: an app built without
 * a database (the offline unit tests inject a grants service and get no
 * client) resolves to the manual default instead of opening its own
 * connection from the environment.
 */
export function createApprovalModeResolver(deps: {
  getDb?: (auth: { tenantId: string }) => SupabaseClient | null;
}): (input: PolicyInput) => Promise<ResolvedAgentApproval> {
  return async (input) => {
    const tenantId = input.auth.tenantId;
    const client = deps.getDb?.({ tenantId }) ?? null;
    const tenant = client
      ? await readTenantAiConfig(client, tenantId, "default")
      : {};
    const tenantMode = parseAgentApprovalMode(tenant.agent_approval?.mode);

    let spaceMode: AgentApprovalMode | null = null;
    let spaceCaps: string[] = [];
    if (client && input.auth.spaceId) {
      const [space, surface] = await Promise.all([
        getSpaceById(client, tenantId, input.auth.spaceId),
        resolveSpaceResourceSurface(client, tenantId, input.auth.spaceId),
      ]);
      spaceMode = parseAgentApprovalMode(space?.agentApprovalMode);
      spaceCaps = surface.capabilities;
    }

    let agentMode: AgentApprovalMode | null = null;
    let agentKey: string | null = null;
    if (client && input.auth.agentId) {
      const agent = await getAgentById(client, tenantId, input.auth.agentId);
      const key = agent?.name;
      if (key) {
        agentKey = key;
        agentMode = parseAgentApprovalMode(
          tenant.agent_approval?.agents?.[key]
        );
      }
    }

    const moduleWrite = `module.${input.moduleId}.write`;
    const spaceWriteMounted =
      capabilityCovers(spaceCaps, moduleWrite) ||
      input.requiredCapabilities.some(
        (cap) => cap.endsWith(".write") && capabilityCovers(spaceCaps, cap)
      );

    return {
      mode: resolveAgentApprovalMode({
        agentKey,
        agentMode,
        spaceMode,
        tenantMode,
      }),
      spaceWriteMounted,
    };
  };
}
