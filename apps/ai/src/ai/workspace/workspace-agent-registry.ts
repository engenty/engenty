import type {
  AgentConfig,
  AiRegistryProvider,
  MastraToolDefinition,
} from "../registry/types.js";
import {
  type EngentyWorkspaceAgentConfig,
  mapRegistryRowToWorkspaceAgentConfig,
} from "./contracts.js";

export interface WorkspaceAgentRecordSource {
  getAgentConfig(
    tenantId: string,
    agentId: string
  ): Promise<EngentyWorkspaceAgentConfig | undefined>;
  listAgents?(tenantId: string): Promise<EngentyWorkspaceAgentConfig[]>;
}

/**
 * AiRegistryProvider that resolves workspace-backed agent metadata.
 * Skill bodies are discovered by Mastra Workspace from skillPaths — not getSkill().
 */
export class WorkspaceBackedAgentRegistry implements AiRegistryProvider {
  readonly providerId = "workspace";

  private readonly source: WorkspaceAgentRecordSource;
  private readonly tenantId: string;

  constructor(source: WorkspaceAgentRecordSource, tenantId: string) {
    this.source = source;
    this.tenantId = tenantId;
  }

  async getAgentConfig(id: string): Promise<AgentConfig | undefined> {
    const config = await this.source.getAgentConfig(this.tenantId, id);
    if (!config) {
      return;
    }
    return toAgentConfig(config);
  }

  async getTool(id: string): Promise<MastraToolDefinition | undefined> {
    // Tools still bridge through legacy registry providers in composite stack.
    return;
  }

  async listAgentConfigs(): Promise<AgentConfig[]> {
    if (!this.source.listAgents) {
      return [];
    }
    const configs = await this.source.listAgents(this.tenantId);
    return configs.map((config) => toAgentConfig(config));
  }
}

function toAgentConfig(config: EngentyWorkspaceAgentConfig): AgentConfig {
  return {
    description: config.description,
    id: config.id,
    instructions: config.instructions,
    model: config.model,
    name: config.name,
    skillIds: config.skillPaths,
    source: "database",
    subAgents: config.subAgents,
    ...(config.tool_profile ? { tool_profile: config.tool_profile } : {}),
    toolIds: config.toolIds,
  };
}

/** Adapts ai.engenty_ai_agents row fetchers to workspace config. */
export function createWorkspaceAgentRecordSource(
  fetchAgent: (
    tenantId: string,
    agentId: string
  ) => Promise<
    Parameters<typeof mapRegistryRowToWorkspaceAgentConfig>[0] | null
  >,
  listAgents?: (
    tenantId: string
  ) => Promise<Parameters<typeof mapRegistryRowToWorkspaceAgentConfig>[0][]>
): WorkspaceAgentRecordSource {
  return {
    getAgentConfig: async (tenantId, agentId) => {
      const row = await fetchAgent(tenantId, agentId);
      return row ? mapRegistryRowToWorkspaceAgentConfig(row) : undefined;
    },
    listAgents: listAgents
      ? async (tenantId) => {
          const rows = await listAgents(tenantId);
          return rows.map((row) => mapRegistryRowToWorkspaceAgentConfig(row));
        }
      : undefined,
  };
}
