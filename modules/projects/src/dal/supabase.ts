import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import {
  countProjectAssociatedTasks,
  createProjectLinkedTask,
  deleteProjectLinkedTask,
  type InvokeTasksFn,
  listProjectAssociatedTaskIds,
  listProjectLinkedTasks,
  listProjectTaskAssigneeUserIds,
  listProjectTasksPaginated,
  updateProjectLinkedTask,
} from "../lib/project-tasks-bridge.js";
import { resolveTaskCollaboratorUserIds } from "../lib/resolve-task-collaborator-user-ids.js";
import {
  definitionsToSettingsSlice,
  mergeTaskStatusDefinitionsFromPayload,
  normalizeTaskStatusDefinitionsFromStorage,
  serializeTaskStatusDefinitionsForStorage,
} from "../lib/task-status-settings.js";
import type {
  PhaseTask,
  PhaseTaskInput,
  PhaseTaskUpdateInput,
  Project,
  ProjectInput,
  ProjectMemberRole,
  ProjectPhase,
  ProjectPhaseInput,
  ProjectPhaseUpdateInput,
  ProjectSettings,
  ProjectSettingsInput,
  ProjectsPaginatedResponse,
  ProjectsQueryParams,
  ProjectTaskCountsByStatus,
  ProjectTasksPaginatedResponse,
  ProjectTasksQueryParams,
  ProjectTeamMember,
  ProjectTeamMemberUpdate,
  ProjectUpdateInput,
  ProjectWithPhasesAndTasks,
} from "../schema/types.js";

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  briefing_overdue_days: 7,
  ...definitionsToSettingsSlice(
    BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => ({ ...d }))
  ),
};

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    client_id: (row.client_id as string | null) ?? null,
    client_name: (row.client_name as string | null) ?? null,
    lead_id: (row.lead_id as string | null) ?? null,
    title: String(row.title ?? ""),
    briefing: (row.briefing as string | null) ?? null,
    start_date: (row.start_date as string | null) ?? null,
    end_date: (row.end_date as string | null) ?? null,
    portal_enabled: Boolean(row.portal_enabled),
    portal_password: (row.portal_password as string | null) ?? null,
    portal_intro_text: (row.portal_intro_text as string | null) ?? null,
    visibility:
      (row.visibility as "tenant" | "members" | undefined) ?? "tenant",
    enabled_tabs: (row.enabled_tabs as string[] | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToPhase(row: Record<string, unknown>): ProjectPhase {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    project_id: String(row.project_id),
    title: String(row.title ?? ""),
    start_date: (row.start_date as string | null) ?? null,
    end_date: (row.end_date as string | null) ?? null,
    is_main: Boolean(row.is_main),
    is_public: Boolean(row.is_public),
    order_index: Number(row.order_index ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSortBy(sortBy?: ProjectsQueryParams["sortBy"]): string {
  const map: Record<NonNullable<ProjectsQueryParams["sortBy"]>, string> = {
    title: "title",
    start_date: "start_date",
    end_date: "end_date",
    created_at: "created_at",
  };
  return sortBy ? (map[sortBy] ?? "created_at") : "created_at";
}

function mapProjectTeamMembersFromNested(
  projectId: string,
  nested: unknown
): ProjectTeamMember[] {
  if (!Array.isArray(nested)) {
    return [];
  }
  return nested.map(
    (m: {
      project_id?: string;
      user_id?: string;
      role?: string;
      role_name?: string | null;
    }) => ({
      project_id: String(m.project_id ?? projectId),
      user_id: String(m.user_id),
      role: (m.role as ProjectMemberRole) ?? "project-member",
      role_name: m.role_name ?? null,
    })
  );
}

function projectRowToProject(row: Record<string, unknown>): Project {
  const { project_team: nested, ...rest } = row;
  const base = rowToProject(rest as Record<string, unknown>);
  const members = mapProjectTeamMembersFromNested(base.id, nested);
  if (members.length === 0) {
    return base;
  }
  return { ...base, project_team: members };
}

export interface ProjectRepoAuditOptions {
  recordAuditEvent: (event: {
    type: string;
    detail?: Record<string, unknown>;
  }) => void;
}

export interface ProjectRepoDeps {
  audit?: ProjectRepoAuditOptions;
  invokeTasks: InvokeTasksFn;
  /**
   * Phase 2 project visibility. Service-role reads bypass RLS, so members-only
   * projects must be filtered out of list results in the DAL. When
   * `seesAllProjects` is false, listPaginated returns only tenant-visible
   * projects plus those the viewer is a team member of. Omit (or set
   * seesAllProjects) for admin/moderator/system callers.
   */
  viewer?: { userId: string; seesAllProjects: boolean };
}

export type ProjectRepoSupabase = ReturnType<typeof createProjectRepoSupabase>;

export function createProjectRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string,
  deps: ProjectRepoDeps
) {
  const supabase = adapter as SupabaseClient;
  const { invokeTasks, audit, viewer } = deps;
  const schema = "module_projects";
  const projects = () => supabase.schema(schema).from("projects");
  const phases = () => supabase.schema(schema).from("project_phases");
  const settings = () => supabase.schema(schema).from("project_settings");
  const projectTeamMembers = () => supabase.schema(schema).from("project_team");

  const record = (type: string, detail?: Record<string, unknown>) => {
    audit?.recordAuditEvent?.({ type, detail });
  };

  async function insertProjectMemberRows(
    projectId: string,
    members: Array<{
      user_id: string;
      role?: ProjectMemberRole;
      role_name?: string | null;
    }>
  ): Promise<void> {
    const seen = new Set<string>();
    const rows: Array<{
      project_id: string;
      user_id: string;
      role: ProjectMemberRole;
      role_name: string | null;
    }> = [];
    for (const m of members) {
      if (!m.user_id?.trim() || seen.has(m.user_id)) {
        continue;
      }
      seen.add(m.user_id);
      rows.push({
        project_id: projectId,
        user_id: m.user_id,
        role: m.role ?? "project-member",
        role_name: m.role_name ?? null,
      });
    }
    if (rows.length === 0) {
      return;
    }
    const { error } = await projectTeamMembers().insert(rows);
    if (error) {
      throw new Error(`Failed to add project team members: ${error.message}`);
    }
  }

  async function listProjectMemberUserIds(
    projectId: string
  ): Promise<string[]> {
    const { data, error } = await projectTeamMembers()
      .select("user_id")
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to list project team members: ${error.message}`);
    }
    return (data ?? []).map((r: { user_id: string }) => String(r.user_id));
  }

  async function listTaskAssigneeUserIds(projectId: string): Promise<string[]> {
    return listProjectTaskAssigneeUserIds(
      supabase,
      tenantId,
      scopeId,
      projectId
    );
  }

  async function mergeTaskAssigneesIntoMembers(
    projectId: string,
    members: ProjectTeamMember[]
  ): Promise<ProjectTeamMember[]> {
    const existingIds = new Set(members.map((m) => m.user_id));
    const assigneeIds = await listTaskAssigneeUserIds(projectId);
    const toAdd = assigneeIds.filter((id) => !existingIds.has(id));
    if (toAdd.length === 0) {
      return members;
    }
    const added: ProjectTeamMember[] = toAdd.map((user_id) => ({
      project_id: projectId,
      user_id,
      role: "project-member" as const,
      role_name: null,
    }));
    return [...members, ...added];
  }

  async function isUserAssignedToTaskInProject(
    projectId: string,
    userId: string
  ): Promise<boolean> {
    const assignees = await listTaskAssigneeUserIds(projectId);
    return assignees.includes(userId);
  }

  async function unassignUserFromProjectTasks(
    projectId: string,
    userId: string
  ): Promise<void> {
    const linked = await listProjectLinkedTasks(
      supabase,
      tenantId,
      scopeId,
      projectId
    );
    for (const task of linked) {
      const members = (task.task_team ?? []).map((m) => m.user_id);
      if (!members.includes(userId)) {
        continue;
      }
      await updateProjectLinkedTask(
        invokeTasks,
        supabase,
        tenantId,
        scopeId,
        projectId,
        task.id,
        {
          team_member_ids: members.filter((id) => id !== userId),
        }
      );
    }
  }

  async function replaceProjectTeamMembers(
    projectId: string,
    newMembers: Array<{
      user_id: string;
      role?: ProjectMemberRole;
      role_name?: string | null;
    }>
  ): Promise<void> {
    const nextUserIds = new Set(
      newMembers.map((m) => m.user_id).filter(Boolean)
    );
    const current = new Set(await listProjectMemberUserIds(projectId));
    for (const uid of current) {
      if (
        !nextUserIds.has(uid) &&
        (await isUserAssignedToTaskInProject(projectId, uid))
      ) {
        await unassignUserFromProjectTasks(projectId, uid);
      }
    }
    const { error: delErr } = await projectTeamMembers()
      .delete()
      .eq("project_id", projectId);
    if (delErr) {
      throw new Error(
        `Failed to clear project team members: ${delErr.message}`
      );
    }
    await insertProjectMemberRows(projectId, newMembers);
  }

  async function ensureProjectMembers(
    projectId: string,
    memberIds: string[]
  ): Promise<void> {
    const unique = [...new Set(memberIds.filter(Boolean))];
    if (unique.length === 0) {
      return;
    }
    const existing = new Set(await listProjectMemberUserIds(projectId));
    const toAdd = unique
      .filter((id) => !existing.has(id))
      .map((user_id) => ({ user_id }));
    if (toAdd.length === 0) {
      return;
    }
    await insertProjectMemberRows(projectId, toAdd);
  }

  return {
    async create(input: ProjectInput): Promise<Project> {
      const { team_member_ids, ...projectFields } = input;
      const id = uuidv7();
      const now = new Date().toISOString();
      const visibility = projectFields.visibility ?? "tenant";
      const portalEnabled = projectFields.portal_enabled ?? false;
      // A members-only project cannot expose the anon client portal — the
      // portal is public-by-link, which would defeat the restriction.
      if (visibility === "members" && portalEnabled) {
        throw new Error(
          "A members-only project cannot enable the client portal."
        );
      }
      const row = {
        id,
        tenant_id: tenantId,
        scope_id: scopeId,
        client_id: projectFields.client_id ?? null,
        client_name: projectFields.client_name ?? null,
        lead_id: projectFields.lead_id ?? null,
        title: projectFields.title,
        briefing: projectFields.briefing ?? null,
        start_date: projectFields.start_date ?? null,
        end_date: projectFields.end_date ?? null,
        portal_enabled: portalEnabled,
        portal_password: projectFields.portal_password ?? null,
        portal_intro_text: projectFields.portal_intro_text ?? null,
        visibility,
        enabled_tabs: projectFields.enabled_tabs ?? null,
        created_by: projectFields.created_by ?? null,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await projects().insert(row).select().single();
      if (error) {
        throw new Error(`Failed to create project: ${error.message}`);
      }
      const created = rowToProject((data ?? row) as Record<string, unknown>);
      record("projects.project.created", {
        id: created.id,
        title: created.title,
        client_id: created.client_id,
      });
      if (team_member_ids && team_member_ids.length > 0) {
        const members = team_member_ids.map((user_id) => ({
          user_id,
          role: "project-member" as const,
          role_name: null as string | null,
        }));
        await insertProjectMemberRows(created.id, members);
        return {
          ...created,
          project_team: members.map((m) => ({
            project_id: created.id,
            user_id: m.user_id,
            role: m.role,
            role_name: m.role_name,
          })),
        };
      }
      return created;
    },

    async listPaginated(
      params: ProjectsQueryParams = {}
    ): Promise<ProjectsPaginatedResponse> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
      const sortBy = mapSortBy(params.sortBy);
      const sortOrder = params.sortOrder === "asc";

      let query = projects()
        .select("*, project_team(*)", { count: "exact", head: false })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      // Project visibility (Phase 2): a restricted viewer only sees
      // tenant-visible projects plus those they are a team member of. Done as
      // two queries because PostgREST can't take a subquery inside `in.(...)`.
      if (viewer && !viewer.seesAllProjects) {
        const { data: teamRows, error: teamError } = await projectTeamMembers()
          .select("project_id")
          .eq("user_id", viewer.userId);
        if (teamError) {
          throw new Error(
            `Failed to resolve visible projects: ${teamError.message}`
          );
        }
        const memberProjectIds = [
          ...new Set(
            (teamRows ?? []).map((r: { project_id: string }) =>
              String(r.project_id)
            )
          ),
        ];
        const orParts = ["visibility.eq.tenant"];
        if (memberProjectIds.length > 0) {
          // Quote each id so ids with reserved chars survive the filter syntax.
          const quoted = memberProjectIds
            .map((id) => `"${id.replace(/"/g, '\\"')}"`)
            .join(",");
          orParts.push(`id.in.(${quoted})`);
        }
        query = query.or(orParts.join(","));
      }

      if (params.search?.trim()) {
        const search = `%${params.search.trim()}%`;
        query = query.ilike("title", search);
      }

      if (params.client_id) {
        query = query.eq("client_id", params.client_id);
      }

      if (params.lead_id) {
        query = query.eq("lead_id", params.lead_id);
      }

      const { data, error, count } = await query
        .order(sortBy, { ascending: sortOrder })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) {
        throw new Error(`Failed to list projects: ${error.message}`);
      }
      return {
        data: (data ?? []).map((row) =>
          projectRowToProject(row as Record<string, unknown>)
        ),
        total: count ?? 0,
        page,
        pageSize,
      };
    },

    async getById(id: string): Promise<Project | null> {
      const { data, error } = await projects()
        .select("*, project_team(*)")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .single();
      if (error || !data) {
        return null;
      }
      const project = projectRowToProject(data as Record<string, unknown>);
      const merged = await mergeTaskAssigneesIntoMembers(
        id,
        project.project_team ?? []
      );
      return { ...project, project_team: merged };
    },

    async getByIdWithPhasesAndTasks(
      id: string
    ): Promise<ProjectWithPhasesAndTasks | null> {
      const project = await this.getById(id);
      if (!project) {
        return null;
      }

      const { data: phasesData } = await phases()
        .select("*")
        .eq("project_id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("order_index");

      const phaseList = (phasesData ?? []) as Record<string, unknown>[];
      const phasesWithTasks: (ProjectPhase & { tasks: PhaseTask[] })[] = [];

      for (const p of phaseList) {
        const phase = rowToPhase(p);
        const phaseTasks = await listProjectLinkedTasks(
          supabase,
          tenantId,
          scopeId,
          id,
          { phaseId: phase.id }
        );
        phasesWithTasks.push({
          ...phase,
          tasks: phaseTasks,
        });
      }

      const generalTasks = await listProjectLinkedTasks(
        supabase,
        tenantId,
        scopeId,
        id,
        { phaseId: null }
      );

      return {
        ...project,
        phases: phasesWithTasks,
        general_tasks: generalTasks,
      };
    },

    async update(
      id: string,
      input: ProjectUpdateInput
    ): Promise<Project | null> {
      const existing = await this.getById(id);
      if (!existing) {
        return null;
      }
      const { team_member_ids, project_team, ...rest } = input;
      // Guard the members-only × portal combination against the effective
      // state (existing values overlaid with this patch).
      const effectiveVisibility =
        rest.visibility ?? existing.visibility ?? "tenant";
      const effectivePortal =
        rest.portal_enabled ?? existing.portal_enabled ?? false;
      if (effectiveVisibility === "members" && effectivePortal) {
        throw new Error(
          "A members-only project cannot enable the client portal."
        );
      }
      const patchEntries = Object.entries(rest).filter(
        ([, v]) => v !== undefined
      );
      if (patchEntries.length > 0) {
        const patch = Object.fromEntries(patchEntries) as Record<
          string,
          unknown
        >;
        const { data, error } = await projects()
          .update({
            ...patch,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .select()
          .single();
        if (error) {
          throw new Error(`Failed to update project: ${error.message}`);
        }
        if (data) {
          record("projects.project.updated", {
            id,
            title: (data as { title?: string }).title,
            changed_keys: Object.keys(patch),
          });
        }
      }
      if (project_team !== undefined) {
        await replaceProjectTeamMembers(
          id,
          project_team.map((m: ProjectTeamMemberUpdate) => ({
            user_id: m.user_id,
            role: m.role ?? "project-member",
            role_name: m.role_name ?? null,
          }))
        );
      } else if (team_member_ids !== undefined) {
        await replaceProjectTeamMembers(
          id,
          team_member_ids.map((uid) => ({
            user_id: uid,
            role: "project-member" as const,
            role_name: null,
          }))
        );
      }
      return this.getById(id);
    },

    async delete(
      id: string,
      opts?: { deleteTasks?: boolean }
    ): Promise<boolean> {
      const existing = await this.getById(id);
      if (!existing) {
        return false;
      }

      if (opts?.deleteTasks) {
        const linkedTaskIds = await listProjectAssociatedTaskIds(
          invokeTasks,
          supabase,
          tenantId,
          scopeId,
          id
        );
        for (const taskId of linkedTaskIds) {
          await deleteProjectLinkedTask(invokeTasks, id, taskId);
        }
      }

      // Preserve time entries that reference this project (or its phases) before
      // the cascade NULLs their project_id/phase_id, which would violate the
      // module_time_tracking_level_check constraint on entries with no other anchor.
      const { data: phaseRows } = await phases()
        .select("id")
        .eq("project_id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      const phaseIds = (phaseRows ?? []).map((p) => (p as { id: string }).id);

      const timeEntries = () =>
        supabase.schema("module_time_tracking").from("time_entries");

      // Entries anchored only via project_id
      await timeEntries()
        .update({ manual_project_title: existing.title })
        .eq("project_id", id)
        .is("task_id", null)
        .is("manual_project_title", null)
        .or("manual_task_title.is.null,manual_task_title.eq.");

      // Entries anchored only via a phase of this project
      if (phaseIds.length > 0) {
        await timeEntries()
          .update({ manual_project_title: existing.title })
          .in("phase_id", phaseIds)
          .is("project_id", null)
          .is("task_id", null)
          .is("manual_project_title", null)
          .or("manual_task_title.is.null,manual_task_title.eq.");
      }

      const { error } = await projects()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to delete project: ${error.message}`);
      }
      record("projects.project.deleted", {
        id: existing.id,
        title: existing.title,
      });
      return true;
    },

    // Phases
    async createPhase(
      projectId: string,
      input: ProjectPhaseInput
    ): Promise<ProjectPhase> {
      const id = uuidv7();
      const now = new Date().toISOString();
      const row = {
        id,
        tenant_id: tenantId,
        scope_id: scopeId,
        project_id: projectId,
        title: input.title,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        is_main: input.is_main ?? false,
        is_public: input.is_public ?? false,
        order_index: input.order_index ?? 0,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await phases().insert(row).select().single();
      if (error) {
        throw new Error(`Failed to create phase: ${error.message}`);
      }
      const created = rowToPhase((data ?? row) as Record<string, unknown>);
      record("projects.phase.created", {
        id: created.id,
        project_id: projectId,
        title: created.title,
      });
      return created;
    },

    async updatePhase(
      projectId: string,
      phaseId: string,
      input: ProjectPhaseUpdateInput
    ): Promise<ProjectPhase | null> {
      const updates: Record<string, unknown> = {
        ...input,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await phases()
        .update(updates)
        .eq("id", phaseId)
        .eq("project_id", projectId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to update phase: ${error.message}`);
      }
      const updated = data ? rowToPhase(data as Record<string, unknown>) : null;
      if (updated) {
        record("projects.phase.updated", {
          id: phaseId,
          project_id: projectId,
          title: updated.title,
          changed_keys: Object.keys(input),
        });
      }
      return updated;
    },

    async deletePhase(projectId: string, phaseId: string): Promise<boolean> {
      const { data: existing } = await phases()
        .select("id, title")
        .eq("id", phaseId)
        .eq("project_id", projectId)
        .single();
      const { error } = await phases()
        .delete()
        .eq("id", phaseId)
        .eq("project_id", projectId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to delete phase: ${error.message}`);
      }
      if (existing) {
        record("projects.phase.deleted", {
          id: phaseId,
          project_id: projectId,
          title: (existing as { title?: string }).title,
        });
      }
      return true;
    },

    async updatePhaseVisibility(
      projectId: string,
      phaseId: string,
      is_public: boolean
    ): Promise<ProjectPhase | null> {
      return this.updatePhase(projectId, phaseId, { is_public });
    },

    // Tasks
    async createTask(
      projectId: string,
      input: PhaseTaskInput
    ): Promise<PhaseTask> {
      const resolvedInput =
        input.team_member_ids === undefined
          ? input
          : {
              ...input,
              team_member_ids: await resolveTaskCollaboratorUserIds(
                supabase,
                tenantId,
                scopeId,
                input.team_member_ids
              ),
            };
      const createdTask = await createProjectLinkedTask(
        invokeTasks,
        projectId,
        resolvedInput
      );
      if (resolvedInput.team_member_ids?.length) {
        await ensureProjectMembers(projectId, resolvedInput.team_member_ids);
      }
      record("projects.task.created", {
        id: createdTask.id,
        project_id: projectId,
        phase_id: createdTask.phase_id,
        title: createdTask.title,
      });
      return createdTask;
    },

    async updateTask(
      projectId: string,
      taskId: string,
      input: PhaseTaskUpdateInput
    ): Promise<PhaseTask | null> {
      const resolvedInput =
        input.team_member_ids === undefined
          ? input
          : {
              ...input,
              team_member_ids: await resolveTaskCollaboratorUserIds(
                supabase,
                tenantId,
                scopeId,
                input.team_member_ids
              ),
            };
      if (resolvedInput.team_member_ids) {
        await ensureProjectMembers(projectId, resolvedInput.team_member_ids);
      }
      const updatedTask = await updateProjectLinkedTask(
        invokeTasks,
        supabase,
        tenantId,
        scopeId,
        projectId,
        taskId,
        resolvedInput
      );
      if (!updatedTask) {
        return null;
      }
      record("projects.task.updated", {
        id: taskId,
        project_id: projectId,
        phase_id: updatedTask.phase_id,
        title: updatedTask.title,
        changed_keys: Object.keys(input),
      });
      return updatedTask;
    },

    async deleteTask(projectId: string, taskId: string): Promise<boolean> {
      const linked = await listProjectLinkedTasks(
        supabase,
        tenantId,
        scopeId,
        projectId
      );
      const existing = linked.find((t) => t.id === taskId);
      await deleteProjectLinkedTask(invokeTasks, projectId, taskId);
      if (existing) {
        record("projects.task.deleted", {
          id: taskId,
          project_id: projectId,
          phase_id: existing.phase_id,
          title: existing.title,
        });
      }
      return true;
    },

    async updateTaskVisibility(
      projectId: string,
      taskId: string,
      is_public: boolean
    ): Promise<PhaseTask | null> {
      return this.updateTask(projectId, taskId, { is_public });
    },

    async listTasksPaginated(
      params: ProjectTasksQueryParams,
      assignedToUserId?: string
    ): Promise<ProjectTasksPaginatedResponse> {
      // Visibility (Phase 2): a restricted viewer must not enumerate tasks
      // across ALL projects (that would leak members-only projects' tasks).
      // Single-project listing is gated by the visibility policy, and the
      // personal "mine" scope is filtered to the viewer's own tasks — only the
      // cross-project "all" listing is the leak, so deny that one.
      if (
        viewer &&
        !viewer.seesAllProjects &&
        !params.project_id &&
        params.scope !== "mine"
      ) {
        return {
          data: [],
          page: Math.max(params.page ?? 1, 1),
          pageSize: Math.min(Math.max(params.pageSize ?? 25, 1), 200),
          total: 0,
        };
      }
      return listProjectTasksPaginated(
        invokeTasks,
        supabase,
        tenantId,
        scopeId,
        params,
        assignedToUserId
      );
    },

    async countAssociatedTasks(projectId: string): Promise<number> {
      return countProjectAssociatedTasks(
        invokeTasks,
        supabase,
        tenantId,
        scopeId,
        projectId
      );
    },

    async getTaskCountsByStatus(
      params: Omit<
        ProjectTasksQueryParams,
        "page" | "pageSize" | "sortBy" | "sortOrder"
      >,
      assignedToUserId?: string
    ): Promise<ProjectTaskCountsByStatus> {
      // Same visibility guard as listTasksPaginated: a restricted viewer gets
      // zero cross-project counts rather than a leak of members-only tallies.
      if (
        viewer &&
        !viewer.seesAllProjects &&
        !params.project_id &&
        params.scope !== "mine"
      ) {
        return {};
      }
      const settingsForCounts = await this.getSettings();
      const statuses = settingsForCounts.task_status_definitions.map(
        (d) => d.id
      );
      const counts: ProjectTaskCountsByStatus = {};

      for (const status of statuses) {
        if (params.status && params.status !== status) {
          continue;
        }
        const page = await listProjectTasksPaginated(
          invokeTasks,
          supabase,
          tenantId,
          scopeId,
          {
            ...params,
            status,
            page: 1,
            pageSize: 1,
          },
          assignedToUserId
        );
        counts[status] = page.total;
      }

      return counts;
    },

    // Settings
    async getSettings(): Promise<ProjectSettings> {
      const { data, error } = await settings()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .single();
      if (error || !data) {
        return { ...DEFAULT_PROJECT_SETTINGS };
      }
      const row = data as Record<string, unknown>;
      const raw =
        typeof row.default_task_statuses_json === "string"
          ? row.default_task_statuses_json
          : undefined;
      const definitions = normalizeTaskStatusDefinitionsFromStorage(raw);
      const overdueRaw = row.briefing_overdue_days;
      const briefing_overdue_days =
        typeof overdueRaw === "number" &&
        Number.isFinite(overdueRaw) &&
        overdueRaw >= 1 &&
        overdueRaw <= 90
          ? overdueRaw
          : DEFAULT_PROJECT_SETTINGS.briefing_overdue_days;
      return {
        briefing_overdue_days,
        ...definitionsToSettingsSlice(definitions),
      };
    },

    async setSettings(input: ProjectSettingsInput): Promise<ProjectSettings> {
      const current = await this.getSettings();
      let definitions = current.task_status_definitions;
      if (input.task_status_definitions !== undefined) {
        definitions = mergeTaskStatusDefinitionsFromPayload(
          input.task_status_definitions
        );
      }
      const briefing_overdue_days =
        input.briefing_overdue_days ?? current.briefing_overdue_days;
      const merged: ProjectSettings = {
        briefing_overdue_days,
        ...definitionsToSettingsSlice(definitions),
      };
      const row = {
        tenant_id: tenantId,
        scope_id: scopeId,
        briefing_overdue_days: merged.briefing_overdue_days,
        default_task_statuses_json:
          serializeTaskStatusDefinitionsForStorage(definitions),
        updated_at: new Date().toISOString(),
      };
      await settings().upsert(row, { onConflict: "tenant_id,scope_id" });
      return merged;
    },
  };
}
