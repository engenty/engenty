import {
  AGENT_STARTER_DECLARE_MAX,
  type AgentWorkspaceConfig,
  agentGuardrailsConfigSchema,
  agentLimitsConfigSchema,
  agentStarterSchema,
  agentWorkspaceSandboxSchema,
  resolveAgentEngenty,
  WORKER_SANDBOX_DEFAULT,
} from "@engenty/ai-core";
import { z } from "zod";
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
  agent_scope?: "personal" | "shared" | null;
  /** Generated portrait storage key; null = blob silhouette. */
  avatar_url?: string | null;
  /** Link to the core.agents security principal; provisioned lazily. */
  core_agent_id?: string | null;
  created_at: string;
  /** agent_type_key of the proposing agent; null = human-created. */
  created_by_agent?: string | null;
  description: string | null;
  /** Default thinking tier when nobody chose one; see AgentConfig.effort. */
  effort?: string | null;
  engenty?: string | null;
  guardrails: Record<string, unknown> | null;
  id: string;
  instructions: string;
  /** Declared classification; see AgentConfig.kind. */
  kind?: string | null;
  /** Per-agent operational limits (e.g. { max_steps, budget }). */
  limits?: Record<string, unknown> | null;
  model: string;
  /** Per-agent model overrides (Phase 4); null = inherit tenant defaults. */
  model_override?: string | null;
  /** Owning module id; null = tenant/platform. */
  module_id?: string | null;
  name: string;
  /** Pending full-config revision for an ACTIVE agent (governance). */
  proposed_config?: Record<string, unknown> | null;
  /** Space a NEW proposal should mount on approve. Null for revisions. */
  proposed_space_id?: string | null;
  purpose?: string | null;
  /** Reachable from remote channels as itself; see AgentConfig.remoteEnabled. */
  remote_enabled?: boolean | null;
  /** Channel handle (`@handle`); see AgentConfig.remoteHandle. */
  remote_handle?: string | null;
  /** Sandbox slice of the workspace declaration; null = platform default. */
  sandbox?: Record<string, unknown> | null;
  skill_ids: string[];
  starters?: unknown;
  status?: RegistryAgentStatus | null;
  sub_agents: { id: string; alias?: string }[];
  tenant_id: string;
  tool_ids: string[];
  /** Screen-driving tools on chat surfaces; see AgentConfig.uiTools. */
  ui_tools?: string | null;
  updated_at: string;
}

/** Governance view of a registry agent (admin/approval surfaces). */
export interface RegistryAgentRecord {
  config: AgentConfig;
  /** When this agent was registered — runs older than it predate the hire. */
  created_at: string;
  created_by_agent: string | null;
  proposed_config: Record<string, unknown> | null;
  proposed_space_id: string | null;
  status: RegistryAgentStatus;
  updated_at: string;
}

function toAgentRecord(row: RegistryAgentRow): RegistryAgentRecord {
  return {
    config: mapAgentRow(row),
    created_at: row.created_at,
    created_by_agent: row.created_by_agent ?? null,
    proposed_config: row.proposed_config ?? null,
    proposed_space_id: row.proposed_space_id ?? null,
    status: row.status ?? "active",
    updated_at: row.updated_at,
  };
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

function parseStarters(raw: unknown): AgentConfig["starters"] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return;
  }
  const parsed = z
    .array(agentStarterSchema)
    .max(AGENT_STARTER_DECLARE_MAX)
    .safeParse(raw);
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

function agentRowWriteColumns(config: AgentConfig) {
  return {
    agent_scope: config.agentScope ?? "shared",
    avatar_url: config.avatarUrl ?? null,
    description: config.description ?? null,
    effort: config.effort ?? null,
    engenty: resolveAgentEngenty(config.id, config.engenty),
    guardrails: config.guardrails ?? {},
    instructions: config.instructions,
    kind: config.kind ?? "specialist",
    limits: config.limits ?? {},
    model: config.model,
    model_override: config.modelOverride ?? null,
    module_id: config.moduleId ?? null,
    name: config.name,
    purpose: config.purpose ?? null,
    remote_enabled: config.remoteEnabled ?? false,
    remote_handle: config.remoteHandle ?? null,
    sandbox: config.workspace?.sandbox ?? null,
    skill_ids: config.skillIds ?? [],
    starters: config.starters ?? [],
    sub_agents: config.subAgents ?? [],
    tool_ids: config.toolIds ?? [],
    ui_tools: config.uiTools ?? "auto",
  };
}

/**
 * The sandbox an agent gets: the platform default, with the row's declaration
 * layered over it.
 *
 * `requireApproval` is deliberately NOT taken from the row. An agent describes
 * itself through `agent_propose`, and a description that could turn its own
 * approval gate off would be a way to ask for unattended command execution by
 * writing it down. Unattended execution comes from a grant — a routine's
 * standing grants, approved by a person against that routine — which is a
 * decision about one job rather than a permanent property of the agent.
 */
