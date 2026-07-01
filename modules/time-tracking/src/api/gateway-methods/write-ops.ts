import type { PluginServerApi } from "@engenty/plugin-sdk";
import { type z as ZodType, z } from "@hono/zod-openapi";
import {
  addTrackingRowInputSchema,
  timeEntryIdParamsSchema,
  timeEntryInputSchema,
  timeEntryMoveOperationInputSchema,
  timeEntrySchema,
  timeEntryUpdateOperationInputSchema,
  timesheetRowSchema,
} from "../../schema/zod.js";
import { assertTimeTrackingEntryWriteAccess } from "../resolve-entry-filters.js";
import {
  getTimeTrackingRepo,
  type TimeTrackingRepoOrFactory,
} from "./shared.js";

function hasTimeEntryIdentity(input: {
  manual_phase_title?: string | null;
  manual_project_title?: string | null;
  manual_task_title?: string | null;
  phase_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
}) {
  return Boolean(
    input.project_id ||
      input.phase_id ||
      input.task_id ||
      input.manual_project_title?.trim() ||
      input.manual_phase_title?.trim() ||
      input.manual_task_title?.trim()
  );
}

function assertTimeEntryIdentity(
  input: Parameters<typeof hasTimeEntryIdentity>[0]
) {
  if (!hasTimeEntryIdentity(input)) {
    throw new Error("time_entry_missing_identity");
  }
}

export function registerTimeTrackingWriteGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation">,
  repoOrFactory: TimeTrackingRepoOrFactory
) {
  const writeOp = {
    moduleId: "time-tracking",
    requiredCapabilities: ["module.time-tracking.write"],
    riskLevel: "high" as const,
    idempotent: false,
    dryRunSupported: false,
    requiresApproval: false,
  };

  server.registerOperation({
    operationId: "time_tracking_entries_create",
    summary: "Create time entry",
    ...writeOp,
    inputSchema: timeEntryInputSchema,
    outputSchema: timeEntrySchema,
    handler: async (input, ctx) => {
      const repo = getTimeTrackingRepo(repoOrFactory, ctx.auth);
      const body = input as ZodType.infer<typeof timeEntryInputSchema>;
      const authUserId = ctx.auth?.principalId ?? "me";
      const targetUserId = body.user_id ?? authUserId;
      if (targetUserId !== authUserId) {
        const isAdmin = await repo.isPrincipalTenantAdmin(authUserId);
        if (!isAdmin) {
          throw new Error("Forbidden");
        }
      }
      assertTimeEntryIdentity(body);
      return repo.create({
        user_id: targetUserId,
        date: body.date,
        hours: body.hours,
        notes: body.notes ?? null,
        project_id: body.project_id ?? null,
        phase_id: body.phase_id ?? null,
        task_id: body.task_id ?? null,
        discipline: body.discipline ?? null,
        manual_project_title: body.manual_project_title ?? null,
        manual_phase_title: body.manual_phase_title ?? null,
        manual_task_title: body.manual_task_title ?? null,
        created_by: authUserId,
      });
    },
  });

  server.registerOperation({
    operationId: "time_tracking_entries_update",
    summary: "Update time entry",
    ...writeOp,
    inputSchema: timeEntryUpdateOperationInputSchema,
    outputSchema: timeEntrySchema,
    handler: async (input, ctx) => {
      const repo = getTimeTrackingRepo(repoOrFactory, ctx.auth);
      const body = input as ZodType.infer<
        typeof timeEntryUpdateOperationInputSchema
      >;
      const { id, ...patch } = body;
      const existing = await repo.getEntry(id);
      await assertTimeTrackingEntryWriteAccess(repo, ctx.auth, existing);
      const updated = await repo.update(id, {
        ...(patch.discipline === undefined
          ? {}
          : { discipline: patch.discipline }),
        ...(patch.hours === undefined ? {} : { hours: patch.hours }),
        ...(patch.notes === undefined ? {} : { notes: patch.notes }),
      });
      if (!updated) {
        throw new Error("time_entry_not_found");
      }
      return updated;
    },
  });

  server.registerOperation({
    operationId: "time_tracking_entries_move",
    summary: "Move time entry to another row or date",
    ...writeOp,
    inputSchema: timeEntryMoveOperationInputSchema,
    outputSchema: timeEntrySchema,
    handler: async (input, ctx) => {
      const repo = getTimeTrackingRepo(repoOrFactory, ctx.auth);
      const body = input as ZodType.infer<
        typeof timeEntryMoveOperationInputSchema
      >;
      const { id, ...patch } = body;
      const existing = await repo.getEntry(id);
      await assertTimeTrackingEntryWriteAccess(repo, ctx.auth, existing);
      const moved = await repo.move(id, patch);
      if (!moved) {
        throw new Error("time_entry_not_found");
      }
      return moved;
    },
  });

  server.registerOperation({
    operationId: "time_tracking_entries_delete",
    summary: "Delete time entry",
    ...writeOp,
    riskLevel: "critical" as const,
    inputSchema: timeEntryIdParamsSchema,
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getTimeTrackingRepo(repoOrFactory, ctx.auth);
      const { id } = input as ZodType.infer<typeof timeEntryIdParamsSchema>;
      const existing = await repo.getEntry(id);
      await assertTimeTrackingEntryWriteAccess(repo, ctx.auth, existing);
      await repo.delete(id);
      return { ok: true };
    },
  });

  server.registerOperation({
    operationId: "time_tracking_rows_create",
    summary: "Create timesheet row",
    ...writeOp,
    inputSchema: addTrackingRowInputSchema,
    outputSchema: timesheetRowSchema,
    handler: async (input, ctx) => {
      const repo = getTimeTrackingRepo(repoOrFactory, ctx.auth);
      const body = input as ZodType.infer<typeof addTrackingRowInputSchema>;
      const authUserId = ctx.auth?.principalId ?? "me";
      const targetUserId = body.user_id ?? authUserId;
      if (targetUserId !== authUserId) {
        const isAdmin = await repo.isPrincipalTenantAdmin(authUserId);
        if (!isAdmin) {
          throw new Error("Forbidden");
        }
      }
      assertTimeEntryIdentity(body);
      return repo.createRow(targetUserId, body.date, {
        project_id: body.project_id ?? null,
        phase_id: body.phase_id ?? null,
        task_id: body.task_id ?? null,
        discipline: body.discipline ?? null,
        manual_project_title: body.manual_project_title ?? null,
        manual_phase_title: body.manual_phase_title ?? null,
        manual_task_title: body.manual_task_title ?? null,
      });
    },
  });

  server.registerOperation({
    operationId: "time_tracking_rows_delete",
    summary: "Delete timesheet row",
    ...writeOp,
    riskLevel: "critical" as const,
    inputSchema: timeEntryIdParamsSchema,
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getTimeTrackingRepo(repoOrFactory, ctx.auth);
      const { id } = input as ZodType.infer<typeof timeEntryIdParamsSchema>;
      // Delete row and cascade delete entries
      await repo.deleteRow(id);
      return { ok: true };
    },
  });
}
