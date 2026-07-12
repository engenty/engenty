import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

async function ensureClientRoleOnEntity(
  hasOperation: PluginServerApi["hasOperation"],
  invokeOperation: PluginHttpRouteContext["callGatewayMethod"],
  clientId: string | null | undefined,
  auth?: PluginAuthContext
): Promise<void> {
  const id = typeof clientId === "string" ? clientId.trim() : "";
  if (!(id && invokeOperation && hasOperation("contacts_add_contact_role"))) {
    return;
  }
  try {
    await invokeOperation(
      "contacts_add_contact_role",
      { contactId: id, role: "client" },
      { auth }
    );
  } catch {
    // contacts plugin may not be loaded
  }
}

import { z } from "@hono/zod-openapi";
import type { createPortalDAL } from "../dal/portal-supabase.js";
import {
  deleteProjectResponseSchema,
  notFoundSchema,
  phaseTaskInputSchema,
  phaseTaskSchema,
  phaseTaskUpdateSchema,
  projectAssociatedTaskCountResponseSchema,
  projectCreateInputSchema,
  projectDeleteQuerySchema,
  projectIdParamsSchema,
  projectPhaseInputSchema,
  projectPhaseSchema,
  projectPhaseUpdateSchema,
  projectSchema,
  projectSettingsInputSchema,
  projectSettingsSchema,
  projectsBriefingQuerySchema,
  projectsListQuerySchema,
  projectsPaginatedResponseSchema,
  projectTaskCountsByStatusSchema,
  projectTasksListQuerySchema,
  projectTasksPaginatedResponseSchema,
  projectUpdateSchema,
} from "../schema/zod.js";
import { buildProjectsBriefingResponse } from "../services/projects-briefing-service.js";
import {
  getRepo,
  type RepoOrFactory,
  registerProjectsGatewayMethods,
} from "./gateway-methods.js";

/** UUID v4 pattern to avoid /api/projects/tasks matching /api/projects/:id */
const UUID_PARAM =
  "{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}";

/** Path for project-by-id routes (exported for tests) */
export const PROJECT_BY_ID_PATH = `/api/projects/:id${UUID_PARAM}`;

type PortalDAL = ReturnType<typeof createPortalDAL>;

interface RegisterProjectsApiOpts {
  portalDAL?: PortalDAL;
  supabase?: SupabaseClient;
}