function resolveAgentSandbox(
  raw: Record<string, unknown> | null | undefined
): NonNullable<AgentWorkspaceConfig["sandbox"]> {
  const declared = raw
    ? agentWorkspaceSandboxSchema.safeParse(raw)
    : { success: false as const };
  // The shared Worker default (PLAN-agent-computers.md §1.1) — the same
  // values every lane applies; this lane only adds the requireApproval clamp
  // below, because DB rows are runtime-registered rather than code-reviewed.
  const base = { ...WORKER_SANDBOX_DEFAULT };
  if (!declared.success) {
    return base;
  }
  return { ...base, ...declared.data, requireApproval: true };
}

function isEffort(value: unknown): value is "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high";
}

function isUiTools(value: unknown): value is "auto" | "on" | "off" {
  return value === "auto" || value === "on" || value === "off";
}

function isAgentKind(value: unknown): value is AgentConfig["kind"] {
  return (
    value === "interface" ||
    value === "specialist" ||
    value === "delegated" ||
    value === "chat_surface"
  );
}

function mapAgentRow(row: RegistryAgentRow): AgentConfig {
  const guardrails = parseGuardrails(row.guardrails);
  const limits = parseLimits(row.limits);
  const starters = parseStarters(row.starters);
  const purpose = row.purpose as AgentConfig["purpose"] | null | undefined;
  return {
    id: row.agent_id,
    name: row.name,
    description: row.description ?? undefined,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    engenty: resolveAgentEngenty(row.agent_id, row.engenty),
    model: row.model,
    instructions: row.instructions,
    toolIds: row.tool_ids,
    skillIds: row.skill_ids,
    subAgents: row.sub_agents,
    ...(row.agent_scope ? { agentScope: row.agent_scope } : {}),
    ...(isEffort(row.effort) ? { effort: row.effort } : {}),
    ...(guardrails ? { guardrails } : {}),
    ...(limits ? { limits } : {}),
    ...(starters ? { starters } : {}),
    ...(isAgentKind(row.kind) ? { kind: row.kind } : {}),
    ...(row.model_override ? { modelOverride: row.model_override } : {}),
    ...(row.module_id ? { moduleId: row.module_id } : {}),
    ...(purpose ? { purpose } : {}),
    ...(row.remote_enabled ? { remoteEnabled: true } : {}),
    ...(row.remote_handle ? { remoteHandle: row.remote_handle } : {}),
    ...(isUiTools(row.ui_tools) && row.ui_tools !== "auto"
      ? { uiTools: row.ui_tools }
      : {}),
    workspace: {
      enabled: true,
      preset: row.agent_scope === "personal" ? "assistant" : "staff",
      /**
       * Every registered specialist gets a computer, not just files.
       *
       * A default without one meant no specialist could ever run a line of
       * code, in chat or in a routine — the gap the compute plan's
       * specialist-parity rule names. Cheap to hand out because the container
       * is lazy: it is created when a command actually runs, so an agent that
       * never runs one never costs one.
       *
       * The row may narrow or widen this (see `resolveAgentSandbox`); a row
       * that says nothing keeps the safe default.
       */
      sandbox: resolveAgentSandbox(row.sandbox),
    },
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
      return (data as RegistryAgentRow[]).map(toAgentRecord);
    },

    async getAgentRecord(
      tenantId: string,
      agentId: string
    ): Promise<RegistryAgentRecord | undefined> {
      const { data, error } = await dbFor(tenantId)
        .from("engenty_ai_agents")
        .select()
        .eq("tenant_id", tenantId)
        .eq("agent_id", agentId)
        .maybeSingle();
      if (error) {
        throw new Error(`getAgentRecord: ${error.message}`);
      }
      if (!data) {
        return;
      }
      return toAgentRecord(data as RegistryAgentRow);
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
      options: {
        proposedByAgent?: string | null;
        proposedSpaceId?: string | null;
      } = {}
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
      const configColumns = agentRowWriteColumns(config);
      const isRevision = row && (row.status ?? "active") === "active";
      // A revision must be a plain UPDATE: an upsert's insert tuple is checked
      // against NOT NULL columns before the conflict fires, so a
      // proposed_config-only upsert can never succeed.
      const { data, error } = isRevision
        ? await dbFor(tenantId)
            .from("engenty_ai_agents")
            .update({ proposed_config: configColumns })
            .eq("tenant_id", tenantId)
            .eq("agent_id", config.id)
            .select()
            .single()
        : await dbFor(tenantId)
            .from("engenty_ai_agents")
            .upsert(
              {
                tenant_id: tenantId,
                agent_id: config.id,
                ...configColumns,
                status: "proposed",
                created_by_agent:
                  options.proposedByAgent ?? row?.created_by_agent ?? null,
                // Stamp only on a NEW proposal. Revisions keep the live agent
                // where it already is; remounting on approve would be a
                // surprise.
                proposed_space_id:
                  options.proposedSpaceId ?? row?.proposed_space_id ?? null,
              },
              { onConflict: "tenant_id, agent_id" }
            )
            .select()
            .single();
      if (error) {
        throw new Error(`proposeAgent: ${error.message}`);
      }
      return toAgentRecord(data as RegistryAgentRow);
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
        patch = { status: "active", proposed_space_id: null };
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
            ...agentRowWriteColumns(config),
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
