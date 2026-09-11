/**
 * Resolve the effective agent-approval mode for one invoke.
 *
 * Layers: tenant `ai.config` → space column → per-agent map on the same
 * tenant setting (keyed by agent type key). An explicit space pin replaces
 * the tenant default in either direction; unset inherits. Goal/agent layers
 * that are set still take the most restrictive with that result.
 * Token and agent grants are Axis A and are not consulted here.
 */

import {
  type AgentApprovalMode,
  capabilityCovers,
  effectiveApprovalMode,
  parseAgentApprovalMode,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgentById } from "../dal/role-assignments.js";
import { resolveSpaceResourceSurface } from "../dal/space-mounts.js";
import { getSpaceById } from "../dal/spaces.js";
import { getTenantAiConfig } from "../dal/tenant-ai-config.js";
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

export function createApprovalModeResolver(deps: {
  config: Record<string, unknown>;
  getDb?: (auth: { tenantId: string }) => SupabaseClient | null;
}): (input: PolicyInput) => Promise<ResolvedAgentApproval> {
  return async (input) => {
    const tenantId = input.auth.tenantId;
    const tenant = await getTenantAiConfig(deps.config, tenantId, "default");
    const tenantMode = tenant.agent_approval?.mode ?? "manual";
    const client = deps.getDb?.({ tenantId }) ?? null;

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
    if (client && input.auth.agentId) {
      const agent = await getAgentById(client, tenantId, input.auth.agentId);
      const key = agent?.name;
      if (key) {
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
      mode: effectiveApprovalMode([spaceMode ?? tenantMode, agentMode]),
      spaceWriteMounted,
    };
  };
}
