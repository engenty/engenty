// apps/ai registry HTTP client — agent catalog mapping and custom registry CRUD.
// Admin UI reads/writes ai.engenty_ai_* rows via /ai/registry/* on the AI service.

import type {
  AiAgentChatTriggers,
  AiAgentRole,
  AiAgentSource,
  AiRegisteredAgent,
  CustomAgentConfig,
  CustomToolConfig,
} from "../admin/ai-runtime-types.js";
import { requestAiServiceJson } from "./ai-service-client.js";

const DEFAULT_AGENT_CHAT_TRIGGERS: AiAgentChatTriggers = {
  include_in_chat_picker: true,
  is_active: true,
  mention_routing_enabled: true,
};

interface RegistryAgentConfig {
  budget?: { maxCostMicrosPerPeriod?: number | null } | null;
  description?: string;
  id: string;
  managed_by_module?: string | null;
  maxSteps?: number | null;
  model?: string;
  modelOverride?: string | null;
  name: string;
  purpose?: AiRegisteredAgent["purpose"];
  role?: AiAgentRole;
  skillIds?: string[];
  source?: AiAgentSource;
  toolIds?: string[];
}

/** Per-agent runtime overrides a tenant admin can set (Phase 4). */
export interface AiAgentOverridesPatch {
  budget?: { maxCostMicrosPerPeriod?: number | null } | null;
  maxSteps?: number | null;
  modelOverride?: string | null;
  purpose?: AiRegisteredAgent["purpose"];
}

export function patchAiAgentOverrides(
  agentId: string,
  patch: AiAgentOverridesPatch
) {
  return requestAiServiceJson<{ agent: unknown }>(
    `/ai/registry/agents/${encodeURIComponent(agentId)}`,
    { body: JSON.stringify(patch), method: "PATCH" }
  );
}

/** Map `apps/ai` registry rows to legacy admin catalog shape for Copilot picker. */
export function mapRegistryAgentToRegisteredAgent(
  agent: RegistryAgentConfig
): AiRegisteredAgent {
  const moduleId =
    agent.source === "builtin"
      ? agent.id.startsWith("engenty.")
        ? "engenty"
        : "engenty-core"
      : (agent.id.split(".")[0] ?? "unknown");

  return {
    agent_origin: "registry",
    chat_triggers: DEFAULT_AGENT_CHAT_TRIGGERS,
    description: agent.description ?? null,
    id: agent.id,
    instruction_keys: [],
    managed_by_module: agent.managed_by_module ?? null,
    module_id: moduleId,
    name: agent.name,
    skills: agent.skillIds ?? [],
    ...(agent.model ? { model: agent.model } : {}),
    ...(agent.modelOverride ? { modelOverride: agent.modelOverride } : {}),
    ...(agent.purpose ? { purpose: agent.purpose } : {}),
    ...(agent.maxSteps == null ? {} : { maxSteps: agent.maxSteps }),
    ...(agent.budget ? { budget: agent.budget } : {}),
    ...(agent.role ? { role: agent.role } : {}),
    ...(agent.source ? { source: agent.source } : {}),
    ...(agent.toolIds?.length ? { tools: agent.toolIds } : {}),
  };
}

export async function getAiAgents(signal?: AbortSignal) {
  const result = await requestAiServiceJson<{ agents: RegistryAgentConfig[] }>(
    "/ai/registry/agents",
    { signal }
  );
  return {
    agents: (result.agents ?? []).map(mapRegistryAgentToRegisteredAgent),
  };
}

export function getCustomAgent(agentId: string, signal?: AbortSignal) {
  return requestAiServiceJson<{ agent: CustomAgentConfig }>(
    `/ai/registry/agents/${encodeURIComponent(agentId)}`,
    { signal }
  );
}

export function createCustomAgent(input: CustomAgentConfig) {
  return requestAiServiceJson<{ agent: CustomAgentConfig }>(
    "/ai/registry/agents",
    {
      body: JSON.stringify(input),
      method: "POST",
    }
  );
}

export function updateCustomAgent(
  agentId: string,
  input: Partial<CustomAgentConfig>
) {
  return requestAiServiceJson<{ agent: CustomAgentConfig }>(
    `/ai/registry/agents/${encodeURIComponent(agentId)}`,
    {
      body: JSON.stringify(input),
      method: "PATCH",
    }
  );
}

export function deleteCustomAgent(agentId: string) {
  return requestAiServiceJson<{ deleted: boolean }>(
    `/ai/registry/agents/${encodeURIComponent(agentId)}`,
    { method: "DELETE" }
  );
}

export function getRegistryTools(signal?: AbortSignal) {
  return requestAiServiceJson<{ tools: CustomToolConfig[] }>(
    "/ai/registry/tools",
    {
      signal,
    }
  );
}

export function getCustomTool(toolId: string, signal?: AbortSignal) {
  return requestAiServiceJson<{ tool: CustomToolConfig }>(
    `/ai/registry/tools/${encodeURIComponent(toolId)}`,
    { signal }
  );
}

export function createCustomTool(input: CustomToolConfig) {
  return requestAiServiceJson<{ tool: CustomToolConfig }>(
    "/ai/registry/tools",
    {
      body: JSON.stringify(input),
      method: "POST",
    }
  );
}

export function updateCustomTool(
  toolId: string,
  input: Partial<CustomToolConfig>
) {
  return requestAiServiceJson<{ tool: CustomToolConfig }>(
    `/ai/registry/tools/${encodeURIComponent(toolId)}`,
    {
      body: JSON.stringify(input),
      method: "PATCH",
    }
  );
}

export function deleteCustomTool(toolId: string) {
  return requestAiServiceJson<{ deleted: boolean }>(
    `/ai/registry/tools/${encodeURIComponent(toolId)}`,
    { method: "DELETE" }
  );
}
