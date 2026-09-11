// Routines API — the management surface for jobs on a mounted specialist.
//
// GET    /ai/v1/routines                       — list (+ triggers, next_due_at)
// POST   /ai/v1/routines                       — create (with initial triggers)
// GET    /ai/v1/routines/:id                   — one routine (+ triggers)
// PATCH  /ai/v1/routines/:id                   — update behaviour (name, outcome…)
// DELETE /ai/v1/routines/:id                   — delete (custom routines only)
// POST   /ai/v1/routines/:id/triggers          — add a wake source
// PATCH  /ai/v1/routines/:id/triggers/:tid     — change a wake source
// DELETE /ai/v1/routines/:id/triggers/:tid     — remove one (never the last)
// POST   /ai/v1/routines/:id/run               — run now (bypasses quiet hours)
// GET    /ai/v1/routines/:id/runs              — this routine's run history
// POST   /ai/v1/routines/reconcile             — full reconcile (admin)
//
// A routine is the standing arrangement (behaviour: outcome, report, quiet
// hours); its wake sources are 1..n trigger rows. A fire starts a RUN, never a
// Task. Scheduled fires happen in src/scheduler/heartbeat-hooks; everything
// here is the human/agent-facing door onto the same `fireRoutine`.
import type {
  AiRegistry,
  DynamicAiModuleCapabilityLoader,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Mastra } from "@mastra/core/mastra";
import type { Hono } from "hono";
import { z } from "zod";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import {
  createRoutineStoreFromEnv,
  createRoutineTriggerStoreFromEnv,
  createWorkflowRunStoreFromEnv,
  createWorkflowStoreFromEnv,
} from "../ai/index.js";
import { dispatchRoutineEvent } from "../ai/routines/dispatch-event.js";
import { mapEventInput } from "../ai/routines/event-input.js";
import { fireRoutine } from "../ai/routines/fire-routine.js";
import { isOwnerMissingResult } from "../ai/routines/owner-paused.js";
import {
  assertRoutineEligibleAgent,
  assertValidSchedule,
  findDuplicateRoutine,
  RoutineValidationError,
} from "../ai/routines/routine-validation.js";
import { getServiceAccessToken } from "../ai/service-credential.js";
import {
  type AiSessionScope,
  scopeCoversCapability,
} from "../ai/sessions/types.js";
import { capabilityForModuleOperation } from "../ai/workflows/capabilities.js";
import {
  materializePromptWorkflow,
  PROMPT_ROUTINE_MAX_CHARS,
  PromptWorkflowInvalidError,
  promptOfWorkflowGraph,
} from "../ai/workflows/prompt-workflow.js";
import { validateGraphAction } from "../ai/workflows/validate-graph.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { RoutineRow } from "../dal/routines/routine-store.js";
import type {
  RoutineTriggerRow,
  RoutineTriggerStore,
} from "../dal/routines/routine-trigger-store.js";
import {
  deleteRoutineSchedule,
  reconcileScheduler,
  syncTriggerSchedule,
} from "../scheduler/heartbeat-sync.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

const logger = createLogger({ name: "routine-routes" });

export interface RegisterRoutineRoutesOptions {
  /** Tenant-scoped agent registry — validates the owning specialist id. */
  getRegistry: (tenantId: string) => Pick<AiRegistry, "getAgentConfig">;
  mastra: Mastra;
  /** Source of module trigger declarations for the reconcile route. */
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  scopeResolver: AiScopeResolver;
}

/**
 * How an event payload becomes a Workflow's input. Same grammar the canvas uses
 * for its mapping nodes, with the event payload as `initData`; omitted means
 * the payload itself is the input.
 */
const inputMappingSchema = z.record(
  z.string().min(1).max(128),
  z.union([
    z.object({ value: z.unknown() }),
    z.object({ initData: z.literal(true), path: z.string().max(255) }),
    z.object({ template: z.string().max(2000) }),
  ])
);

