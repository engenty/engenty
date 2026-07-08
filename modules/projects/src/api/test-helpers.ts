import { randomUUID } from "node:crypto";
import type {
  PluginHttpRoute,
  PluginRegistrationReceipt,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import {
  definitionsToSettingsSlice,
  mergeTaskStatusDefinitionsFromPayload,
} from "../lib/task-status-settings.js";
import type {
  PhaseTask,
  PhaseTaskInput,
  PhaseTaskUpdateInput,
  Project,
  ProjectInput,
  ProjectPhase,
  ProjectPhaseInput,
  ProjectPhaseUpdateInput,
  ProjectSettings,
  ProjectsPaginatedResponse,
  ProjectsQueryParams,
  ProjectTaskCountsByStatus,
  ProjectTaskListItem,
  ProjectTasksPaginatedResponse,
  ProjectTasksQueryParams,
  ProjectTeamMember,
  ProjectUpdateInput,
  ProjectWithPhasesAndTasks,
} from "../schema/types.js";

const mockDefaultProjectSettings: ProjectSettings = {
  briefing_overdue_days: 7,
  ...definitionsToSettingsSlice(
    BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => ({ ...d }))
  ),
};

export function makeMockProjectRepo() {
  const projects = new Map<string, Project>();
  const phases = new Map<string, ProjectPhase>();
  const tasks = new Map<string, PhaseTask>();
  const projectMemberIds = new Map<string, Set<string>>();
  let settingsState: ProjectSettings = { ...mockDefaultProjectSettings };

  const now = () => new Date().toISOString();

  function membersForProject(projectId: string): ProjectTeamMember[] {
    const set = projectMemberIds.get(projectId);
    if (!set || set.size === 0) {
      return [];
    }
    return [...set].map((user_id) => ({
      project_id: projectId,
      user_id,
      role: "project-member" as const,
      role_name: null,
    }));
  }

  function withMembers(p: Project): Project {
    const m = membersForProject(p.id);
    return m.length > 0 ? { ...p, project_team: m } : p;
  }

  function isUserOnProjectTask(projectId: string, userId: string): boolean {
    for (const t of tasks.values()) {
      if (t.project_id !== projectId) {
        continue;
      }
      const mm = t.task_team ?? [];
      if (mm.some((x) => x.user_id === userId)) {
        return true;
      }
    }
    return false;
  }

  return {
    async create(input: ProjectInput): Promise<Project> {
      const id = randomUUID();
      const { team_member_ids, ...fields } = input;
      const proj: Project = {
        id,
        tenant_id: "tenant-1",
        scope_id: "default",
        client_id: fields.client_id,
        lead_id: fields.lead_id ?? null,
        title: fields.title,
        briefing: fields.briefing ?? null,
        start_date: fields.start_date ?? null,
        end_date: fields.end_date ?? null,
        portal_enabled: fields.portal_enabled ?? false,
        portal_password: fields.portal_password ?? null,
        portal_intro_text: fields.portal_intro_text ?? null,
        created_by: fields.created_by ?? null,
        created_at: now(),
        updated_at: now(),
      };
      projects.set(id, proj);
      if (team_member_ids?.length) {
        projectMemberIds.set(id, new Set(team_member_ids));
        return withMembers(proj);
      }
      return proj;
    },
    async listPaginated(
      params: ProjectsQueryParams = {}
    ): Promise<ProjectsPaginatedResponse> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
      let items = Array.from(projects.values());
      if (params.search?.trim()) {
        const s = params.search.trim().toLowerCase();
        items = items.filter((p) => p.title.toLowerCase().includes(s));
      }
      const total = items.length;
      const start = (page - 1) * pageSize;
      const data = items
        .slice(start, start + pageSize)
        .map((p) => withMembers(p));
      return { data, total, page, pageSize };
    },
    async getById(id: string): Promise<Project | null> {
      const p = projects.get(id);
      return p ? withMembers(p) : null;
    },
    async getByIdWithPhasesAndTasks(
      id: string
    ): Promise<ProjectWithPhasesAndTasks | null> {
      const proj = projects.get(id);
      if (!proj) {
        return null;
      }
      const phaseList = Array.from(phases.values()).filter(
        (p) => p.project_id === id
      );
      const taskList = Array.from(tasks.values()).filter(
        (t) => t.project_id === id
      );
      return {
        ...withMembers(proj),
        phases: phaseList.map((p) => ({
          ...p,
          tasks: taskList.filter((t) => t.phase_id === p.id),
        })),
        general_tasks: taskList.filter((t) => !t.phase_id),
      };
    },
    async update(
      id: string,
      patch: ProjectUpdateInput
    ): Promise<Project | null> {
      const existing = projects.get(id);
      if (!existing) {
        return null;
      }
      const { team_member_ids, project_team, ...rest } = patch;
      const updated: Project = {
        ...existing,
        ...rest,
        updated_at: now(),
      };
      projects.set(id, updated);
      if (project_team !== undefined) {
        const next = new Set(project_team.map((m) => m.user_id));
        const current = projectMemberIds.get(id) ?? new Set<string>();
        for (const uid of current) {
          if (!next.has(uid)) {
            for (const t of tasks.values()) {
              if (t.project_id !== id) {
                continue;
              }
              const mm = t.task_team ?? [];
              if (mm.some((x) => x.user_id === uid)) {
                t.task_team = mm.filter((x) => x.user_id !== uid);
              }
            }
          }
        }
        projectMemberIds.set(id, next);
      } else if (team_member_ids !== undefined) {
        const current = projectMemberIds.get(id) ?? new Set<string>();
        const next = new Set(team_member_ids);
        for (const uid of current) {
          if (!next.has(uid)) {
            for (const t of tasks.values()) {
              if (t.project_id !== id) {
                continue;
              }
              const mm = t.task_team ?? [];
              if (mm.some((x) => x.user_id === uid)) {
                t.task_team = mm.filter((x) => x.user_id !== uid);
              }
            }
          }
        }
        projectMemberIds.set(id, next);
      }
      return withMembers(updated);
    },
    async delete(id: string): Promise<boolean> {
      projectMemberIds.delete(id);
      return projects.delete(id);
    },
    async createPhase(
      projectId: string,
      input: ProjectPhaseInput
    ): Promise<ProjectPhase> {
      const id = randomUUID();
      const phase: ProjectPhase = {
        id,
        tenant_id: "tenant-1",
        scope_id: "default",
        project_id: projectId,
        title: input.title,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        is_main: input.is_main ?? false,
        is_public: input.is_public ?? false,
        order_index: input.order_index ?? 0,
        created_at: now(),
        updated_at: now(),
      };
      phases.set(id, phase);
      return phase;
    },
    async updatePhase(
      projectId: string,
      phaseId: string,
      patch: ProjectPhaseUpdateInput
    ): Promise<ProjectPhase | null> {
      const existing = phases.get(phaseId);
      if (!existing || existing.project_id !== projectId) {
        return null;
      }
      const updated: ProjectPhase = {
        ...existing,
        ...patch,
        updated_at: now(),
      };
      phases.set(phaseId, updated);
      return updated;
    },
    async deletePhase(projectId: string, phaseId: string): Promise<void> {
      const p = phases.get(phaseId);
      if (p && p.project_id === projectId) {
        phases.delete(phaseId);
      }
    },
    async createTask(
      projectId: string,
      input: PhaseTaskInput
    ): Promise<PhaseTask> {
      const id = randomUUID();
      const task: PhaseTask = {
        id,
        tenant_id: "tenant-1",
        scope_id: "default",
        project_id: projectId,
        phase_id: input.phase_id ?? null,
        title: input.title,
        content: input.content ?? null,
        discipline: input.discipline ?? null,
        hours: input.hours ?? null,
        status: input.status ?? "todo",
        is_public: input.is_public ?? false,
        order_index: input.order_index ?? 0,
        created_at: now(),
        updated_at: now(),
      };
      if (input.team_member_ids?.length) {
        task.task_team = input.team_member_ids.map((user_id) => ({
          task_id: id,
          user_id,
        }));
        const set = projectMemberIds.get(projectId) ?? new Set<string>();
        for (const uid of input.team_member_ids) {
          set.add(uid);
        }
        projectMemberIds.set(projectId, set);
      }
      tasks.set(id, task);
      return task;
    },
    async updateTask(
      projectId: string,
      taskId: string,
      patch: PhaseTaskUpdateInput
    ): Promise<PhaseTask | null> {
      const existing = tasks.get(taskId);
      if (!existing || existing.project_id !== projectId) {
        return null;
      }
      const { team_member_ids, ...rest } = patch;
      let task_team = existing.task_team;
      if (team_member_ids !== undefined) {
        task_team = team_member_ids.map((user_id) => ({
          task_id: taskId,
          user_id,
        }));
        const set = projectMemberIds.get(projectId) ?? new Set<string>();
        for (const uid of team_member_ids) {
          set.add(uid);
        }
        projectMemberIds.set(projectId, set);
      }
      const updated: PhaseTask = {
        ...existing,
        ...rest,
        ...(task_team === undefined ? {} : { task_team }),
        updated_at: now(),
      };
      tasks.set(taskId, updated);
      return updated;
    },
    async deleteTask(projectId: string, taskId: string): Promise<void> {
      const t = tasks.get(taskId);
      if (t && t.project_id === projectId) {
        tasks.delete(taskId);
      }
    },
    async getSettings(): Promise<ProjectSettings> {
      return { ...settingsState };
    },
    async setSettings(
      input: Partial<ProjectSettings>
    ): Promise<ProjectSettings> {
      let definitions = settingsState.task_status_definitions;
      if (input.task_status_definitions !== undefined) {
        definitions = mergeTaskStatusDefinitionsFromPayload(
          input.task_status_definitions
        );
      }
      settingsState = {
        briefing_overdue_days:
          input.briefing_overdue_days ?? settingsState.briefing_overdue_days,
        ...definitionsToSettingsSlice(definitions),
      };
      return { ...settingsState };
    },
    async listTasksPaginated(
      params: ProjectTasksQueryParams = {},
      _assignedToUserId?: string
    ): Promise<ProjectTasksPaginatedResponse> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
      let items: ProjectTaskListItem[] = Array.from(tasks.values()).map((t) => {
        const proj = projects.get(t.project_id);
        const phase = t.phase_id ? phases.get(t.phase_id) : undefined;
        return {
          ...t,
          project_title: proj?.title ?? "Project",
          client_name: proj?.client_name ?? null,
          phase_title: phase?.title ?? null,
        };
      });
      if (params.scope === "mine" && _assignedToUserId) {
        items = items.filter((t) =>
          (t.task_team ?? []).some((m) => m.user_id === _assignedToUserId)
        );
      }
      if (params.project_id) {
        items = items.filter((t) => t.project_id === params.project_id);
      }
      if (params.status) {
        items = items.filter((t) => t.status === params.status);
      }
      const total = items.length;
      const start = (page - 1) * pageSize;
      return {
        data: items.slice(start, start + pageSize),
        total,
        page,
        pageSize,
      };
    },
    async getTaskCountsByStatus(
      _params: ProjectTasksQueryParams,
      _assignedToUserId?: string
    ): Promise<ProjectTaskCountsByStatus> {
      const s = await this.getSettings();
      const counts: ProjectTaskCountsByStatus = {};
      for (const def of s.task_status_definitions) {
        counts[def.id] = 0;
      }
      return counts;
    },
  };
}

