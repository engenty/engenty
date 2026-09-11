import { ENGENTY_COPILOT_AGENT_ID } from "@engenty/engenty-copilot/ai";
import { createLogger } from "@engenty/telemetry";
import type { Agent } from "@mastra/core/agent";
import type { Mastra } from "@mastra/core/mastra";
import type { MastraMemory } from "@mastra/core/memory";
import {
  type EngentyToolsRunContext,
  getEngentyToolsRunContext,
} from "../../ai/tools/engenty-tools/lib/run-context.js";
import type { AiScopeResolver } from "../api/http.js";
import { ENGENTY_REMOTE_AGENT_ID } from "../api/load-engenty-remote.js";
import type { ThreadStore } from "../dal/threads/index.js";
import { SCHEDULER_AGENT_ID } from "../scheduler/heartbeat-sync.js";
import { createDefaultAiRegistry } from "./agents.js";
import {
  createEngentySessionMastraMemory,
  createEngentySessionMemoryStorage,
} from "./memory/index.js";
import { assembleDynamicAgent } from "./registry/assemble-dynamic-agent.js";
import type { AgentConfig, AiRegistry } from "./registry/types.js";

const logger = createLogger({ name: "studio-tenant-agents" });

export const STUDIO_RESERVED_AGENT_IDS = new Set([
  ENGENTY_COPILOT_AGENT_ID,
  SCHEDULER_AGENT_ID,
  ENGENTY_REMOTE_AGENT_ID,
]);

export interface StudioTenantStatus {
  agentIds: string[];
  enabled: true;
  tenantId: string | null;
}

type ListableRegistry = AiRegistry & {
  listAgentConfigs: () => Promise<AgentConfig[]>;
};

let activatedTenantId: string | undefined;
const studioRegisteredAgentIds = new Set<string>();

export function getActivatedStudioTenantId(): string | undefined {
  return activatedTenantId;
}

export function getStudioRegisteredAgentIds(): string[] {
  return [...studioRegisteredAgentIds];
}

export function getStudioTenantStatus(): StudioTenantStatus {
  return {
    enabled: true,
    tenantId: activatedTenantId ?? null,
    agentIds: getStudioRegisteredAgentIds(),
  };
}

export function resetStudioTenantStateForTests(): void {
  activatedTenantId = undefined;
  studioRegisteredAgentIds.clear();
}

export function isStudioReservedAgentId(agentId: string): boolean {
  return STUDIO_RESERVED_AGENT_IDS.has(agentId);
}

export async function resolveStudioPlayAlsContext(input: {
  accessToken: string;
  authorization: string | undefined;
  scopeResolver: AiScopeResolver;
}): Promise<EngentyToolsRunContext> {
  const pin = activatedTenantId;
  if (!pin) {
    return { accessToken: input.accessToken };
  }
  const resolved = await input.scopeResolver({
    authorization: input.authorization,
  });
  if (!(resolved.ok && resolved.scope.tenantId === pin)) {
    return { accessToken: input.accessToken };
  }
  return {
    accessToken: input.accessToken,
    tenantId: resolved.scope.tenantId,
    userId: resolved.scope.userId,
  };
}

export interface ActivateStudioTenantInput {
  assembleAgent?: typeof assembleDynamicAgent;
  createRegistry?: (tenantId: string) => AiRegistry;
  mastra: Mastra;
  tenantId: string;
  threadStore?: ThreadStore | null;
}

export async function activateStudioTenant(
  input: ActivateStudioTenantInput
): Promise<StudioTenantStatus> {
  const registry =
    input.createRegistry?.(input.tenantId) ??
    createDefaultAiRegistry({ tenantId: input.tenantId });
  const configs = await listRegistryAgentConfigs(registry);
  await removePreviousStudioAgents(input.mastra);

  const registered: string[] = [];
  for (const config of configs) {
    if (isStudioReservedAgentId(config.id)) {
      continue;
    }
    try {
      const assemble = input.assembleAgent ?? assembleDynamicAgent;
      const agent = await assemble(registry, config.id, {
        mastra: input.mastra,
        skipSubAgents: true,
        ...(input.threadStore
          ? {
              memory: studioPlayMemoryFactory(
                config.id,
                input.threadStore
              ) as unknown as MastraMemory,
            }
          : {}),
      });
      input.mastra.addAgent(agent as Agent, config.id);
      studioRegisteredAgentIds.add(config.id);
      registered.push(config.id);
    } catch (err) {
      logger.warn("studio tenant: skipped agent", {
        agentId: config.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  activatedTenantId = input.tenantId;
  return {
    enabled: true,
    tenantId: activatedTenantId,
    agentIds: registered,
  };
}

function studioPlayMemoryFactory(agentId: string, store: ThreadStore) {
  return () => {
    const ctx = getEngentyToolsRunContext();
    const tenantId = ctx.tenantId;
    const userId = ctx.userId;
    if (!(tenantId && userId)) {
      throw new Error(
        "studio tenant agent memory requires Play ALS (tenantId and userId)"
      );
    }
    const storage = createEngentySessionMemoryStorage({
      agentId,
      scope: { tenantId, userId },
      store,
    });
    return createEngentySessionMastraMemory({ storage });
  };
}

async function listRegistryAgentConfigs(
  registry: AiRegistry
): Promise<AgentConfig[]> {
  if (!hasListAgentConfigs(registry)) {
    return [];
  }
  return await registry.listAgentConfigs();
}

function hasListAgentConfigs(
  registry: AiRegistry
): registry is ListableRegistry {
  return (
    "listAgentConfigs" in registry &&
    typeof (registry as ListableRegistry).listAgentConfigs === "function"
  );
}

async function removePreviousStudioAgents(mastra: Mastra): Promise<void> {
  for (const agentId of [...studioRegisteredAgentIds]) {
    mastra.removeAgent(agentId);
    studioRegisteredAgentIds.delete(agentId);
  }
}
