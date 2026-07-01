import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import type { z } from "@hono/zod-openapi";
import { addDays } from "date-fns";
import {
  timeEntryIdParamsSchema,
  timeEntryListFiltersSchema,
  timeEntryListResponseSchema,
  timeEntrySchema,
  timeEntrySummarizeFiltersSchema,
  timeEntrySummarizeResponseSchema,
  timeEntryWeekQuerySchema,
  timeTrackingContextGetInputSchema,
  timeTrackingContextSchema,
  timeTrackingListResponseSchema,
} from "../../schema/zod.js";
import {
  resolveTimeTrackingEntryFilters,
  resolveTimeTrackingListUserIds,
} from "../resolve-entry-filters.js";
import { resolveTimeTrackingUserId } from "../resolve-user-id.js";
import {
  getTimeTrackingRepo,
  TEAM_TIME_TRACKING_ACTOR,
  type TimeTrackingGatewayDeps,
  type TimeTrackingRepoOrFactory,
  teamMembersTimeTrackingBridgeAvailable,
} from "./shared.js";

function buildWeekEnd(weekStart: string) {
  return addDays(new Date(weekStart), 6).toISOString().slice(0, 10);
}

export async function getTimeTrackingContext(
  repoOrFactory: TimeTrackingRepoOrFactory,
  deps: TimeTrackingGatewayDeps,
  auth?: PluginAuthContext
) {
  const repo = getTimeTrackingRepo(repoOrFactory, auth);
  const principalId = auth?.principalId ?? "me";
  let currentUser = { id: principalId, full_name: "Me" };
  const bridge = teamMembersTimeTrackingBridgeAvailable(deps);
  if (bridge) {
    const raw = await deps.invokeOperation(
      TEAM_TIME_TRACKING_ACTOR,
      { principal_id: principalId },
      { auth }
    );
    if (raw && typeof raw === "object" && "full_name" in raw) {
      currentUser = {
        id: principalId,
        full_name: String((raw as { full_name: unknown }).full_name ?? "Me"),
      };
    }
  }
  const hasProjectsDataSource = await repo.hasProjectsDataSource();
  const hasTasksDataSource = await repo.hasTasksDataSource();
  const isAdmin = await repo.isPrincipalTenantAdmin(principalId);
  return {
    current_user: currentUser,
    is_admin: isAdmin,
    projects_available:
      deps.hasOperation("projects_list") || hasProjectsDataSource,
    tasks_available: deps.hasOperation("tasks_list") || hasTasksDataSource,
    team_available: bridge,
  };
}

export function registerTimeTrackingReadGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation">,
  repoOrFactory: TimeTrackingRepoOrFactory,
  deps: TimeTrackingGatewayDeps
) {
  const readOp = {
    moduleId: "time-tracking",
    requiredCapabilities: ["module.time-tracking.read"],
    riskLevel: "low" as const,
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
  };

  server.registerOperation({
    operationId: "time_tracking_context_get",
    summary: "Get time-tracking context for the current principal",
    ...readOp,
    inputSchema: timeTrackingContextGetInputSchema,
    outputSchema: timeTrackingContextSchema,
    handler: async (_input, ctx) =>
      getTimeTrackingContext(repoOrFactory, deps, ctx.auth),
  });

  server.registerOperation({
    operationId: "time_tracking_entries_list",
    summary: "List time entries in a date range with optional filters",
    ...readOp,
    inputSchema: timeEntryListFiltersSchema,
    outputSchema: timeEntryListResponseSchema,
    handler: async (input, ctx) => {
      const repo = getTimeTrackingRepo(repoOrFactory, ctx.auth);
      const body = input as z.infer<typeof timeEntryListFiltersSchema>;
      const filters = await resolveTimeTrackingEntryFilters(
        repo,
        ctx.auth,
        body
      );
      return repo.listEntries(filters);
    },
  });

  server.registerOperation({
    operationId: "time_tracking_entries_summarize",
    summary: "Summarize time entry hours grouped by dimension",
    ...readOp,
    inputSchema: timeEntrySummarizeFiltersSchema,
    outputSchema: timeEntrySummarizeResponseSchema,
    handler: async (input, ctx) => {
      const repo = getTimeTrackingRepo(repoOrFactory, ctx.auth);
      const body = input as z.infer<typeof timeEntrySummarizeFiltersSchema>;
      const { group_by, ...rest } = body;
      const filters = await resolveTimeTrackingEntryFilters(
        repo,
        ctx.auth,
        rest
      );
      return repo.summarizeEntries(filters, group_by);
    },
  });

  server.registerOperation({
    operationId: "time_tracking_entries_get",
    summary: "Get a single time entry by id",
    ...readOp,
    inputSchema: timeEntryIdParamsSchema,
    outputSchema: timeEntrySchema,
    handler: async (input, ctx) => {
      const repo = getTimeTrackingRepo(repoOrFactory, ctx.auth);
      const { id } = input as z.infer<typeof timeEntryIdParamsSchema>;
      const entry = await repo.getEntry(id);
      if (!entry) {
        throw new Error("time_entry_not_found");
      }
      const principalId = ctx.auth?.principalId ?? "";
      const allowedUserIds = await resolveTimeTrackingListUserIds(
        repo,
        ctx.auth,
        [entry.user_id]
      );
      if (allowedUserIds && !allowedUserIds.includes(entry.user_id)) {
        throw new Error("Forbidden");
      }
      return entry;
    },
  });

  server.registerOperation({
    operationId: "time_tracking_week_get",
    summary: "Get week rows and entries for the time-tracking UI",
    ...readOp,
    inputSchema: timeEntryWeekQuerySchema,
    outputSchema: timeTrackingListResponseSchema,
    handler: async (input, ctx) => {
      const repo = getTimeTrackingRepo(repoOrFactory, ctx.auth);
      const body = input as z.infer<typeof timeEntryWeekQuerySchema>;
      const resolved = await resolveTimeTrackingUserId(
        repo,
        ctx.auth,
        body.user_id
      );
      if ("error" in resolved) {
        throw new Error("forbidden_user");
      }
      const weekEnd = buildWeekEnd(body.week_start);
      const entries = await repo.listWeekEntries(
        resolved.userId,
        body.week_start,
        weekEnd
      );
      const rows = await repo.listRows(resolved.userId, entries);
      return { rows, entries };
    },
  });
}