/** One wake source. `kind` decides which of the other fields matter. */
const triggerSchema = z.object({
  cron: z.string().min(1).max(100).nullable().optional(),
  enabled: z.boolean().optional(),
  event_filter: z.record(z.string(), z.unknown()).nullable().optional(),
  input_mapping: inputMappingSchema.nullable().optional(),
  kind: z.enum(["schedule", "event", "manual", "agent"]),
  provider_id: z.enum(["module-events", "webhook"]).nullable().optional(),
  resource: z.string().max(255).nullable().optional(),
  /** Manual kind: a short key a person can invoke the routine by. */
  shortcode: z.string().min(1).max(64).nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
});

/**
 * The routine's own body — behaviour only. Wake sources are trigger rows and
 * have their own endpoints; a PATCH here never touches them (beyond `enabled`
 * acting as the master pause).
 */
const routineBaseSchema = z.object({
  /** Static input every fire supplies; a node resolves anything dynamic. */
  workflow_input: z.record(z.string(), z.unknown()).optional(),
  agent_id: z.string().min(1).max(255).optional(),
  /** Operation ids a fire may execute without asking. */
  approval_grants: z.array(z.string().min(1)).max(64).optional(),
  description: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(255).optional(),
  /**
   * The routine's PROMISE: what a fire must have achieved to count as done.
   * Prose, deliberately not a schema — a specialist answers in prose, and an
   * Action that needs a typed result already has its own output schema.
   */
  outcome: z.string().max(4000).nullable().optional(),
  /**
   * A prompt routine's body. The server keeps a one-node workflow in step
   * with it (`prompt-workflow.ts`); the routine still binds a workflow id.
   */
  prompt: z.string().trim().min(1).max(PROMPT_ROUTINE_MAX_CHARS).optional(),
  quiet_hours: z.string().max(100).nullable().optional(),
  report: z.enum(["quiet", "desk_card", "ask"]).optional(),
  /** The bound workflow (`ai.workflow.id`). A routine names one — always. */
  workflow_id: z.string().uuid().optional(),
});

const createRoutineSchema = routineBaseSchema
  .extend({
    agent_id: z.string().min(1).max(255),
    name: z.string().min(1).max(255),
    /**
     * The Space the routine belongs to. Omitted means the tenant's default —
     * what module-declared routines want, but a routine created from inside a
     * Space must send it or its runs land in the wrong Space.
     */
    space_id: z.string().uuid().optional(),
    /** Initial wake sources. Omitted = the standard manual + agent pair. */
    triggers: z.array(triggerSchema).min(1).max(16).optional(),
  })
  .refine((body) => Boolean(body.workflow_id || body.prompt), {
    message: "A routine runs a workflow or a prompt — pass one of them.",
    path: ["workflow_id"],
  });

type TriggerBody = z.infer<typeof triggerSchema>;

/** Reject a wake source that can never fire. */
function assertWakeSource(trigger: {
  cron?: string | null;
  kind: string;
  provider_id?: string | null;
  resource?: string | null;
  timezone?: string | null;
}): void {
  if (trigger.kind === "schedule") {
    if (!trigger.cron) {
      throw new RoutineValidationError(
        "routines.cronRequired",
        "a scheduled trigger needs a cron expression"
      );
    }
    assertValidSchedule(trigger.cron, trigger.timezone);
    return;
  }
  if (trigger.kind === "event") {
    if (!trigger.provider_id) {
      throw new RoutineValidationError(
        "routines.providerRequired",
        "an event trigger needs a provider_id"
      );
    }
    if (trigger.provider_id === "module-events" && !trigger.resource) {
      throw new RoutineValidationError(
        "routines.resourceRequired",
        "a module-event trigger needs the event name in `resource`"
      );
    }
  }
}

