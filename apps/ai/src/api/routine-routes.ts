// Phase 4 — Routines API.
// POST /ai/v1/routines/tick      — execute all due routines for the caller's tenant (pg_cron entry point)
// GET  /ai/v1/routines           — list definitions + per-tenant state
// PATCH /ai/v1/routines/:id/state — enable/disable + schedule override
// POST /ai/v1/routines/:id/run   — run one routine immediately (admin "run now")

import type {
  AiRegistry,
  DynamicAiModuleCapabilityLoader,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CronExpressionParser } from "cron-parser";
import type { Hono } from "hono";
import { z } from "zod";
import type { AiService } from "../ai/index.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentRunStore } from "../dal/agent-sessions/index.js";
import { getNextDueAt, isRoutineDue, isScheduleDue } from "../routines/due.js";
import {
  executeRoutineTarget,
  type RoutineExecutionContext,
} from "../routines/executors.js";
import {
  listAllRoutines,
  type ResolvedRoutine,
  resolveRoutineById,
} from "../routines/routine-registry.js";
import {
  createRoutineStateStore,
  type RoutineStateRow,
} from "../routines/routine-state-store.js";
import { listSystemJobs, type SystemJob } from "../routines/system-jobs.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

const logger = createLogger({ name: "routine-routes" });

export interface RegisterRoutineRoutesOptions {
  aiService: AiService;
  getDb: () => SupabaseClient | null;
  // Tenant-scoped agent registry — validates custom-routine agent_ids. Required:
  // wiring the routes without it would silently skip agent validation.
  getRegistry: (tenantId: string) => Pick<AiRegistry, "getAgentConfig">;
  // Tenant-scoped module capability channel — source of module ROUTINE.md defs.
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  runStore: AgentRunStore | null;
  scopeResolver: AiScopeResolver;
}

const patchStateSchema = z.object({
  enabled: z.boolean().optional(),
  schedule_override: z.string().max(100).nullable().optional(),
});

function runRoutine(
  entry: ResolvedRoutine,
  ctx: RoutineExecutionContext
): Promise<string> {
  return executeRoutineTarget(entry.definition, ctx);
}

function isSystemJobDue(
  job: SystemJob,
  state: RoutineStateRow | null,
  now: Date
): boolean {
  const enabled = state ? state.enabled : (job.enabled_by_default ?? true);
  if (!enabled) {
    return false;
  }
  const schedule = state?.schedule_override?.trim() || job.schedule;
  return isScheduleDue(
    [schedule],
    job.quiet_hours ?? null,
    state?.last_run_at ?? null,
    now
  );
}

