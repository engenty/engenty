// DAL for module_tasks.triggers + module_tasks.task_templates.
//
// A Trigger is the single "reason work starts" (schedule | event | manual);
// it always references a task template. Schedule triggers are backed by
// Mastra heartbeats — `heartbeat_id` + the bookkeeping columns
// (last_fired_at / last_result) are written by the scheduler hook in apps/ai.
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  TaskTemplate,
  Trigger,
  TriggerDetail,
  TriggerKind,
  TriggerSource,
} from "../schema/types.js";

const SCHEMA = "module_tasks";

export interface TaskTemplateCreateInput {
  agent_type_key: string;
  description?: string | null;
  name: string;
  priority?: TaskTemplate["priority"];
  title: string;
}

export type TaskTemplateUpdateInput = Partial<TaskTemplateCreateInput>;

export interface TriggerCreateInput {
  cron?: string | null;
  description?: string | null;
  enabled?: boolean;
  kind: TriggerKind;
  module_id?: string | null;
  module_key?: string | null;
  name: string;
  quiet_hours?: string | null;
  source?: TriggerSource;
  task_template_id: string;
  timezone?: string | null;
}

export interface TriggerUpdateInput {
  cron?: string | null;
  description?: string | null;
  enabled?: boolean;
  heartbeat_id?: string | null;
  name?: string;
  quiet_hours?: string | null;
  task_template_id?: string;
  timezone?: string | null;
}

export interface TriggersListFilter {
  enabled?: boolean;
  kind?: TriggerKind;
  source?: TriggerSource;
}

function rowToTemplate(row: Record<string, unknown>): TaskTemplate {
  return {
    agent_type_key: String(row.agent_type_key),
    created_at: String(row.created_at),
    description: (row.description as string | null) ?? null,
    id: String(row.id),
    name: String(row.name),
    priority: row.priority as TaskTemplate["priority"],
    scope_id: String(row.scope_id),
    tenant_id: String(row.tenant_id),
    title: String(row.title),
    updated_at: String(row.updated_at),
  };
}

