import {
  createPluginServerGatewayCaller,
  type PluginAuthContext,
  type PluginServerApi,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { createTimeTrackingRepoSupabase } from "../dal/supabase.js";
import {
  addTrackingRowInputSchema,
  phaseIdParamsSchema,
  projectIdParamsSchema,
  simpleOptionSchema,
  tasksCatalogQuerySchema,
  teamMemberSchema,
  timeEntryIdParamsSchema,
  timeEntryInputSchema,
  timeEntryListFiltersSchema,
  timeEntryListResponseSchema,
  timeEntryMoveSchema,
  timeEntrySchema,
  timeEntryUpdateSchema,
  timesheetRowSchema,
  timeTrackingListQuerySchema,
  timeTrackingListResponseSchema,
} from "../schema/zod.js";
import { registerTimeTrackingGatewayMethods } from "./gateway-methods/index.js";
import { getTimeTrackingContext } from "./gateway-methods/read-ops.js";
import {
  getTimeTrackingRepo,
  TEAM_TIME_TRACKING_LIST,
  teamMembersTimeTrackingBridgeAvailable,
} from "./gateway-methods/shared.js";
import { resolveTimeTrackingUserId } from "./resolve-user-id.js";

type Repo = ReturnType<typeof createTimeTrackingRepoSupabase>;
type RepoOrFactory = Repo | ((auth: PluginAuthContext) => Repo);

function getRepo(repoOrFactory: RepoOrFactory, auth?: PluginAuthContext): Repo {
  return getTimeTrackingRepo(repoOrFactory, auth);
}

function parseCsvQueryParam(value: string | null): string[] | undefined {
  if (!value?.trim()) {
    return;
  }
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function parseBooleanQueryParam(value: string | null): boolean | undefined {
  if (value == null || value === "") {
    return;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  return;
}

function operationHttpError(error: unknown): Response {
  if (error instanceof Error) {
    if (error.message === "time_entry_not_found") {
      return new Response(JSON.stringify({ error: "Entry not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (error.message === "Forbidden" || error.message === "forbidden_user") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    if (error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    if (error.message === "time_entry_missing_identity") {
      return new Response(
        JSON.stringify({
          error: "time_entry_missing_identity",
          message: "Time entry requires a project, task, or manual row title.",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }
  }
  throw error;
}

export function registerTimeTrackingApi(
  server: Pick<
    PluginServerApi,
    | "hasOperation"
    | "registerHttpRoute"
    | "registerOperation"
    | "callGatewayMethod"
  >,
  repoOrFactory: RepoOrFactory
) {
  const { invokeOperation } = createPluginServerGatewayCaller(
    server as PluginServerApi
  );
  const gatewayDeps = {
    hasOperation: server.hasOperation.bind(server),
    invokeOperation,
  };

  registerTimeTrackingGatewayMethods(server, repoOrFactory, gatewayDeps);

  const op = (read: boolean) => ({
    moduleId: "time-tracking",
    requiredCapabilities: [
      read ? "module.time-tracking.read" : "module.time-tracking.write",
    ],
    riskLevel: read ? ("low" as const) : ("high" as const),
    idempotent: read,
    requiresApproval: !read,
  });
  const writeOp = { ...op(false), requiresApproval: false as const };

  server.registerHttpRoute({
    method: "get",
    path: "/api/time-tracking/context",
    operation: { ...op(true) },
    summary: "Get time-tracking context",
    tags: ["time-tracking"],
    responses: {
      200: {
        description: "Context",
        schema: z.object({}).passthrough(),
      },
    },
    handler: async (ctx) =>
      getTimeTrackingContext(repoOrFactory, gatewayDeps, ctx.auth),
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/time-tracking",
    operation: { ...op(true) },
    summary: "List rows and entries for week",
    tags: ["time-tracking"],
    request: { query: timeTrackingListQuerySchema },
    responses: {
      200: {
        description: "Week data",
        schema: timeTrackingListResponseSchema,
      },
    },
    handler: async (ctx) => {
      const url = new URL(ctx.request.url);
      const parsed = timeTrackingListQuerySchema.parse({
        user_id: url.searchParams.get("user_id") ?? undefined,
        week_start: url.searchParams.get("week_start") ?? undefined,
      });
      try {
        return await invokeOperation("time_tracking_week_get", parsed, {
          auth: ctx.auth,
        });
      } catch (error) {
        return operationHttpError(error);
      }
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/time-tracking/entries",
    operation: { ...op(true) },
    summary: "List time entries with filters",
    tags: ["time-tracking"],
    request: { query: timeEntryListFiltersSchema },
    responses: {
      200: {
        description: "Filtered entries",
        schema: timeEntryListResponseSchema,
      },
    },
    handler: async (ctx) => {
      const url = new URL(ctx.request.url);
      const parsed = timeEntryListFiltersSchema.parse({
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        user_ids: parseCsvQueryParam(url.searchParams.get("user_ids")),
        project_ids: parseCsvQueryParam(url.searchParams.get("project_ids")),
        phase_ids: parseCsvQueryParam(url.searchParams.get("phase_ids")),
        task_ids: parseCsvQueryParam(url.searchParams.get("task_ids")),
        discipline: url.searchParams.get("discipline") ?? undefined,
        include_manual: parseBooleanQueryParam(
          url.searchParams.get("include_manual")
        ),
        page: url.searchParams.get("page")
          ? Number(url.searchParams.get("page"))
          : undefined,
        page_size: url.searchParams.get("page_size")
          ? Number(url.searchParams.get("page_size"))
          : undefined,
      });
      return invokeOperation("time_tracking_entries_list", parsed, {
        auth: ctx.auth,
      });
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/time-tracking/rows",
    operation: writeOp,
    summary: "Add tracking row placeholder entry",
    tags: ["time-tracking"],
    request: { body: addTrackingRowInputSchema },
    responses: {
      201: { description: "Created placeholder", schema: timesheetRowSchema },
    },
    handler: async (ctx) => {
      const created = await invokeOperation(
        "time_tracking_rows_create",
        ctx.body,
        { auth: ctx.auth }
      );
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  server.registerHttpRoute({
    method: "delete",
    path: "/api/time-tracking/rows/:id",
    operation: { ...writeOp, riskLevel: "critical" as const },
    summary: "Delete timesheet row",
    tags: ["time-tracking"],
    request: { params: timeEntryIdParamsSchema },
    responses: {
      200: { description: "Deleted", schema: z.object({ ok: z.boolean() }) },
    },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof timeEntryIdParamsSchema>;
      try {
        return await invokeOperation(
          "time_tracking_rows_delete",
          { id: params.id },
          { auth: ctx.auth }
        );
      } catch (error) {
        return operationHttpError(error);
      }
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/time-tracking/entries",
    operation: writeOp,
    summary: "Create time entry",
    tags: ["time-tracking"],
    request: { body: timeEntryInputSchema },
    responses: {
      201: { description: "Created", schema: timeEntrySchema },
    },
    handler: async (ctx) => {
      const created = await invokeOperation(
        "time_tracking_entries_create",
        ctx.body,
        { auth: ctx.auth }
      );
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/time-tracking/entries/:id",
    operation: writeOp,
    summary: "Update time entry",
    tags: ["time-tracking"],
    request: { params: timeEntryIdParamsSchema, body: timeEntryUpdateSchema },
    responses: {
      200: { description: "Updated", schema: timeEntrySchema },
    },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof timeEntryIdParamsSchema>;
      try {
        return await invokeOperation(
          "time_tracking_entries_update",
          { id: params.id, ...(ctx.body as object) },
          { auth: ctx.auth }
        );
      } catch (error) {
        return operationHttpError(error);
      }
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/time-tracking/entries/:id/move",
    operation: writeOp,
    summary: "Move entry",
    tags: ["time-tracking"],
    request: { params: timeEntryIdParamsSchema, body: timeEntryMoveSchema },
    responses: {
      200: { description: "Moved", schema: timeEntrySchema },
    },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof timeEntryIdParamsSchema>;
      try {
        return await invokeOperation(
          "time_tracking_entries_move",
          { id: params.id, ...(ctx.body as object) },
          { auth: ctx.auth }
        );
      } catch (error) {
        return operationHttpError(error);
      }
    },
  });

  server.registerHttpRoute({
    method: "delete",
    path: "/api/time-tracking/entries/:id",
    operation: { ...writeOp, riskLevel: "critical" as const },
    summary: "Delete entry",
    tags: ["time-tracking"],
    request: { params: timeEntryIdParamsSchema },
    responses: {
      200: { description: "Deleted", schema: z.object({ ok: z.boolean() }) },
    },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof timeEntryIdParamsSchema>;
      try {
        return await invokeOperation(
          "time_tracking_entries_delete",
          { id: params.id },
          { auth: ctx.auth }
        );
      } catch (error) {
        return operationHttpError(error);
      }
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/time-tracking/catalog/projects",
    operation: { ...op(true) },
    summary: "List projects",
    tags: ["time-tracking", "catalog"],
    responses: {
      200: {
        description: "Projects",
        schema: z.array(
          projectIdParamsSchema.extend({
            title: z.string(),
            client_name: z.string().nullable(),
          })
        ),
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.listProjects();
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/time-tracking/catalog/projects/:id/phases",
    operation: { ...op(true) },
    summary: "List phases",
    tags: ["time-tracking", "catalog"],
    request: { params: projectIdParamsSchema },
    responses: {
      200: { description: "Phases", schema: z.array(simpleOptionSchema) },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof projectIdParamsSchema>;
      return repo.listPhases(params.id);
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/time-tracking/catalog/projects/:id/tasks",
    operation: { ...op(true) },
    summary: "List general (no-phase) tasks for a project",
    tags: ["time-tracking", "catalog"],
    request: { params: projectIdParamsSchema },
    responses: {
      200: { description: "Tasks", schema: z.array(simpleOptionSchema) },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof projectIdParamsSchema>;
      return repo.listProjectGeneralTasks(params.id);
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/time-tracking/catalog/phases/:id/tasks",
    operation: { ...op(true) },
    summary: "List tasks",
    tags: ["time-tracking", "catalog"],
    request: { params: phaseIdParamsSchema },
    responses: {
      200: { description: "Tasks", schema: z.array(simpleOptionSchema) },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof phaseIdParamsSchema>;
      return repo.listTasks(params.id);
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/time-tracking/catalog/tasks",
    operation: { ...op(true) },
    summary: "List tasks for time tracking",
    tags: ["time-tracking", "catalog"],
    request: { query: tasksCatalogQuerySchema },
    responses: {
      200: { description: "Tasks", schema: z.array(simpleOptionSchema) },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      if (url.searchParams.get("include_all") === "true") {
        return repo.listAllTasks();
      }
      const parsed = tasksCatalogQuerySchema.parse({
        user_id: url.searchParams.get("user_id") ?? undefined,
        project_id: url.searchParams.get("project_id") ?? undefined,
        phase_id: url.searchParams.get("phase_id") ?? undefined,
      });
      const resolved = await resolveTimeTrackingUserId(
        repo,
        ctx.auth,
        parsed.user_id
      );
      if ("error" in resolved) {
        return resolved.error;
      }
      return repo.listTasksForUser(resolved.userId, {
        project_id: parsed.project_id,
        phase_id: parsed.phase_id,
      });
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/time-tracking/catalog/tasks/:task_id/collaborator",
    operation: writeOp,
    summary: "Ensure user is a collaborator on a task",
    tags: ["time-tracking", "catalog"],
    responses: {
      200: { description: "OK", schema: z.object({ ok: z.boolean() }) },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as { task_id: string };
      const authUserId = ctx.auth?.principalId ?? "me";
      const body = ctx.body as { user_id?: string } | undefined;
      const targetUserId = body?.user_id ?? authUserId;

      if (targetUserId !== authUserId) {
        const isAdmin = await repo.isPrincipalTenantAdmin(authUserId);
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
      }

      await repo.ensureTaskCollaborator(params.task_id, targetUserId);
      return { ok: true };
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/time-tracking/catalog/team",
    operation: { ...op(true) },
    summary: "List team members",
    tags: ["time-tracking", "catalog"],
    responses: {
      200: { description: "Team members", schema: z.array(teamMemberSchema) },
    },
    handler: async (ctx) => {
      if (!teamMembersTimeTrackingBridgeAvailable(gatewayDeps)) {
        return [];
      }
      const raw = await invokeOperation(
        TEAM_TIME_TRACKING_LIST,
        {},
        { auth: ctx.auth }
      );
      if (!Array.isArray(raw)) {
        return [];
      }
      return raw
        .map((row) => {
          const r = row as Record<string, unknown>;
          const userId = r.user_id == null ? null : String(r.user_id);
          if (!userId) {
            return null;
          }
          return {
            id: userId,
            user_id: userId,
            full_name: String(r.full_name ?? ""),
          };
        })
        .filter(
          (
            row
          ): row is {
            id: string;
            user_id: string;
            full_name: string;
          } => row != null
        );
    },
  });
}
