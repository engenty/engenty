import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { createProjectRepoSupabase } from "../dal/supabase.js";
import {
  phaseTaskInputSchema,
  phaseTaskSchema,
  phaseTaskUpdateSchema,
  projectCreateInputSchema,
  projectIdParamsSchema,
  projectPhaseInputSchema,
  projectPhaseSchema,
  projectPhaseUpdateSchema,
  projectSchema,
  projectSettingsInputSchema,
  projectSettingsSchema,
  projectsListQuerySchema,
  projectsPaginatedResponseSchema,
  projectTaskCountsByStatusSchema,
  projectTasksListQuerySchema,
  projectTasksPaginatedResponseSchema,
  projectUpdateSchema,
} from "../schema/zod.js";

type ProjectRepo = ReturnType<typeof createProjectRepoSupabase>;
export type RepoOrFactory =
  | ProjectRepo
  | ((
      auth: PluginAuthContext,
      recordAuditEvent?: PluginHttpRouteContext["recordAuditEvent"]
    ) => ProjectRepo);

export function getRepo(
  repoOrFactory: RepoOrFactory,
  auth?: PluginAuthContext,
  recordAuditEvent?: PluginHttpRouteContext["recordAuditEvent"]
): ProjectRepo {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required");
    }
    return repoOrFactory(auth, recordAuditEvent);
  }
  return repoOrFactory;
}

const op = (read: boolean) => ({
  moduleId: "projects",
  requiredCapabilities: [
    read ? "module.projects.read" : "module.projects.write",
  ],
  riskLevel: read ? ("low" as const) : ("high" as const),
  idempotent: read,
  dryRunSupported: false,
  requiresApproval: !read,
});

