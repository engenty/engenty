// DAL for `ai.workflow` + `ai.workflow_version` — governed flow
// definitions (PLAN-workflow-designer.md).
//
// The invariant this store exists to protect: **versions are immutable**. There
// is no update path for a version's graph. `saveVersion` always mints
// `max(version) + 1`; publishing points the definition at an existing version.
// A run pins a version id and reads that row, which never changes underneath it
// — which is what makes a `sleepUntil` run that wakes three days later safe.
import type { SupabaseClient } from "@supabase/supabase-js";

const SCHEMA = "ai";

export type WorkflowStatus = "draft" | "active" | "disabled";
export type WorkflowAuthoredBy = "user" | "copilot" | "system";

export interface WorkflowRow {
  context_type: string | null;
  created_at: string;
  created_by_user_id: string | null;
  current_version: number | null;
  description: string | null;
  id: string;
  module_id: string | null;
  name: string;
  /** Owning specialist (decision B); null = library (the shared subset). */
  owner_agent_id: string | null;
  /** Module workflow this row reconciles from; null on an authored flow. */
  source_workflow_id: string | null;
  status: WorkflowStatus;
  tenant_id: string;
  /** Display title, generated once at save when absent; `name` is the key. */
  title: string | null;
  updated_at: string;
}

export interface WorkflowVersionRow {
  allowed_tools: string[] | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  authored_by: WorkflowAuthoredBy;
  created_at: string;
  created_by_user_id: string | null;
  /** Mastra StoredWorkflowGraph JSON. */
  graph: Record<string, unknown>;
  id: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  tenant_id: string;
  version: number;
  workflow_id: string;
}

export interface WorkflowWithVersion {
  graph: WorkflowRow;
  version: WorkflowVersionRow;
}

export interface CreateWorkflowInput {
  contextType?: string | null;
  createdByUserId?: string | null;
  description?: string | null;
  moduleId?: string | null;
  name: string;
  /** Owning specialist (decision B); omit for a library workflow. */
  ownerAgentId?: string | null;
  /** Set only by the module-workflow reconcile — marks the row as derived. */
  sourceWorkflowId?: string | null;
  tenantId: string;
  title?: string | null;
}

export interface SaveVersionInput {
  allowedTools?: string[] | null;
  authoredBy?: WorkflowAuthoredBy;
  createdByUserId?: string | null;
  graph: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  tenantId: string;
  workflowId: string;
}

export interface WorkflowStore {
  create(input: CreateWorkflowInput): Promise<WorkflowRow>;
  /** The row a module workflow reconciled into, if this tenant has one yet. */
  findBySourceWorkflow(input: {
    sourceWorkflowId: string;
    tenantId: string;
  }): Promise<WorkflowRow | null>;
  /** Definition + the version dispatch should run. Null when not publishable. */
  getCurrent(input: {
    id: string;
    tenantId: string;
  }): Promise<WorkflowWithVersion | null>;
  getGraph(input: {
    id: string;
    tenantId: string;
  }): Promise<WorkflowRow | null>;
  getVersion(input: {
    id: string;
    tenantId: string;
  }): Promise<WorkflowVersionRow | null>;
  list(input: {
    contextType?: string | null;
    status?: WorkflowStatus;
    tenantId: string;
  }): Promise<WorkflowRow[]>;
  listVersions(input: {
    workflowId: string;
    tenantId: string;
  }): Promise<WorkflowVersionRow[]>;
  /** Approve a version and point the definition at it (publish). */
  publishVersion(input: {
    approvedByUserId?: string | null;
    tenantId: string;
    versionId: string;
  }): Promise<WorkflowWithVersion>;
  remove(input: { id: string; tenantId: string }): Promise<void>;
  /** Mint the next immutable version. Never overwrites an existing one. */
  saveVersion(input: SaveVersionInput): Promise<WorkflowVersionRow>;
  setStatus(input: {
    id: string;
    status: WorkflowStatus;
    tenantId: string;
  }): Promise<WorkflowRow>;
  update(input: {
    contextType?: string | null;
    description?: string | null;
    id: string;
    name?: string;
    tenantId: string;
    title?: string | null;
  }): Promise<WorkflowRow>;
}

