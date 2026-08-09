import {
  foreignSelect,
  type PluginServerGatewayCaller,
  type TenantScope,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createProjectLinkedTask,
  listProjectLinkedTasks,
} from "../lib/project-tasks-bridge.js";

export interface PortalSettings {
  portal_enabled: boolean;
  portal_intro_text: string | null;
  portal_password: string | null;
}

export interface PublicProjectInfo {
  entity: { display_name: string } | null;
  id: string;
  password_required: boolean;
  portal_intro_text: string | null;
  title: string;
}

export interface PublicPhase {
  end_date: string | null;
  id: string;
  order_index: number;
  start_date: string | null;
  tasks: PublicTask[];
  title: string;
}

export interface PublicTask {
  attachment_count?: number;
  comment_count?: number;
  content: string | null;
  created_at: string;
  discipline: string | null;
  hours: number | null;
  id: string;
  order_index: number;
  status: string;
  title: string;
}

/**
 * A `module_contacts.contacts` row. Cross-schema reads come back untyped —
 * their shape is the owning module's contract, not ours — so the one column
 * this file relies on is named explicitly at the boundary.
 */
interface ForeignContactRow {
  display_name: string | null;
}

function toPublicTask(task: {
  id: string;
  title: string;
  content: string | null;
  status: string;
  discipline: string | null;
  hours: number | null;
  order_index: number;
  created_at: string;
}): PublicTask {
  return {
    id: task.id,
    title: task.title,
    content: task.content,
    status: task.status,
    discipline: task.discipline,
    hours: task.hours,
    order_index: task.order_index,
    created_at: task.created_at,
  };
}