export function registerProjectsApi(
  api: PluginServerApi,
  repoOrFactory: RepoOrFactory,
  opts?: RegisterProjectsApiOpts
) {
  const op = (read: boolean) => ({
    moduleId: "projects",
    requiredCapabilities: [
      read ? "module.projects.read" : "module.projects.write",
    ],
    riskLevel: read ? ("low" as const) : ("high" as const),
    idempotent: read,
    requiresApproval: !read,
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/projects",
    operation: { ...op(true) },
    summary: "List projects",
    tags: ["projects"],
    request: { query: projectsListQuerySchema },
    responses: {
      200: {
        description: "Projects paginated list",
        schema: projectsPaginatedResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const url = new URL(ctx.request.url);
      const parsed = projectsListQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        sortBy: url.searchParams.get("sortBy") ?? undefined,
        sortOrder: url.searchParams.get("sortOrder") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        client_id: url.searchParams.get("client_id") ?? undefined,
        lead_id: url.searchParams.get("lead_id") ?? undefined,
      });
      return repo.listPaginated(parsed);
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/projects/settings",
    operation: { ...op(true) },
    summary: "Get project settings",
    tags: ["projects", "settings"],
    responses: {
      200: { description: "Project settings", schema: projectSettingsSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.getSettings();
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/projects/tasks",
    operation: { ...op(true) },
    summary: "List tasks across projects",
    tags: ["projects", "tasks"],
    request: { query: projectTasksListQuerySchema },
    responses: {
      200: {
        description: "Tasks paginated list",
        schema: projectTasksPaginatedResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const url = new URL(ctx.request.url);
      const parsed = projectTasksListQuerySchema.parse({
        scope: url.searchParams.get("scope") ?? undefined,
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        project_id: url.searchParams.get("project_id") ?? undefined,
        phase_id: url.searchParams.get("phase_id") ?? undefined,
        assigned_to: url.searchParams.get("assigned_to") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        sortBy: url.searchParams.get("sortBy") ?? undefined,
        sortOrder: url.searchParams.get("sortOrder") ?? undefined,
      });
      const assignedToUserId =
        parsed.scope === "mine" ? ctx.auth?.principalId : undefined;
      return repo.listTasksPaginated(parsed, assignedToUserId);
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/projects/tasks/counts",
    operation: { ...op(true) },
    summary: "Get task counts by status",
    tags: ["projects", "tasks"],
    request: {
      query: projectTasksListQuerySchema.omit({
        page: true,
        pageSize: true,
        sortBy: true,
        sortOrder: true,
      }),
    },
    responses: {
      200: {
        description: "Task counts by status",
        schema: projectTaskCountsByStatusSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const url = new URL(ctx.request.url);
      const parsed = projectTasksListQuerySchema
        .omit({ page: true, pageSize: true, sortBy: true, sortOrder: true })
        .parse({
          scope: url.searchParams.get("scope") ?? undefined,
          search: url.searchParams.get("search") ?? undefined,
          project_id: url.searchParams.get("project_id") ?? undefined,
          phase_id: url.searchParams.get("phase_id") ?? undefined,
          assigned_to: url.searchParams.get("assigned_to") ?? undefined,
          status: url.searchParams.get("status") ?? undefined,
        });
      const assignedToUserId =
        parsed.scope === "mine" ? ctx.auth?.principalId : undefined;
      return repo.getTaskCountsByStatus(parsed, assignedToUserId);
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/projects/briefing",
    operation: { ...op(true) },
    summary: "Projects briefing aggregate",
    tags: ["projects", "briefing"],
    request: { query: projectsBriefingQuerySchema },
    responses: {
      200: { description: "Briefing snapshot", schema: z.any() },
    },
    handler: async (ctx) => {
      if (!(opts?.supabase && ctx.auth)) {
        return new Response(
          JSON.stringify({ error: "Briefing requires database adapter" }),
          { status: 500, headers: { "content-type": "application/json" } }
        );
      }
      const url = new URL(ctx.request.url);
      const parsed = projectsBriefingQuerySchema.parse({
        mode: url.searchParams.get("mode") ?? undefined,
      });
      const mode = parsed.mode ?? "personal";
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const settings = await repo.getSettings();
      return buildProjectsBriefingResponse(
        repo,
        settings,
        ctx.auth.principalId,
        mode
      );
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: PROJECT_BY_ID_PATH,
    operation: { ...op(true) },
    summary: "Get project by ID with phases and tasks",
    tags: ["projects"],
    request: { params: projectIdParamsSchema },
    responses: {
      200: { description: "Project", schema: z.any() },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof projectIdParamsSchema>;
      const project = await repo.getByIdWithPhasesAndTasks(params.id);
      if (!project) {
        return new Response(JSON.stringify({ error: "Project not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return project;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/projects",
    operation: { ...op(false) },
    summary: "Create project",
    tags: ["projects"],
    request: { body: projectCreateInputSchema },
    responses: {
      201: { description: "Created project", schema: projectSchema },
    },
    handler: async (ctx) => {
      const { callGatewayMethod: invokeOperation } = ctx;
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const raw = ctx.body as z.infer<typeof projectCreateInputSchema>;
      const input = {
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
      const created = await repo.create(input);
      await ensureClientRoleOnEntity(
        api.hasOperation,
        invokeOperation,
        input.client_id,
        ctx.auth
      );
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: PROJECT_BY_ID_PATH,
    operation: { ...op(false) },
    summary: "Update project",
    tags: ["projects"],
    request: { params: projectIdParamsSchema, body: projectUpdateSchema },
    responses: {
      200: { description: "Updated project", schema: projectSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const { callGatewayMethod: invokeOperation } = ctx;
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof projectIdParamsSchema>;
      const patch = ctx.body as z.infer<typeof projectUpdateSchema>;
      const updated = await repo.update(params.id, patch);
      if (!updated) {
        return new Response(JSON.stringify({ error: "Project not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      if (patch.client_id !== undefined) {
        await ensureClientRoleOnEntity(
          api.hasOperation,
          invokeOperation,
          patch.client_id,
          ctx.auth
        );
      }
      return updated;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: PROJECT_BY_ID_PATH,
    operation: { ...op(false), riskLevel: "critical" as const },
    summary: "Delete project",
    tags: ["projects"],
    request: {
      params: projectIdParamsSchema,
      query: projectDeleteQuerySchema,
    },
    responses: {
      200: { description: "Deleted", schema: deleteProjectResponseSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof projectIdParamsSchema>;
      const url = new URL(ctx.request.url);
      const query = projectDeleteQuerySchema.parse({
        delete_tasks: url.searchParams.get("delete_tasks") ?? undefined,
      });
      const ok = await repo.delete(params.id, {
        deleteTasks: query.delete_tasks,
      });
      if (!ok) {
        return new Response(JSON.stringify({ error: "Project not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return { ok: true as const, id: params.id };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: `${PROJECT_BY_ID_PATH}/associated-tasks/count`,
    operation: { ...op(true) },
    summary: "Count tasks associated with a project",
    tags: ["projects", "tasks"],
    request: {
      params: projectIdParamsSchema,
    },
    responses: {
      200: {
        description: "Associated task count",
        schema: projectAssociatedTaskCountResponseSchema,
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof projectIdParamsSchema>;
      const project = await repo.getById(params.id);
      if (!project) {
        return new Response(JSON.stringify({ error: "Project not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const count = await repo.countAssociatedTasks(params.id);
      return { count };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: `${PROJECT_BY_ID_PATH}/phases`,
    operation: { ...op(false) },
    summary: "Create phase",
    tags: ["projects", "phases"],
    request: { params: projectIdParamsSchema, body: projectPhaseInputSchema },
    responses: {
      201: { description: "Created phase", schema: projectPhaseSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof projectIdParamsSchema>;
      const input = ctx.body as z.infer<typeof projectPhaseInputSchema>;
      const created = await repo.createPhase(params.id, {
        ...input,
        project_id: params.id,
      });
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/projects/:projectId/phases/:id",
    operation: { ...op(false) },
    summary: "Update phase",
    tags: ["projects", "phases"],
    request: {
      params: z.object({ projectId: z.string().min(1), id: z.string().min(1) }),
      body: projectPhaseUpdateSchema,
    },
    responses: {
      200: { description: "Updated phase", schema: projectPhaseSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as { projectId: string; id: string };
      const patch = ctx.body as z.infer<typeof projectPhaseUpdateSchema>;
      const updated = await repo.updatePhase(
        params.projectId,
        params.id,
        patch
      );
      if (!updated) {
        return new Response(JSON.stringify({ error: "Phase not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return updated;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/projects/:projectId/phases/:id",
    operation: { ...op(false) },
    summary: "Delete phase",
    tags: ["projects", "phases"],
    request: {
      params: z.object({ projectId: z.string().min(1), id: z.string().min(1) }),
    },
    responses: {
      200: { description: "Deleted", schema: z.object({ ok: z.boolean() }) },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as { projectId: string; id: string };
      await repo.deletePhase(params.projectId, params.id);
      return { ok: true };
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/projects/:projectId/phases/:phaseId/visibility",
    operation: { ...op(false) },
    summary: "Update phase visibility",
    tags: ["projects", "phases"],
    request: {
      params: z.object({
        projectId: z.string().min(1),
        phaseId: z.string().min(1),
      }),
      body: z.object({ is_public: z.boolean() }),
    },
    responses: {
      200: { description: "Updated phase", schema: projectPhaseSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as { projectId: string; phaseId: string };
      const body = ctx.body as { is_public: boolean };
      const updated = await repo.updatePhaseVisibility(
        params.projectId,
        params.phaseId,
        body.is_public
      );
      if (!updated) {
        return new Response(JSON.stringify({ error: "Phase not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return updated;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/projects/:id/tasks",
    operation: { ...op(false) },
    summary: "Create task",
    tags: ["projects", "tasks"],
    request: { params: projectIdParamsSchema, body: phaseTaskInputSchema },
    responses: {
      201: { description: "Created task", schema: phaseTaskSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof projectIdParamsSchema>;
      const input = ctx.body as z.infer<typeof phaseTaskInputSchema>;
      const settings = await repo.getSettings();
      const status = input.status ?? "todo";
      if (!settings.task_status_definitions.some((d) => d.id === status)) {
        return new Response(JSON.stringify({ error: "Invalid task status" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      const created = await repo.createTask(params.id, {
        ...input,
        project_id: params.id,
        status,
      });
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/projects/:projectId/tasks/:id",
    operation: { ...op(false) },
    summary: "Update task",
    tags: ["projects", "tasks"],
    request: {
      params: z.object({ projectId: z.string().min(1), id: z.string().min(1) }),
      body: phaseTaskUpdateSchema,
    },
    responses: {
      200: { description: "Updated task", schema: phaseTaskSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as { projectId: string; id: string };
      const patch = ctx.body as z.infer<typeof phaseTaskUpdateSchema>;
      if (patch.status !== undefined) {
        const settings = await repo.getSettings();
        if (
          !settings.task_status_definitions.some((d) => d.id === patch.status)
        ) {
          return new Response(
            JSON.stringify({ error: "Invalid task status" }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            }
          );
        }
      }
      const updated = await repo.updateTask(params.projectId, params.id, patch);
      if (!updated) {
        return new Response(JSON.stringify({ error: "Task not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return updated;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/projects/:projectId/tasks/:id",
    operation: { ...op(false) },
    summary: "Delete task",
    tags: ["projects", "tasks"],
    request: {
      params: z.object({ projectId: z.string().min(1), id: z.string().min(1) }),
    },
    responses: {
      200: { description: "Deleted", schema: z.object({ ok: z.boolean() }) },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as { projectId: string; id: string };
      await repo.deleteTask(params.projectId, params.id);
      return { ok: true };
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/projects/:projectId/tasks/:taskId/visibility",
    operation: { ...op(false) },
    summary: "Update task visibility",
    tags: ["projects", "tasks"],
    request: {
      params: z.object({
        projectId: z.string().min(1),
        taskId: z.string().min(1),
      }),
      body: z.object({ is_public: z.boolean() }),
    },
    responses: {
      200: { description: "Updated task", schema: phaseTaskSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as { projectId: string; taskId: string };
      const body = ctx.body as { is_public: boolean };
      const updated = await repo.updateTaskVisibility(
        params.projectId,
        params.taskId,
        body.is_public
      );
      if (!updated) {
        return new Response(JSON.stringify({ error: "Task not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return updated;
    },
  });

  registerProjectsGatewayMethods(api, repoOrFactory);

  api.registerHttpRoute({
    method: "put",
    path: "/api/projects/settings",
    operation: { ...op(false) },
    summary: "Update project settings",
    tags: ["projects", "settings"],
    request: { body: projectSettingsInputSchema },
    responses: {
      200: { description: "Updated settings", schema: projectSettingsSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const input = ctx.body as z.infer<typeof projectSettingsInputSchema>;
      return repo.setSettings(input);
    },
  });

  if (opts?.portalDAL) {
    const portal = opts.portalDAL;
    api.registerHttpRoute({
      method: "post",
      path: "/api/portal/:projectId/verify",
      isPublic: true,
      operation: {
        moduleId: "projects",
        requiredCapabilities: [],
        riskLevel: "low",
        idempotent: false,
      },
      summary: "Verify portal password",
      tags: ["projects", "portal"],
      request: {
        params: z.object({ projectId: z.string().min(1) }),
        body: z.object({ password: z.string().min(1) }),
      },
      responses: {
        200: {
          description: "Password verified",
          schema: z.object({ verified: z.boolean() }),
        },
        401: {
          description: "Invalid password",
          schema: z.object({ verified: z.literal(false) }),
        },
      },
      handler: async (ctx) => {
        const params = ctx.params as { projectId: string };
        const body = ctx.body as { password: string };
        const ok = await portal.verifyPortalPassword(
          params.projectId,
          body.password
        );
        return { verified: ok };
      },
    });

    api.registerHttpRoute({
      method: "get",
      path: "/api/portal/:projectId",
      isPublic: true,
      operation: {
        moduleId: "projects",
        requiredCapabilities: [],
        riskLevel: "low",
        idempotent: true,
      },
      summary: "Get public project info (portal)",
      tags: ["projects", "portal"],
      request: { params: z.object({ projectId: z.string().min(1) }) },
      responses: {
        200: { description: "Public project info", schema: z.any() },
        404: { description: "Not found", schema: notFoundSchema },
      },
      handler: async (ctx) => {
        const params = ctx.params as { projectId: string };
        const info = await portal.getPublicProjectInfo(params.projectId);
        if (!info) {
          return new Response(
            JSON.stringify({ error: "Project not found or portal disabled" }),
            { status: 404, headers: { "content-type": "application/json" } }
          );
        }
        return info;
      },
    });

    api.registerHttpRoute({
      method: "get",
      path: "/api/portal/:projectId/phases-tasks",
      isPublic: true,
      operation: {
        moduleId: "projects",
        requiredCapabilities: [],
        riskLevel: "low",
        idempotent: true,
      },
      summary: "Get public phases and tasks (portal)",
      tags: ["projects", "portal"],
      request: { params: z.object({ projectId: z.string().min(1) }) },
      responses: {
        200: { description: "Public phases and tasks", schema: z.any() },
      },
      handler: async (ctx) => {
        const params = ctx.params as { projectId: string };
        const phases = await portal.getPublicPhasesAndTasks(params.projectId);
        const generalTasks = await portal.getPublicGeneralTasks(
          params.projectId
        );
        return { phases, general_tasks: generalTasks };
      },
    });

    api.registerHttpRoute({
      method: "post",
      path: "/api/portal/:projectId/requests",
      isPublic: true,
      operation: {
        moduleId: "projects",
        requiredCapabilities: [],
        riskLevel: "high",
        requiresApproval: false,
      },
      summary: "Create request task (portal)",
      tags: ["projects", "portal"],
      request: {
        params: z.object({ projectId: z.string().min(1) }),
        body: z.object({
          title: z.string().min(1),
          content: z.string().optional(),
        }),
      },
      responses: {
        201: { description: "Created request task", schema: phaseTaskSchema },
        404: { description: "Not found", schema: notFoundSchema },
      },
      handler: async (ctx) => {
        const params = ctx.params as { projectId: string };
        const body = ctx.body as { title: string; content?: string };
        const created = await portal.createRequestTask(params.projectId, {
          title: body.title,
          content: body.content ?? null,
        });
        if (!created) {
          return new Response(
            JSON.stringify({ error: "Project not found or portal disabled" }),
            { status: 404, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    });
  }
}