export function registerProjectsGatewayMethods(
  api: PluginServerApi,
  repoOrFactory: RepoOrFactory
) {
  api.registerOperation({
    operationId: "projects_list",
    summary: "List projects",
    ...op(true),
    inputSchema: projectsListQuerySchema.partial(),
    outputSchema: projectsPaginatedResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = projectsListQuerySchema.parse(input ?? {});
      return repo.listPaginated(parsed);
    },
  });

  api.registerOperation({
    operationId: "projects_get",
    summary: "Get project by ID",
    ...op(true),
    inputSchema: projectIdParamsSchema,
    outputSchema: z.any(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = input as z.infer<typeof projectIdParamsSchema>;
      return repo.getByIdWithPhasesAndTasks(params.id);
    },
  });

  api.registerOperation({
    operationId: "projects_create",
    summary: "Create project",
    ...op(false),
    inputSchema: projectCreateInputSchema,
    outputSchema: projectSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const raw = input as z.infer<typeof projectCreateInputSchema>;
      const full = {
        ...raw,
        client_id: raw.client_id ?? null,
        client_name: raw.client_name ?? null,
        briefing: raw.briefing ?? null,
        start_date: raw.start_date ?? null,
        end_date: raw.end_date ?? null,
        lead_id: raw.lead_id ?? null,
        portal_enabled: raw.portal_enabled ?? false,
        portal_password: raw.portal_password ?? null,
        portal_intro_text: raw.portal_intro_text ?? null,
        created_by: raw.created_by ?? null,
        ...(raw.team_member_ids === undefined
          ? {}
          : { team_member_ids: raw.team_member_ids }),
      };
      return repo.create(full);
    },
  });

  api.registerOperation({
    operationId: "projects_update",
    summary: "Update project",
    ...op(false),
    inputSchema: z.object({
      id: z.string().min(1),
      patch: projectUpdateSchema,
    }),
    outputSchema: projectSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const { id, patch } = input as {
        id: string;
        patch: z.infer<typeof projectUpdateSchema>;
      };
      return repo.update(id, patch);
    },
  });

  api.registerOperation({
    operationId: "projects_delete",
    summary: "Delete project",
    ...op(false),
    riskLevel: "critical" as const,
    inputSchema: projectIdParamsSchema.extend({
      delete_tasks: z.boolean().optional(),
    }),
    outputSchema: z.object({ deleted: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = input as z.infer<typeof projectIdParamsSchema> & {
        delete_tasks?: boolean;
      };
      const deleted = await repo.delete(params.id, {
        deleteTasks: params.delete_tasks,
      });
      return { deleted };
    },
  });

  api.registerOperation({
    operationId: "projects_settings_get",
    summary: "Get project settings",
    ...op(true),
    inputSchema: z.object({}).passthrough(),
    outputSchema: projectSettingsSchema,
    handler: async (_input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.getSettings();
    },
  });

  api.registerOperation({
    operationId: "projects_settings_update",
    summary: "Update project settings",
    ...op(false),
    inputSchema: projectSettingsInputSchema,
    outputSchema: projectSettingsSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.setSettings(
        input as z.infer<typeof projectSettingsInputSchema>
      );
    },
  });

  // --- Phase operations ---

  api.registerOperation({
    operationId: "projects_create_phase",
    summary: "Create a phase in a project",
    ...op(false),
    inputSchema: z.object({
      project_id: z.string().min(1),
      phase: projectPhaseInputSchema.omit({ project_id: true }),
    }),
    outputSchema: projectPhaseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const { project_id, phase } = input as {
        project_id: string;
        phase: z.infer<typeof projectPhaseInputSchema>;
      };
      return repo.createPhase(project_id, { ...phase, project_id });
    },
  });

  api.registerOperation({
    operationId: "projects_update_phase",
    summary: "Update a project phase",
    ...op(false),
    inputSchema: z.object({
      project_id: z.string().min(1),
      phase_id: z.string().min(1),
      patch: projectPhaseUpdateSchema,
    }),
    outputSchema: projectPhaseSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const { project_id, phase_id, patch } = input as {
        project_id: string;
        phase_id: string;
        patch: z.infer<typeof projectPhaseUpdateSchema>;
      };
      return repo.updatePhase(project_id, phase_id, patch);
    },
  });

  api.registerOperation({
    operationId: "projects_delete_phase",
    summary: "Delete a project phase",
    ...op(false),
    inputSchema: z.object({
      project_id: z.string().min(1),
      phase_id: z.string().min(1),
    }),
    outputSchema: z.object({ deleted: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const { project_id, phase_id } = input as {
        project_id: string;
        phase_id: string;
      };
      const deleted = await repo.deletePhase(project_id, phase_id);
      return { deleted };
    },
  });

  // --- Task operations ---

  api.registerOperation({
    operationId: "projects_create_task",
    summary: "Create a task in a project",
    ...op(false),
    inputSchema: z.object({
      project_id: z.string().min(1),
      task: phaseTaskInputSchema.omit({ project_id: true }),
    }),
    outputSchema: phaseTaskSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const { project_id, task } = input as {
        project_id: string;
        task: z.infer<typeof phaseTaskInputSchema>;
      };
      const settings = await repo.getSettings();
      const status = task.status ?? "todo";
      if (!settings.task_status_definitions.some((d) => d.id === status)) {
        throw new Error(`Invalid task status: ${status}`);
      }
      return repo.createTask(project_id, {
        ...task,
        project_id,
        status,
      });
    },
  });

  api.registerOperation({
    operationId: "projects_update_task",
    summary: "Update a project task",
    ...op(false),
    inputSchema: z.object({
      project_id: z.string().min(1),
      task_id: z.string().min(1),
      patch: phaseTaskUpdateSchema,
    }),
    outputSchema: phaseTaskSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const { project_id, task_id, patch } = input as {
        project_id: string;
        task_id: string;
        patch: z.infer<typeof phaseTaskUpdateSchema>;
      };
      if (patch.status !== undefined) {
        const settings = await repo.getSettings();
        if (
          !settings.task_status_definitions.some((d) => d.id === patch.status)
        ) {
          throw new Error(`Invalid task status: ${patch.status}`);
        }
      }
      return repo.updateTask(project_id, task_id, patch);
    },
  });

  api.registerOperation({
    operationId: "projects_delete_task",
    summary: "Delete a project task",
    ...op(false),
    inputSchema: z.object({
      project_id: z.string().min(1),
      task_id: z.string().min(1),
    }),
    outputSchema: z.object({ deleted: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const { project_id, task_id } = input as {
        project_id: string;
        task_id: string;
      };
      const deleted = await repo.deleteTask(project_id, task_id);
      return { deleted };
    },
  });

  // --- Task listing and counts ---

  api.registerOperation({
    operationId: "projects_list_tasks",
    summary: "List tasks across projects (paginated)",
    ...op(true),
    inputSchema: projectTasksListQuerySchema.partial(),
    outputSchema: projectTasksPaginatedResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = projectTasksListQuerySchema.parse(input ?? {});
      return repo.listTasksPaginated(parsed);
    },
  });

  api.registerOperation({
    operationId: "projects_task_counts",
    summary: "Get task counts by status",
    ...op(true),
    inputSchema: z
      .object({
        project_id: z.string().optional(),
        phase_id: z.string().optional(),
        assigned_to: z.string().optional(),
      })
      .partial(),
    outputSchema: projectTaskCountsByStatusSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = (input ?? {}) as {
        project_id?: string;
        phase_id?: string;
        assigned_to?: string;
      };
      return repo.getTaskCountsByStatus(params);
    },
  });

  // --- Visibility toggling (portal) ---

  api.registerOperation({
    operationId: "projects_update_visibility",
    summary: "Toggle portal visibility on a phase or task",
    ...op(false),
    inputSchema: z.object({
      entity_type: z.enum(["phase", "task"]),
      project_id: z.string().min(1),
      entity_id: z.string().min(1),
      is_public: z.boolean(),
    }),
    outputSchema: z.any(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const { entity_type, project_id, entity_id, is_public } = input as {
        entity_type: "phase" | "task";
        project_id: string;
        entity_id: string;
        is_public: boolean;
      };
      if (entity_type === "phase") {
        return repo.updatePhaseVisibility(project_id, entity_id, is_public);
      }
      return repo.updateTaskVisibility(project_id, entity_id, is_public);
    },
  });
}