export function registerRoutineRoutes(
  app: Hono<any>,
  options: RegisterRoutineRoutesOptions
) {
  const { getDb, aiService, moduleLoader, runStore, scopeResolver } = options;
  const base = `${AI_BASE_PATH}/v1/routines`;

  app.post(`${base}/tick`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const db = getDb();
    if (!db) {
      return c.json({ error: "routines.unconfiguredDatabase" }, 503);
    }
    const stateStore = createRoutineStateStore(db);
    const tenantId = resolved.scope.tenantId;
    const now = new Date();

    const states = await stateStore.listStates(tenantId);
    const stateById = new Map<string, RoutineStateRow>(
      states.map((row) => [row.routine_id, row])
    );

    const ctx: RoutineExecutionContext = {
      authorization: c.req.header("authorization") ?? "",
      db,
      aiService,
      moduleLoader,
      runStore,
      scope: resolved.scope,
    };

    const results: Array<{ result: string; routine_id: string }> = [];
    const allRoutines = await listAllRoutines(db, tenantId, moduleLoader);
    for (const entry of allRoutines) {
      const routineId = entry.definition.id;
      const state = stateById.get(routineId) ?? null;
      if (!isRoutineDue(entry.definition, state, now, entry.schedules)) {
        continue;
      }
      // One failing routine must not block the tick (idempotent + bounded).
      let result: string;
      try {
        result = await runRoutine(entry, ctx);
      } catch (err) {
        result = `error: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn("routine execution failed", { routineId, err: result });
      }
      await stateStore.recordRun({ lastResult: result, routineId, tenantId });
      results.push({ result, routine_id: routineId });
    }

    // System jobs (cleanup, heartbeat) — same tick + state, not routines.
    for (const job of listSystemJobs()) {
      const state = stateById.get(job.id) ?? null;
      if (!isSystemJobDue(job, state, now)) {
        continue;
      }
      let result: string;
      try {
        result = await job.execute(ctx);
      } catch (err) {
        result = `error: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn("system job execution failed", {
          jobId: job.id,
          err: result,
        });
      }
      await stateStore.recordRun({
        lastResult: result,
        routineId: job.id,
        tenantId,
      });
      results.push({ result, routine_id: job.id });
    }

    return c.json({ executed: results, ok: true, tick_at: now.toISOString() });
  });

  app.get(base, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const db = getDb();
    const states = db
      ? await createRoutineStateStore(db).listStates(resolved.scope.tenantId)
      : [];
    const stateById = new Map(states.map((row) => [row.routine_id, row]));

    // Map sessionKey -> threadId so routines can link their deterministic thread.
    const sessions = db
      ? await db
          .schema("ai")
          .from("thread")
          .select("id, route_context")
          .eq("tenant_id", resolved.scope.tenantId)
      : { data: [], error: null };
    if (sessions.error) {
      logger.warn("routine thread lookup failed", {
        error: sessions.error.message,
      });
    }
    const sessionIdBySessionKey = new Map<string, string>();
    for (const row of sessions.data ?? []) {
      const key = row.route_context?.session_key;
      if (typeof key === "string") {
        sessionIdBySessionKey.set(key, row.id);
      }
    }

    const now = new Date();
    const allRoutines = await listAllRoutines(
      db,
      resolved.scope.tenantId,
      moduleLoader
    );
    const routines = allRoutines.map((entry) => {
      const { definition } = entry;
      const state = stateById.get(definition.id) ?? null;

      // Routines create Tasks (no deterministic agent thread); thread_id stays
      // null unless a future mechanism links one.
      const threadId =
        sessionIdBySessionKey.get(`routine:${definition.id}`) ?? null;

      const schedules = entry.schedules ?? [definition.schedule];
      const nextDueAt = getNextDueAt(schedules, now);

      return {
        description: definition.description ?? null,
        enabled: state ? state.enabled : definition.enabled_by_default,
        enabled_by_default: definition.enabled_by_default,
        id: definition.id,
        last_result: state?.last_result ?? null,
        last_run_at: state?.last_run_at ?? null,
        module_id: definition.module_id,
        name: definition.name,
        schedule: definition.schedule,
        schedule_override: state?.schedule_override ?? null,
        target_kind: definition.target.kind,
        // New fields
        source: entry.source ?? "module",
        agent_id: definition.target.agent_id ?? null,
        next_due_at: nextDueAt,
        thread_id: threadId,
        prompt: definition.prompt ?? null,
        schedules,
        quiet_hours: definition.quiet_hours ?? null,
      };
    });
    return c.json({ routines });
  });

  app.patch(`${base}/:id/state`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const routineId = c.req.param("id");
    const db = getDb();
    if (!db) {
      return c.json({ error: "routines.unconfiguredDatabase" }, 503);
    }
    const entry = await resolveRoutineById(
      db,
      resolved.scope.tenantId,
      routineId,
      moduleLoader
    );
    if (!entry) {
      return c.json({ error: "routines.notFound" }, 404);
    }
    const parsed = patchStateSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json(
        { details: parsed.error.issues, error: "routines.invalidInput" },
        400
      );
    }
    try {
      const state = await createRoutineStateStore(db).upsertState({
        enabled: parsed.data.enabled,
        routineId,
        scheduleOverride: parsed.data.schedule_override,
        tenantId: resolved.scope.tenantId,
      });
      return c.json({ state });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to update routine state",
        "routines.internalError",
        err
      );
    }
  });

  app.post(`${base}/:id/run`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const db = getDb();
    const routineId = c.req.param("id");
    const entry = await resolveRoutineById(
      db,
      resolved.scope.tenantId,
      routineId,
      moduleLoader
    );
    const systemJob = entry
      ? null
      : listSystemJobs().find((job) => job.id === routineId);
    if (!(entry || systemJob)) {
      return c.json({ error: "routines.notFound" }, 404);
    }
    const ctx: RoutineExecutionContext = {
      authorization: c.req.header("authorization") ?? "",
      db,
      aiService,
      moduleLoader,
      runStore,
      scope: resolved.scope,
    };
    try {
      const result = entry
        ? await runRoutine(entry, ctx)
        : await (systemJob as SystemJob).execute(ctx);
      if (db) {
        await createRoutineStateStore(db).recordRun({
          lastResult: result,
          routineId,
          tenantId: resolved.scope.tenantId,
        });
      }
      return c.json({ ok: true, result });
    } catch (err) {
      return handleRouteError(
        c,
        "routine run failed",
        "routines.runFailed",
        err
      );
    }
  });

  // CRUD custom routines
  const customRoutineSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).nullable().optional(),
    agent_id: z.string().min(1).max(255),
    prompt: z.string().min(1).max(8192),
    schedules: z.array(z.string()).min(1).max(5),
    enabled: z.boolean().optional(),
    quiet_hours: z.string().max(100).nullable().optional(),
  });

  // The registry exposes custom routines as `custom:<uuid>` while the DB key
  // is the bare uuid — accept both forms on the CRUD routes (single choke point).
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function normalizeCustomRoutineId(param: string): string | null {
    const id = param.startsWith("custom:")
      ? param.slice("custom:".length)
      : param;
    return UUID_RE.test(id) ? id : null;
  }

  function validateCron(cron: string): boolean {
    try {
      CronExpressionParser.parse(cron);
      return true;
    } catch {
      return false;
    }
  }

  app.post(`${base}/custom`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const db = getDb();
    if (!db) {
      return c.json({ error: "routines.unconfiguredDatabase" }, 503);
    }
    const body = await c.req.json().catch(() => ({}));
    const parsed = customRoutineSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { details: parsed.error.issues, error: "routines.invalidInput" },
        400
      );
    }
    const data = parsed.data;
    if (data.agent_id.startsWith("chatbot.")) {
      return c.json({ error: "routines.invalidAgentId" }, 400);
    }
    for (const cron of data.schedules) {
      if (!validateCron(cron)) {
        return c.json({ error: "routines.invalidCron" }, 400);
      }
    }
    const registry = options.getRegistry(resolved.scope.tenantId);
    const agent = await registry.getAgentConfig(data.agent_id);
    if (!agent) {
      return c.json({ error: "routines.agentNotFound" }, 400);
    }

    try {
      const { data: row, error } = await db
        .schema("ai")
        .from("custom_routine")
        .insert({
          tenant_id: resolved.scope.tenantId,
          name: data.name,
          description: data.description ?? null,
          agent_id: data.agent_id,
          prompt: data.prompt,
          schedules: data.schedules,
          enabled: data.enabled ?? true,
          quiet_hours: data.quiet_hours ?? null,
          created_by_user_id: resolved.scope.userId,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }
      return c.json({ routine: row });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to create custom routine",
        "routines.internalError",
        err
      );
    }
  });

  app.patch(`${base}/custom/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const db = getDb();
    if (!db) {
      return c.json({ error: "routines.unconfiguredDatabase" }, 503);
    }
    const id = normalizeCustomRoutineId(c.req.param("id"));
    if (!id) {
      return c.json({ error: "routines.notFound" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const parsed = customRoutineSchema.partial().safeParse(body);
    if (!parsed.success) {
      return c.json(
        { details: parsed.error.issues, error: "routines.invalidInput" },
        400
      );
    }
    const data = parsed.data;
    if (data.agent_id) {
      if (data.agent_id.startsWith("chatbot.")) {
        return c.json({ error: "routines.invalidAgentId" }, 400);
      }
      const registry = options.getRegistry(resolved.scope.tenantId);
      const agent = await registry.getAgentConfig(data.agent_id);
      if (!agent) {
        return c.json({ error: "routines.agentNotFound" }, 400);
      }
    }
    if (data.schedules) {
      for (const cron of data.schedules) {
        if (!validateCron(cron)) {
          return c.json({ error: "routines.invalidCron" }, 400);
        }
      }
    }

    try {
      const { data: row, error } = await db
        .schema("ai")
        .from("custom_routine")
        .update({
          ...(data.name === undefined ? {} : { name: data.name }),
          ...(data.description === undefined
            ? {}
            : { description: data.description ?? null }),
          ...(data.agent_id === undefined ? {} : { agent_id: data.agent_id }),
          ...(data.prompt === undefined ? {} : { prompt: data.prompt }),
          ...(data.schedules === undefined
            ? {}
            : { schedules: data.schedules }),
          ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
          ...(data.quiet_hours === undefined
            ? {}
            : { quiet_hours: data.quiet_hours ?? null }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", resolved.scope.tenantId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }
      return c.json({ routine: row });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to update custom routine",
        "routines.internalError",
        err
      );
    }
  });

  app.delete(`${base}/custom/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const db = getDb();
    if (!db) {
      return c.json({ error: "routines.unconfiguredDatabase" }, 503);
    }
    const id = normalizeCustomRoutineId(c.req.param("id"));
    if (!id) {
      return c.json({ error: "routines.notFound" }, 404);
    }
    try {
      const { error } = await db
        .schema("ai")
        .from("custom_routine")
        .delete()
        .eq("id", id)
        .eq("tenant_id", resolved.scope.tenantId);

      if (error) {
        throw error;
      }

      await db
        .schema("ai")
        .from("routine_state")
        .delete()
        .eq("routine_id", `custom:${id}`)
        .eq("tenant_id", resolved.scope.tenantId);

      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete custom routine",
        "routines.internalError",
        err
      );
    }
  });
}
