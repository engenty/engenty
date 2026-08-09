import {
  agentGuardrailsConfigSchema,
  agentLimitsConfigSchema,
} from "@engenty/ai-core";
import { createNonExecutableDatabaseTool } from "../../ai/registry/database-tool.js";
import type {
  AgentConfig,
  MastraToolDefinition,
  ToolConfig,
} from "../../ai/registry/types.js";
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";

const AI_SCHEMA = "ai";

export type RegistryAgentStatus = "proposed" | "active" | "archived";

export interface RegistryAgentRow {
  agent_id: string;
  /** Link to the core.agents security principal; provisioned lazily. */
  core_agent_id?: string | null;
  created_at: string;
  /** agent_type_key of the proposing agent; null = human-created. */
  created_by_agent?: string | null;
  description: string | null;
  guardrails: Record<string, unknown> | null;
  id: string;
  instructions: string;
  /** Per-agent operational limits (e.g. { max_steps, budget }). */
  limits?: Record<string, unknown> | null;
  model: string;
  /** Per-agent model overrides (Phase 4); null = inherit tenant defaults. */
  model_override?: string | null;
  name: string;
  /** Pending full-config revision for an ACTIVE agent (governance). */
  proposed_config?: Record<string, unknown> | null;
  purpose?: string | null;
  skill_ids: string[];
  status?: RegistryAgentStatus | null;
  sub_agents: { id: string; alias?: string }[];
  tenant_id: string;
  tool_ids: string[];
  updated_at: string;
}