export function createPortalDAL(
  adapter: unknown,
  deps: {
    invokeOperation: PluginServerGatewayCaller["invokeOperation"];
  }
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_projects";
  const { invokeOperation } = deps;

  return {
    async getPortalSettings(projectId: string): Promise<PortalSettings | null> {
      const { data, error } = await supabase
        .schema(schema)
        .from("projects")
        .select("portal_enabled, portal_password, portal_intro_text")
        .eq("id", projectId)
        .single();
      if (error || !data) {
        return null;
      }
      return {
        portal_enabled: Boolean(data.portal_enabled),
        portal_password: (data.portal_password as string | null) ?? null,
        portal_intro_text: (data.portal_intro_text as string | null) ?? null,
      };
    },

    async getPublicProjectInfo(
      projectId: string
    ): Promise<PublicProjectInfo | null> {
      const { data, error } = await supabase
        .schema(schema)
        .from("projects")
        .select(
          "id, title, portal_intro_text, client_id, client_name, portal_password, tenant_id, scope_id"
        )
        .eq("id", projectId)
        .eq("portal_enabled", true)
        .single();
      if (error || !data) {
        return null;
      }

      const project = data as Record<string, unknown>;
      const clientId = project.client_id as string | null;
      const clientName = project.client_name as string | null;
      let entity: { display_name: string } | null = null;
      if (clientId) {
        // The portal visitor is anonymous, so the tenant boundary comes from
        // the project row itself: `client_id` is a plain text column with no
        // foreign key, so nothing but these filters keeps this read inside the
        // project's own tenant. The adapter is service-role and bypasses RLS.
        const scope: TenantScope = {
          scopeId: String(project.scope_id),
          tenantId: String(project.tenant_id),
        };
        const { data: contactData } = await foreignSelect(supabase, scope, {
          columns: "display_name",
          schema: "module_contacts",
          table: "contacts",
        })
          .eq("id", clientId)
          .maybeSingle();
        const contact = contactData as ForeignContactRow | null;
        if (contact?.display_name) {
          entity = { display_name: String(contact.display_name) };
        }
      }
      if (!entity && clientName?.trim()) {
        entity = { display_name: clientName.trim() };
      }

      return {
        id: String(project.id),
        title: String(project.title),
        portal_intro_text: (project.portal_intro_text as string | null) ?? null,
        password_required: Boolean(
          (project.portal_password as string | null)?.trim()
        ),
        entity,
      };
    },

    async getPublicPhasesAndTasks(projectId: string): Promise<PublicPhase[]> {
      const { data: phasesData, error: phasesError } = await supabase
        .schema(schema)
        .from("project_phases")
        .select(
          "id, title, start_date, end_date, order_index, tenant_id, scope_id"
        )
        .eq("project_id", projectId)
        .eq("is_public", true)
        .order("order_index");

      if (phasesError || !phasesData) {
        return [];
      }

      const phases = phasesData as Record<string, unknown>[];
      const result: PublicPhase[] = [];

      for (const p of phases) {
        const phaseId = String(p.id);
        const tenantId = String(p.tenant_id);
        const scopeId = String(p.scope_id);
        const phaseTasks = await listProjectLinkedTasks(
          supabase,
          tenantId,
          scopeId,
          projectId,
          { phaseId, publicOnly: true }
        );
        result.push({
          id: phaseId,
          title: String(p.title),
          start_date: (p.start_date as string | null) ?? null,
          end_date: (p.end_date as string | null) ?? null,
          order_index: Number(p.order_index ?? 0),
          tasks: phaseTasks.map((t) => toPublicTask(t)),
        });
      }

      return result;
    },

    async getPublicGeneralTasks(projectId: string): Promise<PublicTask[]> {
      const { data: proj, error } = await supabase
        .schema(schema)
        .from("projects")
        .select("tenant_id, scope_id")
        .eq("id", projectId)
        .single();
      if (error || !proj) {
        return [];
      }
      const tenantId = String((proj as { tenant_id: string }).tenant_id);
      const scopeId = String((proj as { scope_id: string }).scope_id);
      const tasks = await listProjectLinkedTasks(
        supabase,
        tenantId,
        scopeId,
        projectId,
        { phaseId: null, publicOnly: true }
      );
      return tasks.map((t) => toPublicTask(t));
    },

    async verifyPortalPassword(
      projectId: string,
      password: string
    ): Promise<boolean> {
      const settings = await this.getPortalSettings(projectId);
      if (!settings?.portal_enabled) {
        return false;
      }
      if (!settings.portal_password) {
        return true;
      }
      return settings.portal_password === password;
    },

    async createRequestTask(
      projectId: string,
      input: { title: string; content: string | null }
    ): Promise<Record<string, unknown> | null> {
      const { data: proj, error: projErr } = await supabase
        .schema(schema)
        .from("projects")
        .select("id, tenant_id, scope_id")
        .eq("id", projectId)
        .eq("portal_enabled", true)
        .single();
      if (projErr || !proj) {
        return null;
      }

      const tenantId = String((proj as { tenant_id: string }).tenant_id);
      const scopeId = String((proj as { scope_id: string }).scope_id);
      const invokeTasks = (
        operationId:
          | "tasks_create"
          | "tasks_update"
          | "tasks_delete"
          | "tasks_list",
        input: Record<string, unknown>
      ) =>
        invokeOperation(operationId, input, {
          // The portal visitor is anonymous — there is no principal and no
          // human who could answer an approval, so this is the module acting
          // as a service on the project's behalf. The authority is stated
          // here, narrowly (task writes only, in the project's own tenant),
          // instead of arriving as an empty context the in-process gate has
          // to guess about: the route already established that this project
          // has the portal enabled, which is the real access check.
          auth: {
            tenantId,
            scopeId,
            principalId: "",
            principalType: "service",
            capabilities: ["module.tasks.write"],
          },
        });

      const created = await createProjectLinkedTask(invokeTasks, projectId, {
        project_id: projectId,
        phase_id: null,
        title: input.title,
        content: input.content,
        discipline: null,
        hours: null,
        status: "request",
        is_public: true,
        order_index: 0,
      });

      const p = proj as Record<string, unknown>;
      return {
        id: created.id,
        tenant_id: String(p.tenant_id),
        scope_id: String(p.scope_id),
        project_id: projectId,
        phase_id: null,
        title: created.title,
        content: created.content,
        discipline: created.discipline,
        hours: created.hours,
        status: created.status,
        is_public: created.is_public,
        order_index: created.order_index,
        created_at: created.created_at,
        updated_at: created.updated_at,
      };
    },

    async getPublicTask(
      projectId: string,
      taskId: string
    ): Promise<PublicTask | null> {
      const { data: proj, error } = await supabase
        .schema(schema)
        .from("projects")
        .select("tenant_id, scope_id")
        .eq("id", projectId)
        .single();
      if (error || !proj) {
        return null;
      }
      const tenantId = String((proj as { tenant_id: string }).tenant_id);
      const scopeId = String((proj as { scope_id: string }).scope_id);
      const linked = await listProjectLinkedTasks(
        supabase,
        tenantId,
        scopeId,
        projectId,
        { publicOnly: true }
      );
      const task = linked.find((t) => t.id === taskId);
      if (!task) {
        return null;
      }
      return toPublicTask(task);
    },
  };
}