export function createWorkflowStore(client: SupabaseClient): WorkflowStore {
  const db = client.schema(SCHEMA);

  async function getGraph(input: { id: string; tenantId: string }) {
    const { data, error } = await db
      .from("workflow")
      .select()
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .maybeSingle();
    if (error) {
      throw new Error(`workflow select: ${error.message}`);
    }
    return (data as WorkflowRow | null) ?? null;
  }

  async function getVersion(input: { id: string; tenantId: string }) {
    const { data, error } = await db
      .from("workflow_version")
      .select()
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .maybeSingle();
    if (error) {
      throw new Error(`workflow_version select: ${error.message}`);
    }
    return (data as WorkflowVersionRow | null) ?? null;
  }

  return {
    async create(input) {
      const { data, error } = await db
        .from("workflow")
        .insert({
          context_type: input.contextType ?? null,
          created_by_user_id: input.createdByUserId ?? null,
          description: input.description ?? null,
          module_id: input.moduleId ?? null,
          name: input.name,
          owner_agent_id: input.ownerAgentId ?? null,
          source_workflow_id: input.sourceWorkflowId ?? null,
          status: "draft",
          tenant_id: input.tenantId,
          title: input.title ?? null,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`workflow insert: ${error.message}`);
      }
      return data as WorkflowRow;
    },

    async findBySourceWorkflow(input) {
      const { data, error } = await db
        .from("workflow")
        .select()
        .eq("tenant_id", input.tenantId)
        .eq("source_workflow_id", input.sourceWorkflowId)
        .maybeSingle();
      if (error) {
        throw new Error(`workflow select: ${error.message}`);
      }
      return (data as WorkflowRow | null) ?? null;
    },

    getGraph,
    getVersion,

    async getCurrent(input) {
      const graph = await getGraph(input);
      if (!graph?.current_version) {
        return null;
      }
      const { data, error } = await db
        .from("workflow_version")
        .select()
        .eq("tenant_id", input.tenantId)
        .eq("workflow_id", graph.id)
        .eq("version", graph.current_version)
        .maybeSingle();
      if (error) {
        throw new Error(`workflow_version select: ${error.message}`);
      }
      const version = (data as WorkflowVersionRow | null) ?? null;
      // A published version must be approved — the pointer alone is not
      // authorization to run tenant-authored code.
      if (!version?.approved_at) {
        return null;
      }
      return { graph, version };
    },

    async list(input) {
      let query = db
        .from("workflow")
        .select()
        .eq("tenant_id", input.tenantId)
        .order("name", { ascending: true });
      if (input.status) {
        query = query.eq("status", input.status);
      }
      if (input.contextType) {
        query = query.eq("context_type", input.contextType);
      }
      const { data, error } = await query;
      if (error) {
        throw new Error(`workflow list: ${error.message}`);
      }
      return (data ?? []) as WorkflowRow[];
    },

    async listVersions(input) {
      const { data, error } = await db
        .from("workflow_version")
        .select()
        .eq("tenant_id", input.tenantId)
        .eq("workflow_id", input.workflowId)
        .order("version", { ascending: false });
      if (error) {
        throw new Error(`workflow_version list: ${error.message}`);
      }
      return (data ?? []) as WorkflowVersionRow[];
    },

    async saveVersion(input) {
      // Next version number. A unique constraint on (workflow_id, version)
      // makes a concurrent double-save fail loudly rather than silently
      // clobbering — the caller retries and gets a distinct version.
      const { data: latest, error: latestError } = await db
        .from("workflow_version")
        .select("version")
        .eq("tenant_id", input.tenantId)
        .eq("workflow_id", input.workflowId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) {
        throw new Error(`workflow_version max: ${latestError.message}`);
      }
      const nextVersion =
        ((latest as { version?: number } | null)?.version ?? 0) + 1;

      const { data, error } = await db
        .from("workflow_version")
        .insert({
          workflow_id: input.workflowId,
          allowed_tools: input.allowedTools ?? null,
          authored_by: input.authoredBy ?? "user",
          created_by_user_id: input.createdByUserId ?? null,
          graph: input.graph,
          input_schema: input.inputSchema ?? {},
          output_schema: input.outputSchema ?? {},
          tenant_id: input.tenantId,
          version: nextVersion,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`workflow_version insert: ${error.message}`);
      }
      return data as WorkflowVersionRow;
    },

    async publishVersion(input) {
      const version = await getVersion({
        id: input.versionId,
        tenantId: input.tenantId,
      });
      if (!version) {
        throw new Error("workflow_version not found");
      }
      const { data: approved, error: approveError } = await db
        .from("workflow_version")
        .update({
          approved_at: new Date().toISOString(),
          approved_by_user_id: input.approvedByUserId ?? null,
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", input.versionId)
        .select()
        .single();
      if (approveError) {
        throw new Error(`workflow_version approve: ${approveError.message}`);
      }
      const { data: graph, error: graphError } = await db
        .from("workflow")
        .update({
          current_version: version.version,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", version.workflow_id)
        .select()
        .single();
      if (graphError) {
        throw new Error(`workflow publish: ${graphError.message}`);
      }
      return {
        graph: graph as WorkflowRow,
        version: approved as WorkflowVersionRow,
      };
    },

    async setStatus(input) {
      const { data, error } = await db
        .from("workflow")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("tenant_id", input.tenantId)
        .eq("id", input.id)
        .select()
        .single();
      if (error) {
        throw new Error(`workflow status: ${error.message}`);
      }
      return data as WorkflowRow;
    },

    async update(input) {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.name !== undefined) {
        patch.name = input.name;
      }
      if (input.description !== undefined) {
        patch.description = input.description;
      }
      if (input.contextType !== undefined) {
        patch.context_type = input.contextType;
      }
      if (input.title !== undefined) {
        patch.title = input.title;
      }
      const { data, error } = await db
        .from("workflow")
        .update(patch)
        .eq("tenant_id", input.tenantId)
        .eq("id", input.id)
        .select()
        .single();
      if (error) {
        throw new Error(`workflow update: ${error.message}`);
      }
      return data as WorkflowRow;
    },

    async remove(input) {
      // Versions cascade; runs pinned to a version block the delete via
      // ON DELETE RESTRICT on workflow_run.workflow_version_id. That
      // error is the referential guard — surface it, don't swallow it.
      const { error } = await db
        .from("workflow")
        .delete()
        .eq("tenant_id", input.tenantId)
        .eq("id", input.id);
      if (error) {
        throw new Error(
          `workflow delete: ${error.message} (runs may still reference a version of this action)`
        );
      }
    },
  };
}
