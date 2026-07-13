import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmployeesRepo } from "../dal/employees-supabase.js";
import { createEmploymentTimeRepo } from "../dal/employment-time-supabase.js";
import { validateDailyRecord } from "../services/austrian-employment-rules.js";

function getRepo(supabase: unknown, auth?: PluginAuthContext) {
  if (!auth?.tenantId) {
    throw new Error("Tenant required");
  }
  const scopeId = auth.scopeId || "default";
  return createEmploymentTimeRepo(supabase as never, auth.tenantId, scopeId);
}

/** Whether a member profile exists in this tenant/scope (team owns profiles). */
async function profileExists(
  supabase: unknown,
  auth: PluginAuthContext | undefined,
  profileId: string
): Promise<boolean> {
  if (!auth?.tenantId) {
    throw new Error("Tenant required");
  }
  const scopeId = auth.scopeId || "default";
  const { data } = await (supabase as SupabaseClient)
    .schema("module_team")
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("tenant_id", auth.tenantId)
    .eq("scope_id", scopeId)
    .maybeSingle();
  return Boolean(data);
}

export function registerEmploymentTimeRoutes(
  server: Pick<PluginServerApi, "registerHttpRoute">,
  supabase: unknown
) {
  const readCap = ["module.team-hr.read"] as const;
  const writeCap = ["module.team-hr.write"] as const;

  // 1. GET time records
  server.registerHttpRoute({
    method: "get",
    path: "/api/team/members/:id/time-records",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List daily actual time records",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const profileId = (ctx.params as { id: string }).id;
      const url = new URL(ctx.request.url);
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");

      if (!(startDate && endDate)) {
        return new Response(
          JSON.stringify({ error: "start_date and end_date are required" }),
          {
            status: 400,
          }
        );
      }

      return repo.listTimeRecords(profileId, startDate, endDate);
    },
  });

  // 2. POST (Upsert) time record
  server.registerHttpRoute({
    method: "post",
    path: "/api/team/members/:id/time-records",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...writeCap],
      riskLevel: "medium",
      idempotent: false,
    },
    summary: "Upsert a daily actual time record",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const profileId = (ctx.params as { id: string }).id;
      const bodySchema = z.object({
        id: z.string().optional(),
        date: z.string(),
        clock_in: z.string().nullable(),
        clock_out: z.string().nullable(),
        break_minutes: z.number().int().min(0),
        target_hours: z.number().min(0),
        absence_type: z.string().nullable(),
        notes: z.string().nullable().optional(),
      });

      const parsed = bodySchema.parse(await ctx.request.json());

      // Validate using compliance rules
      const { actualHours, warnings } = validateDailyRecord(
        parsed.clock_in,
        parsed.clock_out,
        parsed.break_minutes,
        parsed.target_hours
      );

      // Sickness/Vacation credits regular hours if target_hours > 0 and no times are clocked
      let finalActualHours = actualHours;
      if (
        parsed.absence_type &&
        parsed.absence_type !== "holiday" &&
        actualHours === 0
      ) {
        // If they are sick or on vacation, they are paid their regular target hours
        finalActualHours = parsed.target_hours;
      }

      const result = await repo.upsertTimeRecord({
        id: parsed.id,
        profile_id: profileId,
        date: parsed.date,
        clock_in: parsed.clock_in,
        clock_out: parsed.clock_out,
        break_minutes: parsed.break_minutes,
        actual_hours: finalActualHours,
        target_hours: parsed.target_hours,
        absence_type: parsed.absence_type,
        notes: parsed.notes || null,
      });

      return {
        record: result,
        warnings,
      };
    },
  });

  // 3. GET summary (vacation days consumed/remaining, sick days, carer leave, overtime balance)
  server.registerHttpRoute({
    method: "get",
    path: "/api/team/members/:id/time-summary",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get annual vacation, sick days, carer leave and overtime balance",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const profileId = (ctx.params as { id: string }).id;
      const url = new URL(ctx.request.url);
      const yearStr = url.searchParams.get("year");
      const year = yearStr
        ? Number.parseInt(yearStr, 10)
        : new Date().getFullYear();

      if (!(await profileExists(supabase, ctx.auth, profileId))) {
        return new Response(JSON.stringify({ error: "Member not found" }), {
          status: 404,
        });
      }

      // Vacation/overtime config lives on the employee (HR) record.
      const employee = await createEmployeesRepo(
        supabase,
        ctx.auth?.tenantId ?? "",
        ctx.auth?.scopeId || "default"
      ).getByProfileId(profileId);

      // Fetch absences and time records for this year
      const absences = await repo.listAbsences(profileId, year);
      const records = await repo.listTimeRecords(
        profileId,
        `${year}-01-01`,
        `${year}-12-31`
      );

      // Count vacation days (approved only)
      let vacationDaysConsumed = 0;
      for (const abs of absences) {
        if (abs.absence_type === "vacation" && abs.status === "approved") {
          const start = new Date(abs.start_date);
          const end = new Date(abs.end_date);
          // Simple count of days between start and end (inclusive)
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          vacationDaysConsumed += diffDays;
        }
      }

      // Count other absences from the daily time records (sickness etc.)
      let sickLeaveDays = 0;
      let carerLeaveDays = 0;
      let specialLeaveDays = 0;
      let unpaidLeaveDays = 0;
      let actualHoursSum = 0;
      let targetHoursSum = 0;

      for (const rec of records) {
        actualHoursSum += Number(rec.actual_hours);
        targetHoursSum += Number(rec.target_hours);

        if (rec.absence_type === "sick_leave") {
          sickLeaveDays++;
        } else if (rec.absence_type === "carer_leave") {
          carerLeaveDays++;
        } else if (rec.absence_type === "special_leave") {
          specialLeaveDays++;
        } else if (rec.absence_type === "unpaid_leave") {
          unpaidLeaveDays++;
        }
      }

      const entitlement = Number(employee?.vacation_entitlement_yearly ?? 25);
      const carryover = Number(employee?.vacation_carryover ?? 0);
      const remainingVacation = entitlement + carryover - vacationDaysConsumed;

      const startingOvertime = Number(employee?.overtime_starting_balance ?? 0);
      const netOvertime = actualHoursSum - targetHoursSum;
      const totalOvertimeBalance = startingOvertime + netOvertime;

      return {
        year,
        vacation: {
          entitlement,
          carryover,
          consumed: vacationDaysConsumed,
          remaining: remainingVacation,
        },
        absences: {
          sick_leave: sickLeaveDays,
          carer_leave: carerLeaveDays,
          special_leave: specialLeaveDays,
          unpaid_leave: unpaidLeaveDays,
        },
        overtime: {
          starting_balance: startingOvertime,
          net_this_year: netOvertime,
          total_balance: totalOvertimeBalance,
          actual_hours: actualHoursSum,
          target_hours: targetHoursSum,
        },
      };
    },
  });

  // 4. GET absences
  server.registerHttpRoute({
    method: "get",
    path: "/api/team/members/:id/absences",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List absences for a team member",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const profileId = (ctx.params as { id: string }).id;
      const url = new URL(ctx.request.url);
      const yearStr = url.searchParams.get("year");
      const year = yearStr ? Number.parseInt(yearStr, 10) : undefined;
      return repo.listAbsences(profileId, year);
    },
  });

  // 5. POST (Upsert) absence
  server.registerHttpRoute({
    method: "post",
    path: "/api/team/members/:id/absences",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...writeCap],
      riskLevel: "medium",
      idempotent: false,
    },
    summary: "Create or update an absence record",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const profileId = (ctx.params as { id: string }).id;
      const bodySchema = z.object({
        id: z.string().optional(),
        start_date: z.string(),
        end_date: z.string(),
        absence_type: z.enum([
          "vacation",
          "sick_leave",
          "carer_leave",
          "special_leave",
          "unpaid_leave",
          "time_off_in_lieu",
        ]),
        status: z.enum(["pending", "approved", "rejected"]),
        notes: z.string().nullable().optional(),
      });

      const parsed = bodySchema.parse(await ctx.request.json());
      const approvedBy =
        parsed.status === "approved" ? ctx.auth?.principalId || null : null;

      return repo.upsertAbsence({
        id: parsed.id,
        profile_id: profileId,
        start_date: parsed.start_date,
        end_date: parsed.end_date,
        absence_type: parsed.absence_type,
        status: parsed.status,
        notes: parsed.notes || null,
        approved_by: approvedBy,
      });
    },
  });

  // 6. DELETE absence
  server.registerHttpRoute({
    method: "delete",
    path: "/api/team/absences/:id",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...writeCap],
      riskLevel: "medium",
      idempotent: true,
    },
    summary: "Delete an absence record",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const id = (ctx.params as { id: string }).id;
      await repo.deleteAbsence(id);
      return { ok: true };
    },
  });

  // 7. GET public holidays
  server.registerHttpRoute({
    method: "get",
    path: "/api/team/public-holidays",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List public holidays",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const url = new URL(ctx.request.url);
      const yearStr = url.searchParams.get("year");
      const year = yearStr ? Number.parseInt(yearStr, 10) : undefined;
      const jurisdiction = url.searchParams.get("jurisdiction") || "AT";
      return repo.listPublicHolidays(year, jurisdiction);
    },
  });

  // 8. POST public holiday
  server.registerHttpRoute({
    method: "post",
    path: "/api/team/public-holidays",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...writeCap],
      riskLevel: "medium",
      idempotent: false,
    },
    summary: "Create or update a public holiday",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const bodySchema = z.object({
        id: z.string().optional(),
        date: z.string(),
        jurisdiction: z.string(),
        name: z.string(),
        is_half_day: z.boolean().optional(),
      });

      const parsed = bodySchema.parse(await ctx.request.json());
      return repo.upsertPublicHoliday({
        id: parsed.id,
        date: parsed.date,
        jurisdiction: parsed.jurisdiction,
        name: parsed.name,
        is_half_day: parsed.is_half_day ?? false,
      });
    },
  });

  // 9. DELETE public holiday
  server.registerHttpRoute({
    method: "delete",
    path: "/api/team/public-holidays/:id",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...writeCap],
      riskLevel: "medium",
      idempotent: true,
    },
    summary: "Delete a public holiday",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const id = (ctx.params as { id: string }).id;
      await repo.deletePublicHoliday(id);
      return { ok: true };
    },
  });

  // 10. GET working hours
  server.registerHttpRoute({
    method: "get",
    path: "/api/team/members/:id/working-hours",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List working hours versions for a member",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const profileId = (ctx.params as { id: string }).id;
      return repo.listWorkingHours(profileId);
    },
  });

  // 11. POST working hours
  server.registerHttpRoute({
    method: "post",
    path: "/api/team/members/:id/working-hours",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...writeCap],
      riskLevel: "medium",
      idempotent: false,
    },
    summary: "Create or update working hours version",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const profileId = (ctx.params as { id: string }).id;
      const bodySchema = z.object({
        id: z.string().optional(),
        start_date: z.string(),
        end_date: z.string().nullable(),
        weekly_hours: z.number().min(0),
        schedule: z.any(),
      });

      const parsed = bodySchema.parse(await ctx.request.json());

      // Correct overlap
      const existing = await repo.listWorkingHours(profileId);
      const newStart = new Date(parsed.start_date);
      for (const eh of existing) {
        if (eh.id === parsed.id) {
          continue;
        }
        const ehStart = new Date(eh.start_date);
        if (
          ehStart < newStart &&
          (!eh.end_date || new Date(eh.end_date) >= newStart)
        ) {
          const dayBefore = new Date(newStart);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const pad = (n: number) => String(n).padStart(2, "0");
          const dayBeforeStr = `${dayBefore.getFullYear()}-${pad(dayBefore.getMonth() + 1)}-${pad(dayBefore.getDate())}`;

          await repo.upsertWorkingHours({
            id: eh.id,
            profile_id: profileId,
            start_date: eh.start_date,
            end_date: dayBeforeStr,
            weekly_hours: Number(eh.weekly_hours),
            schedule: eh.schedule,
          });
        }
      }

      return repo.upsertWorkingHours({
        id: parsed.id,
        profile_id: profileId,
        start_date: parsed.start_date,
        end_date: parsed.end_date,
        weekly_hours: parsed.weekly_hours,
        schedule: parsed.schedule,
      });
    },
  });

  // 12. DELETE working hours
  server.registerHttpRoute({
    method: "delete",
    path: "/api/team/working-hours/:id",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: [...writeCap],
      riskLevel: "medium",
      idempotent: true,
    },
    summary: "Delete a working hours version",
    tags: ["team"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const id = (ctx.params as { id: string }).id;
      await repo.deleteWorkingHours(id);
      return { ok: true };
    },
  });
}