/** Governance view of a registry agent (admin/approval surfaces). */
export interface RegistryAgentRecord {
  config: AgentConfig;
  created_by_agent: string | null;
  proposed_config: Record<string, unknown> | null;
  status: RegistryAgentStatus;
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

function parseLimits(
  raw: Record<string, unknown> | null | undefined
): AgentConfig["limits"] {
  if (!raw || Object.keys(raw).length === 0) {
    return;
  }
  const parsed = agentLimitsConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function mapAgentRow(row: RegistryAgentRow): AgentConfig {
  const guardrails = parseGuardrails(row.guardrails);
  const limits = parseLimits(row.limits);
  const purpose = row.purpose as AgentConfig["purpose"] | null | undefined;
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
    ...(limits ? { limits } : {}),
    ...(row.model_override ? { modelOverride: row.model_override } : {}),
    ...(purpose ? { purpose } : {}),
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

export function createRegistryStore(source: DbSource) {
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): every method is
  // tenant-keyed (ai.engenty_ai_agents / ai.engenty_ai_tools carry tenant_id)
  // and resolves a tenant-locked handle per call.
  const { forTenant } = normalizeDbSource(source);
  const dbFor = (tenantId: string) => forTenant(tenantId).schema(AI_SCHEMA);

  return {
    async getAgentConfig(
      tenantId: string,
      agentId: string
    ): Promise<AgentConfig | undefined> {
      const { data, error } = await dbFor(tenantId)
        .from("engenty_ai_agents")
        .select()
        .eq("tenant_id", tenantId)
        .eq("agent_id", agentId)
        // Runtime safety: proposed/archived agents never assemble or run.
        .eq("status", "active")
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
      const { data, error } = await dbFor(tenantId)
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
      const { data, error } = await dbFor(tenantId)
        .from("engenty_ai_agents")
        .select()
        .eq("tenant_id", tenantId)
        // Assignment/routing surfaces only ever see runnable agents.
        .eq("status", "active");
      if (error) {
        throw new Error(`listAgents: ${error.message}`);
      }
      return (data as RegistryAgentRow[]).map(mapAgentRow);
    },

    /** Governance view: every row, with status + pending revision. */
    async listAgentRecords(tenantId: string): Promise<RegistryAgentRecord[]> {
      const { data, error } = await dbFor(tenantId)
        .from("engenty_ai_agents")
        .select()
        .eq("tenant_id", tenantId);
      if (error) {
        throw new Error(`listAgentRecords: ${error.message}`);
      }
      return (data as RegistryAgentRow[]).map((row) => ({
        config: mapAgentRow(row),
        created_by_agent: row.created_by_agent ?? null,
        proposed_config: row.proposed_config ?? null,
        status: row.status ?? "active",
        updated_at: row.updated_at,
      }));
    },

    /**
     * Agent-driven write path: NEVER goes live directly.
     * - no row yet → insert the config as a status='proposed' row
     * - row is active → stash the revision in proposed_config (agent stays
     *   online with its current config until a human approves)
     * - row is proposed → update the pending proposal in place
     * Archived agents are left to humans (throws).
     */
    async proposeAgent(
      tenantId: string,
      config: AgentConfig,
      options: { proposedByAgent?: string | null } = {}
    ): Promise<RegistryAgentRecord> {
      const { data: existing, error: readError } = await dbFor(tenantId)
        .from("engenty_ai_agents")
        .select()
        .eq("tenant_id", tenantId)
        .eq("agent_id", config.id)
        .maybeSingle();
      if (readError) {
        throw new Error(`proposeAgent: ${readError.message}`);
      }
      const row = existing as RegistryAgentRow | null;
      if (row && (row.status ?? "active") === "archived") {
        throw new Error(
          `proposeAgent: agent '${config.id}' is archived — a human must restore it first`
        );
      }
      const configColumns = {
        name: config.name,
        description: config.description ?? null,
        model: config.model,
        instructions: config.instructions,
        tool_ids: config.toolIds ?? [],
        skill_ids: config.skillIds ?? [],
        sub_agents: config.subAgents ?? [],
        guardrails: config.guardrails ?? {},
        limits: config.limits ?? {},
        model_override: config.modelOverride ?? null,
        purpose: config.purpose ?? null,
      };
      const patch =
        row && (row.status ?? "active") === "active"
          ? { proposed_config: configColumns }
          : {
              ...configColumns,
              status: "proposed",
              created_by_agent:
                options.proposedByAgent ?? row?.created_by_agent ?? null,
            };
      const { data, error } = await dbFor(tenantId)
        .from("engenty_ai_agents")
        .upsert(
          { tenant_id: tenantId, agent_id: config.id, ...patch },
          { onConflict: "tenant_id, agent_id" }
        )
        .select()
        .single();
      if (error) {
        throw new Error(`proposeAgent: ${error.message}`);
      }
      const saved = data as RegistryAgentRow;
      return {
        config: mapAgentRow(saved),
        created_by_agent: saved.created_by_agent ?? null,
        proposed_config: saved.proposed_config ?? null,
        status: saved.status ?? "active",
        updated_at: saved.updated_at,
      };
    },

    /**
     * Human approval: a proposed row goes active; an active row with a pending
     * proposed_config has the revision applied and cleared.
     */
    async approveAgent(
      tenantId: string,
      agentId: string
    ): Promise<AgentConfig> {
      const { data: existing, error: readError } = await dbFor(tenantId)
        .from("engenty_ai_agents")
        .select()
        .eq("tenant_id", tenantId)
        .eq("agent_id", agentId)
        .maybeSingle();
      if (readError) {
        throw new Error(`approveAgent: ${readError.message}`);
      }
      if (!existing) {
        throw new Error(`approveAgent: agent '${agentId}' not found`);
      }
      const row = existing as RegistryAgentRow;
      const status = row.status ?? "active";
      let patch: Record<string, unknown>;
      if (status === "proposed") {
        patch = { status: "active" };
      } else if (status === "active" && row.proposed_config) {
        patch = { ...row.proposed_config, proposed_config: null };
      } else {
        throw new Error(
          `approveAgent: agent '${agentId}' has nothing pending (status '${status}')`
        );
      }
      const { data, error } = await dbFor(tenantId)
        .from("engenty_ai_agents")
        .update(patch)
        .eq("tenant_id", tenantId)
        .eq("agent_id", agentId)
        .select()
        .single();
      if (error) {
        throw new Error(`approveAgent: ${error.message}`);
      }
      return mapAgentRow(data as RegistryAgentRow);
    },

    /**
     * Human rejection: a proposed row is deleted (it never went live); an
     * active row just drops its pending proposed_config.
     */
    async rejectAgent(tenantId: string, agentId: string): Promise<boolean> {
      const { data: existing, error: readError } = await dbFor(tenantId)
        .from("engenty_ai_agents")
        .select()
        .eq("tenant_id", tenantId)
        .eq("agent_id", agentId)
        .maybeSingle();
      if (readError) {
        throw new Error(`rejectAgent: ${readError.message}`);
      }
      if (!existing) {
        return false;
      }
      const row = existing as RegistryAgentRow;
      if ((row.status ?? "active") === "proposed") {
        const { error } = await dbFor(tenantId)
          .from("engenty_ai_agents")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("agent_id", agentId);
        if (error) {
          throw new Error(`rejectAgent: ${error.message}`);
        }
        return true;
      }
      if (row.proposed_config) {
        const { error } = await dbFor(tenantId)
          .from("engenty_ai_agents")
          .update({ proposed_config: null })
          .eq("tenant_id", tenantId)
          .eq("agent_id", agentId);
        if (error) {
          throw new Error(`rejectAgent: ${error.message}`);
        }
        return true;
      }
      return false;
    },

    async listTools(tenantId: string): Promise<ToolConfig[]> {
      const { data, error } = await dbFor(tenantId)
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
      const { data, error } = await dbFor(tenantId)
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
            limits: config.limits ?? {},
            model_override: config.modelOverride ?? null,
            purpose: config.purpose ?? null,
            // Human/admin write path: goes live directly and supersedes any
            // pending agent proposal (agents propose via proposeAgent instead).
            status: "active",
            proposed_config: null,
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
      const { error } = await dbFor(tenantId)
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
      const { data, error } = await dbFor(tenantId)
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
      const { data, error } = await dbFor(tenantId)
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
      const { error } = await dbFor(tenantId)
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