export function registerRoutineRoutes(
  // Matches every other route module here: the app carries app-specific
  // bindings that each registrar would otherwise have to restate.
  app: Hono<any>,
  options: RegisterRoutineRoutesOptions
): void {
  const { getRegistry, mastra, moduleLoader, scopeResolver } = options;
  const base = `${AI_BASE_PATH}/v1/routines`;

  const stores = () => {
    const routines = createRoutineStoreFromEnv();
    const flowGraphs = createWorkflowStoreFromEnv();
    const requests = createWorkflowRunStoreFromEnv();
    const triggers = createRoutineTriggerStoreFromEnv();
    return routines && flowGraphs && requests && triggers
      ? { flowGraphs, requests, routines, triggers }
      : null;
  };

  /** The owning specialist must exist and be allowed to own a routine. */
  async function validateOwner(
    tenantId: string,
    agentId: string,
    source: "custom" | "module"
  ): Promise<void> {
    const config = await getRegistry(tenantId).getAgentConfig(agentId);
    if (!config) {
      throw new RoutineValidationError(
        "routines.agentNotFound",
        `no agent '${agentId}' in this tenant's registry`
      );
    }
    assertRoutineEligibleAgent(config, source);
  }

  /**
   * Bring every schedule trigger's Mastra schedule in line with its row and
   * persist changed ids back. The rows are the source of truth; the schedules
   * are the derived half. A trigger that stopped being schedule-kind gets its
   * schedule deleted.
   */
  async function syncRoutineTriggers(
    routine: RoutineRow,
    triggerStore: RoutineTriggerStore
  ): Promise<RoutineTriggerRow[]> {
    const rows = await triggerStore.list({
      routineId: routine.id,
      tenantId: routine.tenant_id,
    });
    const synced: RoutineTriggerRow[] = [];
    for (const trigger of rows) {
      if (trigger.kind !== "schedule" && trigger.schedule_id) {
        await deleteRoutineSchedule(mastra, trigger.schedule_id);
        synced.push(
          await triggerStore.update({
            id: trigger.id,
            scheduleId: null,
            tenantId: routine.tenant_id,
          })
        );
        continue;
      }
      const scheduleId = await syncTriggerSchedule(
        mastra,
        routine.tenant_id,
        routine,
        trigger
      );
      if (scheduleId && scheduleId !== trigger.schedule_id) {
        synced.push(
          await triggerStore.update({
            id: trigger.id,
            scheduleId,
            tenantId: routine.tenant_id,
          })
        );
        continue;
      }
      synced.push(trigger);
    }
    return synced;
  }

  /** Group a tenant's triggers by routine id. */
  async function triggersByRoutine(
    triggerStore: RoutineTriggerStore,
    tenantId: string
  ): Promise<Map<string, RoutineTriggerRow[]>> {
    const rows = await triggerStore.list({ tenantId });
    const map = new Map<string, RoutineTriggerRow[]>();
    for (const row of rows) {
      const list = map.get(row.routine_id) ?? [];
      list.push(row);
      map.set(row.routine_id, list);
    }
    return map;
  }

  /** Attach next_due_at to every schedule trigger, from its live schedule. */
  async function withNextDue(
    triggers: RoutineTriggerRow[]
  ): Promise<(RoutineTriggerRow & { next_due_at: string | null })[]> {
    return await Promise.all(
      triggers.map(async (trigger) => {
        if (!trigger.schedule_id) {
          return { ...trigger, next_due_at: null };
        }
        try {
          const schedule = await mastra.schedules.get(trigger.schedule_id);
          return {
            ...trigger,
            next_due_at:
              (schedule as { nextRunAt?: string | null } | null)?.nextRunAt ??
              null,
          };
        } catch {
          // A schedule the sweep has not caught up with yet is not an error.
          return { ...trigger, next_due_at: null };
        }
      })
    );
  }

  /** The wire shape: routine + its triggers + the earliest next fire. */
  async function presentRoutine(
    routine: RoutineRow,
    triggers: RoutineTriggerRow[]
  ): Promise<Record<string, unknown>> {
    const withDue = await withNextDue(triggers);
    const nextDue = withDue
      .map((trigger) => trigger.next_due_at)
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    // A prompt routine reads back as its prompt, so the UI can show and
    // edit the text instead of a one-node canvas.
    const current = await stores()?.flowGraphs.getCurrent({
      id: routine.workflow_id,
      tenantId: routine.tenant_id,
    });
    return {
      ...routine,
      next_due_at: nextDue ?? null,
      prompt: promptOfWorkflowGraph(current?.version.graph),
      triggers: withDue,
    };
  }

  /** The prompt's one-node workflow, written and published as the caller. */
  async function bindPromptWorkflow(input: {
    agentId: string;
    prompt: string;
    routineName: string;
    scope: AiSessionScope;
    workflowId?: string | null;
  }): Promise<string> {
    const deps = stores();
    if (!deps) {
      throw new Error("routine storage is not configured.");
    }
    const scope = input.scope;
    const { workflowId } = await materializePromptWorkflow({
      agentId: input.agentId,
      prompt: input.prompt,
      routineName: input.routineName,
      store: deps.flowGraphs,
      tenantId: scope.tenantId,
      userId: scope.userId || null,
      validate: (definition) =>
        validateGraphAction(definition, {
          capabilityForOperation: capabilityForModuleOperation,
          holdsCapability: (capabilityId: string) =>
            scopeCoversCapability(scope, capabilityId),
        }),
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
    });
    return workflowId;
  }

  app.get(base, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const spaceId = c.req.query("space_id");
      const agentId = c.req.query("agent_id");
      const rows = await deps.routines.list({
        tenantId: resolved.scope.tenantId,
        ...(spaceId ? { spaceId } : {}),
        ...(agentId ? { agentId } : {}),
      });
      const grouped = await triggersByRoutine(
        deps.triggers,
        resolved.scope.tenantId
      );
      const routines = await Promise.all(
        rows.map((routine) =>
          presentRoutine(routine, grouped.get(routine.id) ?? [])
        )
      );
      return c.json({ routines });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list routines",
        "routines.internalError",
        err
      );
    }
  });

  app.post(base, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const body = createRoutineSchema.parse(await c.req.json());
      // Every routine can be pressed and invoked unless said otherwise — the
      // same defaults the unification migration applied.
      const triggerBodies: TriggerBody[] = body.triggers ?? [
        { kind: "manual" },
        { kind: "agent" },
      ];
      for (const trigger of triggerBodies) {
        assertWakeSource(trigger);
      }
      await validateOwner(resolved.scope.tenantId, body.agent_id, "custom");
      // A prompt becomes its own published one-node workflow; either way the
      // binding must name a runnable workflow at write time.
      const workflowId = body.prompt
        ? await bindPromptWorkflow({
            agentId: body.agent_id,
            prompt: body.prompt,
            routineName: body.name,
            scope: resolved.scope,
          })
        : (body.workflow_id as string);
      const workflow = await deps.flowGraphs.getCurrent({
        id: workflowId,
        tenantId: resolved.scope.tenantId,
      });
      if (!workflow) {
        return c.json({ error: "routines.workflowUnresolved" }, 400);
      }

      const created = await deps.routines.create({
        workflowInput: body.workflow_input ?? {},
        agentId: body.agent_id,
        approvalGrants: body.approval_grants ?? [],
        createdByUserId: resolved.scope.userId || null,
        description: body.description ?? null,
        enabled: body.enabled ?? true,
        name: body.name,
        outcome: body.outcome ?? null,
        quietHours: body.quiet_hours ?? null,
        report: body.report ?? "desk_card",
        source: "custom",
        spaceId: body.space_id ?? null,
        tenantId: resolved.scope.tenantId,
        workflowId,
      });
      const createdTriggers: RoutineTriggerRow[] = [];
      for (const trigger of triggerBodies) {
        createdTriggers.push(
          await deps.triggers.create({
            cron: trigger.cron ?? null,
            enabled: trigger.enabled ?? true,
            eventFilter: trigger.event_filter ?? null,
            inputMapping: trigger.input_mapping ?? null,
            kind: trigger.kind,
            providerId: trigger.provider_id ?? null,
            resource: trigger.resource ?? null,
            routineId: created.id,
            shortcode: trigger.shortcode ?? null,
            tenantId: resolved.scope.tenantId,
            timezone: trigger.timezone ?? null,
          })
        );
      }

      // Duplicate check AFTER the write so the comparison runs against real
      // rows, then roll back — the alternative is re-implementing the row
      // shape in the comparator and drifting from it.
      const siblings = await deps.routines.list({
        tenantId: resolved.scope.tenantId,
        ...(created.space_id ? { spaceId: created.space_id } : {}),
      });
      const grouped = await triggersByRoutine(
        deps.triggers,
        resolved.scope.tenantId
      );
      const duplicate = findDuplicateRoutine(
        siblings.map((routine) => ({
          routine,
          triggers: grouped.get(routine.id) ?? [],
        })),
        { routine: created, triggers: createdTriggers }
      );
      if (duplicate) {
        await deps.routines.delete({
          id: created.id,
          tenantId: resolved.scope.tenantId,
        });
        return c.json(
          {
            error: "routines.alreadyExists",
            existing: { id: duplicate.id, name: duplicate.name },
            message: `'${duplicate.name}' already wakes at the same time to run the same worker in this Space. Edit that routine instead. Do NOT retry with a shifted schedule or a different name to get around this.`,
          },
          409
        );
      }

      // A row whose schedule could not be created would look configured and
      // never fire, so the row goes with it (cascade removes the triggers).
      try {
        const synced = await syncRoutineTriggers(created, deps.triggers);
        return c.json({ routine: await presentRoutine(created, synced) }, 201);
      } catch (err) {
        await deps.routines.delete({
          id: created.id,
          tenantId: resolved.scope.tenantId,
        });
        throw err;
      }
    } catch (err) {
      if (err instanceof RoutineValidationError) {
        return c.json(
          { error: err.code, message: err.message },
          err.status as 400
        );
      }
      if (err instanceof PromptWorkflowInvalidError) {
        return c.json(
          { error: "routines.promptInvalid", issues: err.issues },
          400
        );
      }
      return handleRouteError(
        c,
        "failed to create routine",
        "routines.internalError",
        err
      );
    }
  });

  app.get(`${base}/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const routine = await deps.routines.get({
        id: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      if (!routine) {
        return c.json({ error: "routines.notFound" }, 404);
      }
      const triggers = await deps.triggers.list({
        routineId: routine.id,
        tenantId: resolved.scope.tenantId,
      });
      return c.json({ routine: await presentRoutine(routine, triggers) });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to read routine",
        "routines.internalError",
        err
      );
    }
  });

  app.patch(`${base}/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const body = routineBaseSchema.parse(await c.req.json());
      const existing = await deps.routines.get({
        id: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      if (!existing) {
        return c.json({ error: "routines.notFound" }, 404);
      }
      // A new prompt re-briefs the routine's own prompt workflow (a new
      // version, same row) — or mints one when it ran a canvas workflow.
      const promptWorkflowId = body.prompt
        ? await bindPromptWorkflow({
            agentId: body.agent_id ?? existing.agent_id,
            prompt: body.prompt,
            routineName: body.name ?? existing.name,
            scope: resolved.scope,
            workflowId: existing.workflow_id,
          })
        : null;
      const workflowId = promptWorkflowId ?? body.workflow_id;
      if (workflowId) {
        const workflow = await deps.flowGraphs.getCurrent({
          id: workflowId,
          tenantId: resolved.scope.tenantId,
        });
        if (!workflow) {
          return c.json({ error: "routines.workflowUnresolved" }, 400);
        }
      }
      if (body.agent_id) {
        await validateOwner(
          resolved.scope.tenantId,
          body.agent_id,
          existing.source
        );
      }

      const updated = await deps.routines.update({
        id: existing.id,
        tenantId: resolved.scope.tenantId,
        ...(workflowId === undefined ? {} : { workflowId }),
        ...(body.workflow_input === undefined
          ? {}
          : { workflowInput: body.workflow_input }),
        ...(body.agent_id === undefined ? {} : { agentId: body.agent_id }),
        ...(body.approval_grants === undefined
          ? {}
          : { approvalGrants: body.approval_grants }),
        ...(body.description === undefined
          ? {}
          : { description: body.description }),
        // A person's toggle outranks the owner sweep's pause: clearing its
        // marker keeps the sweep from resuming what they just paused.
        ...(body.enabled === undefined
          ? {}
          : {
              enabled: body.enabled,
              ...(isOwnerMissingResult(existing.last_result)
                ? { lastResult: null }
                : {}),
            }),
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.outcome === undefined ? {} : { outcome: body.outcome }),
        ...(body.quiet_hours === undefined
          ? {}
          : { quietHours: body.quiet_hours }),
        ...(body.report === undefined ? {} : { report: body.report }),
      });
      // The master switch and the name live on the routine but are stamped
      // onto every derived schedule — re-sync them all.
      const synced = await syncRoutineTriggers(updated, deps.triggers);
      return c.json({ routine: await presentRoutine(updated, synced) });
    } catch (err) {
      if (err instanceof RoutineValidationError) {
        return c.json(
          { error: err.code, message: err.message },
          err.status as 400
        );
      }
      if (err instanceof PromptWorkflowInvalidError) {
        return c.json(
          { error: "routines.promptInvalid", issues: err.issues },
          400
        );
      }
      return handleRouteError(
        c,
        "failed to update routine",
        "routines.internalError",
        err
      );
    }
  });

  app.delete(`${base}/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const routine = await deps.routines.get({
        id: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      if (!routine) {
        return c.json({ error: "routines.notFound" }, 404);
      }
      if (routine.source === "module") {
        // A module declaration would recreate it on the next reconcile;
        // disabling is what the user actually wants.
        return c.json({ error: "routines.moduleOwned" }, 400);
      }
      const triggers = await deps.triggers.list({
        routineId: routine.id,
        tenantId: resolved.scope.tenantId,
      });
      await deps.routines.delete({
        id: routine.id,
        tenantId: resolved.scope.tenantId,
      });
      for (const trigger of triggers) {
        await deleteRoutineSchedule(mastra, trigger.schedule_id);
      }
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete routine",
        "routines.internalError",
        err
      );
    }
  });

  app.post(`${base}/:id/triggers`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const body = triggerSchema.parse(await c.req.json());
      assertWakeSource(body);
      const routine = await deps.routines.get({
        id: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      if (!routine) {
        return c.json({ error: "routines.notFound" }, 404);
      }
      await deps.triggers.create({
        cron: body.cron ?? null,
        enabled: body.enabled ?? true,
        eventFilter: body.event_filter ?? null,
        inputMapping: body.input_mapping ?? null,
        kind: body.kind,
        providerId: body.provider_id ?? null,
        resource: body.resource ?? null,
        routineId: routine.id,
        shortcode: body.shortcode ?? null,
        tenantId: resolved.scope.tenantId,
        timezone: body.timezone ?? null,
      });
      const synced = await syncRoutineTriggers(routine, deps.triggers);
      return c.json({ routine: await presentRoutine(routine, synced) }, 201);
    } catch (err) {
      if (err instanceof RoutineValidationError) {
        return c.json(
          { error: err.code, message: err.message },
          err.status as 400
        );
      }
      return handleRouteError(
        c,
        "failed to add trigger",
        "routines.internalError",
        err
      );
    }
  });

  app.patch(`${base}/:id/triggers/:triggerId`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const body = triggerSchema.partial().parse(await c.req.json());
      const routine = await deps.routines.get({
        id: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      const existing = await deps.triggers.get({
        id: c.req.param("triggerId"),
        tenantId: resolved.scope.tenantId,
      });
      if (!(routine && existing) || existing.routine_id !== routine.id) {
        return c.json({ error: "routines.notFound" }, 404);
      }
      // Validate the MERGED trigger: a patch that only moves the cron must not
      // have to restate the kind.
      assertWakeSource({
        cron: body.cron === undefined ? existing.cron : body.cron,
        kind: body.kind ?? existing.kind,
        provider_id:
          body.provider_id === undefined
            ? existing.provider_id
            : body.provider_id,
        resource:
          body.resource === undefined ? existing.resource : body.resource,
        timezone:
          body.timezone === undefined ? existing.timezone : body.timezone,
      });
      await deps.triggers.update({
        id: existing.id,
        tenantId: resolved.scope.tenantId,
        ...(body.cron === undefined ? {} : { cron: body.cron }),
        ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
        ...(body.event_filter === undefined
          ? {}
          : { eventFilter: body.event_filter }),
        ...(body.input_mapping === undefined
          ? {}
          : { inputMapping: body.input_mapping }),
        ...(body.kind === undefined ? {} : { kind: body.kind }),
        ...(body.provider_id === undefined
          ? {}
          : { providerId: body.provider_id }),
        ...(body.resource === undefined ? {} : { resource: body.resource }),
        ...(body.shortcode === undefined ? {} : { shortcode: body.shortcode }),
        ...(body.timezone === undefined ? {} : { timezone: body.timezone }),
      });
      const synced = await syncRoutineTriggers(routine, deps.triggers);
      return c.json({ routine: await presentRoutine(routine, synced) });
    } catch (err) {
      if (err instanceof RoutineValidationError) {
        return c.json(
          { error: err.code, message: err.message },
          err.status as 400
        );
      }
      return handleRouteError(
        c,
        "failed to update trigger",
        "routines.internalError",
        err
      );
    }
  });

  app.delete(`${base}/:id/triggers/:triggerId`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const routine = await deps.routines.get({
        id: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      const existing = await deps.triggers.get({
        id: c.req.param("triggerId"),
        tenantId: resolved.scope.tenantId,
      });
      if (!(routine && existing) || existing.routine_id !== routine.id) {
        return c.json({ error: "routines.notFound" }, 404);
      }
      const siblings = await deps.triggers.list({
        routineId: routine.id,
        tenantId: resolved.scope.tenantId,
      });
      if (siblings.length <= 1) {
        // A routine with no wake source at all cannot ever run — disable a
        // trigger instead of deleting the last one.
        return c.json({ error: "routines.lastTrigger" }, 400);
      }
      await deleteRoutineSchedule(mastra, existing.schedule_id);
      await deps.triggers.delete({
        id: existing.id,
        tenantId: resolved.scope.tenantId,
      });
      const remaining = await deps.triggers.list({
        routineId: routine.id,
        tenantId: resolved.scope.tenantId,
      });
      return c.json({ routine: await presentRoutine(routine, remaining) });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete trigger",
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
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const routine = await deps.routines.get({
        id: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      if (!routine) {
        return c.json({ error: "routines.notFound" }, 404);
      }
      const result = await fireRoutine({
        flowGraphs: deps.flowGraphs,
        // A person asked for this one: quiet hours protect against unattended
        // noise, not against being used.
        honorQuietHours: false,
        requests: deps.requests,
        routine,
        routines: deps.routines,
        trigger: "direct",
      });
      return c.json({
        ok: true,
        request_id: result.requestId ?? null,
        run_id: result.runId ?? null,
        skipped: result.skipped ?? null,
        thread_id: result.threadId ?? null,
      });
    } catch (err) {
      if (err instanceof RoutineValidationError) {
        return c.json(
          { error: err.code, message: err.message },
          err.status as 400
        );
      }
      return handleRouteError(
        c,
        "failed to run routine",
        "routines.internalError",
        err
      );
    }
  });

  app.get(`${base}/:id/runs`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const runs = await deps.requests.listByRoutine({
        limit: Number(c.req.query("limit") ?? 50),
        routineId: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      return c.json({ runs });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list routine runs",
        "routines.internalError",
        err
      );
    }
  });

  /**
   * Module-event ingestion.
   *
   * The plugin event bus is in-process in apps/core, where module plugins
   * load; this is the edge that brings those events across to the triggers
   * that listen for them. Service-authenticated, because the caller is the
   * core process rather than a person. This process's own record events
   * (Space tables) reach the same dispatcher over the in-process bus.
   */
  app.post(`${base}/events`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const body = z
        .object({
          payload: z.record(z.string(), z.unknown()).default({}),
          resource: z.string().min(1).max(255),
        })
        .parse(await c.req.json());
      const result = await dispatchRoutineEvent({
        payload: body.payload,
        resource: body.resource,
        stores: deps,
        tenantId: resolved.scope.tenantId,
      });
      return c.json(result);
    } catch (err) {
      return handleRouteError(
        c,
        "failed to dispatch routine event",
        "routines.internalError",
        err
      );
    }
  });

  /**
   * Inbound webhook.
   *
   * Deliberately outside the scope resolver: the caller is a third-party system
   * with no session, and the secret in the URL is the whole credential. The URL
   * still names the ROUTINE (stable across trigger edits); the secret lives on
   * its webhook trigger row. A wrong id or a wrong secret answers 404 alike —
   * telling an unauthenticated caller which half was wrong is how a secret gets
   * brute-forced one field at a time.
   */
  app.post(`${base}/hooks/:routineId/:secret`, async (c) => {
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const trigger = await deps.triggers.resolveWebhook({
        routineId: c.req.param("routineId"),
        secret: c.req.param("secret"),
      });
      if (!trigger?.enabled) {
        return c.json({ error: "not_found" }, 404);
      }
      const routine = await deps.routines.get({
        id: trigger.routine_id,
        tenantId: trigger.tenant_id,
      });
      if (!routine) {
        return c.json({ error: "not_found" }, 404);
      }
      const payload = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const result = await fireRoutine({
        eventInput: mapEventInput(trigger.input_mapping, payload),
        flowGraphs: deps.flowGraphs,
        honorQuietHours: true,
        requests: deps.requests,
        routine,
        routines: deps.routines,
        trigger: "hook",
      });
      return c.json({
        ok: true,
        run_id: result.runId ?? null,
        skipped: result.skipped ?? null,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to run routine from webhook",
        "routines.internalError",
        err
      );
    }
  });

  app.post(`${base}/reconcile`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const deps = stores();
    if (!deps) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      // The space fan-out asks core for every space mounting a module —
      // including private ones — so it runs on a service credential, not the
      // caller's bearer (core refuses user principals on that endpoint).
      const serviceToken = await getServiceAccessToken({
        tenantId: resolved.scope.tenantId,
      }).catch(() => null);
      const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
      await reconcileScheduler({
        coreClient:
          serviceToken && coreBaseUrl
            ? new EngentyCoreClient({
                accessToken: serviceToken,
                coreBaseUrl,
              })
            : null,
        flowGraphs: deps.flowGraphs,
        mastra,
        ...(moduleLoader ? { moduleLoader } : {}),
        routines: deps.routines,
        tenantId: resolved.scope.tenantId,
        triggers: deps.triggers,
      });
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to reconcile scheduler",
        "routines.internalError",
        err
      );
    }
  });
}