function rowToTrigger(row: Record<string, unknown>): Trigger {
  return {
    created_at: String(row.created_at),
    cron: (row.cron as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    enabled: Boolean(row.enabled),
    event_filter: (row.event_filter as Record<string, unknown> | null) ?? null,
    heartbeat_id: (row.heartbeat_id as string | null) ?? null,
    id: String(row.id),
    kind: row.kind as TriggerKind,
    last_fired_at: (row.last_fired_at as string | null) ?? null,
    last_result: (row.last_result as string | null) ?? null,
    module_id: (row.module_id as string | null) ?? null,
    module_key: (row.module_key as string | null) ?? null,
    name: String(row.name),
    provider_id: (row.provider_id as string | null) ?? null,
    quiet_hours: (row.quiet_hours as string | null) ?? null,
    resource: (row.resource as string | null) ?? null,
    scope_id: String(row.scope_id),
    source: row.source as TriggerSource,
    task_template_id: String(row.task_template_id),
    tenant_id: String(row.tenant_id),
    timezone: (row.timezone as string | null) ?? null,
    updated_at: String(row.updated_at),
  };
}

export function createTriggersRepoSupabase(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
) {
  const templates = () => supabase.schema(SCHEMA).from("task_templates");
  const triggers = () => supabase.schema(SCHEMA).from("triggers");

  return {
    async createTaskTemplate(
      input: TaskTemplateCreateInput,
      createdByUserId?: string | null
    ): Promise<TaskTemplate> {
      const now = new Date().toISOString();
      const { data, error } = await templates()
        .insert({
          agent_type_key: input.agent_type_key,
          created_at: now,
          created_by_user_id: createdByUserId ?? null,
          description: input.description ?? null,
          id: uuidv7(),
          name: input.name.trim(),
          priority: input.priority ?? "medium",
          scope_id: scopeId,
          tenant_id: tenantId,
          title: input.title.trim(),
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) {
        throw new Error(`Failed to create task template: ${error.message}`);
      }
      return rowToTemplate(data as Record<string, unknown>);
    },

    async getTaskTemplate(id: string): Promise<TaskTemplate | null> {
      const { data, error } = await templates()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to load task template: ${error.message}`);
      }
      return data ? rowToTemplate(data as Record<string, unknown>) : null;
    },

    async updateTaskTemplate(
      id: string,
      patch: TaskTemplateUpdateInput
    ): Promise<TaskTemplate | null> {
      const { data, error } = await templates()
        .update({
          ...(patch.agent_type_key === undefined
            ? {}
            : { agent_type_key: patch.agent_type_key }),
          ...(patch.description === undefined
            ? {}
            : { description: patch.description ?? null }),
          ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
          ...(patch.priority === undefined ? {} : { priority: patch.priority }),
          ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select("*")
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to update task template: ${error.message}`);
      }
      return data ? rowToTemplate(data as Record<string, unknown>) : null;
    },

    async listTaskTemplates(): Promise<TaskTemplate[]> {
      const { data, error } = await templates()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("updated_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to list task templates: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToTemplate(row as Record<string, unknown>)
      );
    },

    async createTrigger(
      input: TriggerCreateInput,
      createdByUserId?: string | null
    ): Promise<Trigger> {
      const now = new Date().toISOString();
      const { data, error } = await triggers()
        .insert({
          created_at: now,
          created_by_user_id: createdByUserId ?? null,
          cron: input.cron ?? null,
          description: input.description ?? null,
          enabled: input.enabled ?? true,
          id: uuidv7(),
          kind: input.kind,
          module_id: input.module_id ?? null,
          module_key: input.module_key ?? null,
          name: input.name.trim(),
          quiet_hours: input.quiet_hours ?? null,
          scope_id: scopeId,
          source: input.source ?? "custom",
          task_template_id: input.task_template_id,
          tenant_id: tenantId,
          timezone: input.timezone ?? null,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) {
        throw new Error(`Failed to create trigger: ${error.message}`);
      }
      return rowToTrigger(data as Record<string, unknown>);
    },

    async getTrigger(id: string): Promise<TriggerDetail | null> {
      const { data, error } = await triggers()
        .select("*, task_template:task_templates(*)")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to load trigger: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      const { task_template, ...row } = data as Record<string, unknown> & {
        task_template: Record<string, unknown> | null;
      };
      return {
        ...rowToTrigger(row),
        task_template: task_template ? rowToTemplate(task_template) : null,
      };
    },

    async getTriggerByModuleKey(
      moduleId: string,
      moduleKey: string
    ): Promise<Trigger | null> {
      const { data, error } = await triggers()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("module_id", moduleId)
        .eq("module_key", moduleKey)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to load module trigger: ${error.message}`);
      }
      return data ? rowToTrigger(data as Record<string, unknown>) : null;
    },

    async updateTrigger(
      id: string,
      patch: TriggerUpdateInput
    ): Promise<Trigger | null> {
      const { data, error } = await triggers()
        .update({
          ...(patch.cron === undefined ? {} : { cron: patch.cron ?? null }),
          ...(patch.description === undefined
            ? {}
            : { description: patch.description ?? null }),
          ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
          ...(patch.heartbeat_id === undefined
            ? {}
            : { heartbeat_id: patch.heartbeat_id ?? null }),
          ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
          ...(patch.quiet_hours === undefined
            ? {}
            : { quiet_hours: patch.quiet_hours ?? null }),
          ...(patch.task_template_id === undefined
            ? {}
            : { task_template_id: patch.task_template_id }),
          ...(patch.timezone === undefined
            ? {}
            : { timezone: patch.timezone ?? null }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select("*")
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to update trigger: ${error.message}`);
      }
      return data ? rowToTrigger(data as Record<string, unknown>) : null;
    },

    /** Bookkeeping write from the scheduler hook — bypasses updated_at churn rules on purpose (it IS an update). */
    async recordTriggerFire(id: string, result: string): Promise<void> {
      const { error } = await triggers()
        .update({
          last_fired_at: new Date().toISOString(),
          last_result: result.slice(0, 2000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) {
        throw new Error(`Failed to record trigger fire: ${error.message}`);
      }
    },

    async deleteTrigger(id: string): Promise<boolean> {
      const { data, error } = await triggers()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select("id")
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to delete trigger: ${error.message}`);
      }
      return Boolean(data);
    },

    async listTriggers(filter?: TriggersListFilter): Promise<TriggerDetail[]> {
      let query = triggers()
        .select("*, task_template:task_templates(*)")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("updated_at", { ascending: false });
      if (filter?.kind) {
        query = query.eq("kind", filter.kind);
      }
      if (filter?.source) {
        query = query.eq("source", filter.source);
      }
      if (filter?.enabled !== undefined) {
        query = query.eq("enabled", filter.enabled);
      }
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to list triggers: ${error.message}`);
      }
      return (data ?? []).map((raw) => {
        const { task_template, ...row } = raw as Record<string, unknown> & {
          task_template: Record<string, unknown> | null;
        };
        return {
          ...rowToTrigger(row),
          task_template: task_template ? rowToTemplate(task_template) : null,
        };
      });
    },
  };
}

export type TriggersRepo = ReturnType<typeof createTriggersRepoSupabase>;