const defaultAuth = {
  tenantId: "tenant-1",
  scopeId: "default",
  principalId: "user-1",
};

export function makeMockApi() {
  const httpRoutes: PluginHttpRoute[] = [];
  const serverOperations: PluginServerOperation[] = [];
  const noopReceipt = (): PluginRegistrationReceipt => ({
    dispose: () => {},
  });
  const api: PluginServerApi = {
    callGatewayMethod: async () => null,
    hasOperation: () => false,
    registerHttpRoute: (route) => {
      httpRoutes.push(route);
      return noopReceipt();
    },
    registerOperation: (operation) => {
      serverOperations.push(operation);
      return noopReceipt();
    },
    registerAiRegistration: () => {},
    registerFeatureFlags: () => [],
    registerProfilePolicy: () => {},
    registerResultPolicy: () => {},
    registerService: () => {},
    registerTestDataType: () => noopReceipt(),
    registerCli: () => {},
    resolvePath: (p: string) => p,
  };
  return { api, httpRoutes, serverOperations, defaultAuth };
}

export function getRoute(
  routes: PluginHttpRoute[],
  method: PluginHttpRoute["method"],
  routePath: string
): PluginHttpRoute {
  const found = routes.find((r) => r.method === method && r.path === routePath);
  if (!found) {
    throw new Error(`route not found: ${method.toUpperCase()} ${routePath}`);
  }
  return found;
}
