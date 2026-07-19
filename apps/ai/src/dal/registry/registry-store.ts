import { agentGuardrailsConfigSchema } from "@engenty/ai-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNonExecutableDatabaseTool } from "../../ai/registry/database-tool.js";
import type {
  AgentConfig,
  MastraToolDefinition,
  ToolConfig,
} from "../../ai/registry/types.js";

const AI_SCHEMA = "ai";

export interface RegistryAgentRow {
  agent_id: string;
  /** Link to the core.agents security principal; provisioned lazily. */
  core_agent_id?: string | null;
  created_at: string;
  description: string | null;
  guardrails: Record<string, unknown> | null;
  id: string;
  instructions: string;
  model: string;
  name: string;
  skill_ids: string[];
  sub_agents: { id: string; alias?: string }[];
  tenant_id: string;
  tool_ids: string[];
  updated_at: string;
}

function parseGuardrails(
  raw: Record<string, unknown> | null | undefined
): AgentConfig["guardrails"] {
  if (!raw || Object.keys(raw).length === 0) {
    return;
  }
  const parsed = agentGuardrailsConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function mapAgentRow(row: RegistryAgentRow): AgentConfig {
  const guardrails = parseGuardrails(row.guardrails);
  return {
    id: row.agent_id,
    name: row.name,
    description: row.description ?? undefined,
    model: row.model,
    instructions: row.instructions,
    toolIds: row.tool_ids,
    skillIds: row.skill_ids,
    subAgents: row.sub_agents,
    ...(guardrails ? { guardrails } : {}),
  };
}

export interface RegistryToolRow {
  created_at: string;
  description: string | null;
  endpoint_url: string;
  id: string;
  name: string;
  schema_json: Record<string, unknown>;
  tenant_id: string;
  tool_id: string;
  updated_at: string;
}

function mapToolRow(row: RegistryToolRow): ToolConfig {
  return {
    description: row.description ?? undefined,
    endpointUrl: row.endpoint_url,
    id: row.tool_id,
    name: row.name,
    schemaJson: row.schema_json,
  };
}

export function createRegistryStore(client: SupabaseClient) {
  const db = client.schema(AI_SCHEMA);

  return {
    async getAgentConfig(
      tenantId: string,
      agentId: string
    ): Promise<AgentConfig | undefined> {
      const { data, error } = await db
        .from("engenty_ai_agents")
        .select()
        .eq("tenant_id", tenantId)
        .eq("agent_id", agentId)
        .maybeSingle();
      if (error) {
        throw new Error(`getAgentConfig: ${error.message}`);
      }
      if (!data) {
        return;
      }
      return mapAgentRow(data as RegistryAgentRow);
    },

    async getTool(
      tenantId: string,
      toolId: string
    ): Promise<MastraToolDefinition | undefined> {
      const { data, error } = await db
        .from("engenty_ai_tools")
        .select()
        .eq("tenant_id", tenantId)
        .eq("tool_id", toolId)
        .maybeSingle();
      if (error) {
        throw new Error(`getTool: ${error.message}`);
      }
      if (!data) {
        return;
      }
      return createNonExecutableDatabaseTool(
        mapToolRow(data as RegistryToolRow)
      );
    },

    async listAgents(tenantId: string): Promise<AgentConfig[]> {
      const { data, error } = await db
        .from("engenty_ai_agents")
        .select()
        .eq("tenant_id", tenantId);
      if (error) {
        throw new Error(`listAgents: ${error.message}`);
      }
      return (data as RegistryAgentRow[]).map(mapAgentRow);
    },

    async listTools(tenantId: string): Promise<ToolConfig[]> {
      const { data, error } = await db
        .from("engenty_ai_tools")
        .select()
        .eq("tenant_id", tenantId);
      if (error) {
        throw new Error(`listTools: ${error.message}`);
      }
      return (data as RegistryToolRow[]).map(mapToolRow);
    },

    async upsertAgent(
      tenantId: string,
      config: AgentConfig
    ): Promise<AgentConfig> {
      const { data, error } = await db
        .from("engenty_ai_agents")
        .upsert(
          {
            tenant_id: tenantId,
            agent_id: config.id,
            name: config.name,
            description: config.description ?? null,
            model: config.model,
            instructions: config.instructions,
            tool_ids: config.toolIds ?? [],
            skill_ids: config.skillIds ?? [],
            sub_agents: config.subAgents ?? [],
            guardrails: config.guardrails ?? {},
          },
          { onConflict: "tenant_id, agent_id" }
        )
        .select()
        .single();
      if (error) {
        throw new Error(`upsertAgent: ${error.message}`);
      }
      return mapAgentRow(data as RegistryAgentRow);
    },

    async deleteAgent(tenantId: string, agentId: string): Promise<boolean> {
      const { error } = await db
        .from("engenty_ai_agents")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("agent_id", agentId);
      if (error) {
        throw new Error(`deleteAgent: ${error.message}`);
      }
      return true;
    },

    async getToolConfig(
      tenantId: string,
      toolId: string
    ): Promise<ToolConfig | undefined> {
      const { data, error } = await db
        .from("engenty_ai_tools")
        .select()
        .eq("tenant_id", tenantId)
        .eq("tool_id", toolId)
        .maybeSingle();
      if (error) {
        throw new Error(`getToolConfig: ${error.message}`);
      }
      if (!data) {
        return;
      }
      return mapToolRow(data as RegistryToolRow);
    },

    async upsertTool(
      tenantId: string,
      config: ToolConfig
    ): Promise<ToolConfig> {
      const { data, error } = await db
        .from("engenty_ai_tools")
        .upsert(
          {
            tenant_id: tenantId,
            tool_id: config.id,
            name: config.name,
            description: config.description ?? null,
            schema_json: config.schemaJson,
            endpoint_url: config.endpointUrl,
          },
          { onConflict: "tenant_id, tool_id" }
        )
        .select()
        .single();
      if (error) {
        throw new Error(`upsertTool: ${error.message}`);
      }
      return mapToolRow(data as RegistryToolRow);
    },

    async deleteTool(tenantId: string, toolId: string): Promise<boolean> {
      const { error } = await db
        .from("engenty_ai_tools")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("tool_id", toolId);
      if (error) {
        throw new Error(`deleteTool: ${error.message}`);
      }
      return true;
    },
  };
}

export type RegistryStore = ReturnType<typeof createRegistryStore>;
