// Triggers API — management surface over the Trigger domain (tasks module)
// plus its Mastra-heartbeat runtime state.
//
// GET    /ai/v1/triggers            — list triggers (+ next_fire_at from the heartbeat)
// POST   /ai/v1/triggers            — create a trigger (schedule kind; template inline or by id)
// PATCH  /ai/v1/triggers/:id        — update (enabled / cron / quiet hours / template)
// DELETE /ai/v1/triggers/:id        — delete (custom triggers only)
// POST   /ai/v1/triggers/:id/run    — fire now (bypasses quiet hours)
// POST   /ai/v1/triggers/reconcile  — full reconcile (admin)
//
// The trigger rows live in the tasks module and are reached via gateway
// operations riding the caller's bearer; heartbeats are managed directly on
// the Mastra instance. Scheduled fires happen in src/scheduler/heartbeat-hooks.
import type {
  AiRegistry,
  DynamicAiModuleCapabilityLoader,
} from "@engenty/ai-core";
import type { Mastra } from "@mastra/core/mastra";
import type { Hono } from "hono";
import { z } from "zod";
import { createScopeModuleOperationInvoker } from "../ai/sessions/task-workspace-hook.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  deleteTriggerHeartbeat,
  reconcileScheduler,
  type SyncableTrigger,
  syncTriggerHeartbeat,
} from "../scheduler/heartbeat-sync.js";
import { createSchedulerOperationInvoker } from "../scheduler/service-invoker.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

export interface RegisterTriggerRoutesOptions {
  // Tenant-scoped agent registry — validates task-template agent ids.
  getRegistry: (tenantId: string) => Pick<AiRegistry, "getAgentConfig">;
  mastra: Mastra;
  // Tenant-scoped module capability channel — source of module ROUTINE.md defs
  // for the reconcile route.
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  scopeResolver: AiScopeResolver;
}

const taskTemplateInputSchema = z.object({
  agent_type_key: z.string().min(1).max(255),
  description: z.string().max(8192).nullable().optional(),
  name: z.string().min(1).max(255),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  title: z.string().min(1).max(500),
});

const createTriggerSchema = z.object({
  // Schedule triggers require cron; event triggers require provider (+
  // resource for module events) — enforced in the handler per kind.
  cron: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
  event_filter: z.record(z.string(), z.unknown()).nullable().optional(),
  kind: z.enum(["schedule", "event"]).default("schedule"),
  name: z.string().min(1).max(255),
  provider_id: z.enum(["module-events", "webhook"]).nullable().optional(),
  quiet_hours: z.string().max(100).nullable().optional(),
  resource: z.string().max(255).nullable().optional(),
  task_template: taskTemplateInputSchema.optional(),
  task_template_id: z.string().uuid().optional(),
  timezone: z.string().max(64).nullable().optional(),
});

const updateTriggerSchema = z.object({
  cron: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
  event_filter: z.record(z.string(), z.unknown()).nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  provider_id: z.enum(["module-events", "webhook"]).nullable().optional(),
  quiet_hours: z.string().max(100).nullable().optional(),
  resource: z.string().max(255).nullable().optional(),
  task_template: taskTemplateInputSchema.partial().optional(),
  timezone: z.string().max(64).nullable().optional(),
});

interface TriggerDetailRow extends SyncableTrigger {
  description: string | null;
  last_fired_at: string | null;
  last_result: string | null;
  module_id: string | null;
  module_key: string | null;
  quiet_hours: string | null;
  source: string;
  task_template: {
    agent_type_key: string;
    description: string | null;
    id: string;
    priority: string;
    title: string;
  } | null;
  task_template_id: string;
}

export function registerTriggerRoutes(
  app: Hono<any>,
  options: RegisterTriggerRoutesOptions
) {
  const { getRegistry, mastra, moduleLoader, scopeResolver } = options;
  const base = `${AI_BASE_PATH}/v1/triggers`;

  const invokerFor = (scope: AiSessionScope) =>
    createScopeModuleOperationInvoker(scope);

  async function validateAgentTypeKey(
    tenantId: string,
    agentTypeKey: string | undefined
  ): Promise<string | null> {
    if (!agentTypeKey) {
      return null;
    }
    if (agentTypeKey.startsWith("chatbot.")) {
      return "triggers.invalidAgentId";
    }
    const agent = await getRegistry(tenantId).getAgentConfig(agentTypeKey);
    return agent ? null : "triggers.agentNotFound";
  }

  /** Sync the heartbeat after a mutation and persist a changed heartbeat id. */
  async function syncAfterWrite(
    scope: AiSessionScope,
    trigger: TriggerDetailRow
  ): Promise<void> {
    const heartbeatId = await syncTriggerHeartbeat(
      mastra,
      scope.tenantId,
      trigger
    );
    if (heartbeatId && heartbeatId !== trigger.heartbeat_id) {
      await invokerFor(scope)("triggers_update", {
        heartbeat_id: heartbeatId,
        id: trigger.id,
      });
    }
  }

  app.get(base, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      // The core envelope unwraps a single-key `{ data }` payload — the
      // invoker returns the row array directly.
      const listed = (await invokerFor(resolved.scope)(
        "triggers_list",
        {}
      )) as TriggerDetailRow[];
      const triggers = await Promise.all(
        listed.map(async (trigger) => {
          const heartbeat = trigger.heartbeat_id
            ? await mastra.heartbeats.get(trigger.heartbeat_id)
            : null;
          return {
            ...trigger,
            next_fire_at:
              heartbeat && heartbeat.status === "active"
                ? new Date(heartbeat.nextFireAt).toISOString()
                : null,
          };
        })
      );
      return c.json({ triggers });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list triggers",
        "triggers.internalError",
        err
      );
    }
  });

  app.post(base, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const parsed = createTriggerSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json(
        { details: parsed.error.issues, error: "triggers.invalidInput" },
        400
      );
    }
    const data = parsed.data;
    if (!(data.task_template || data.task_template_id)) {
      return c.json({ error: "triggers.taskTemplateRequired" }, 400);
    }
    if (data.kind === "schedule" && !data.cron?.trim()) {
      return c.json({ error: "triggers.cronRequired" }, 400);
    }
    if (data.kind === "event") {
      if (!data.provider_id) {
        return c.json({ error: "triggers.providerRequired" }, 400);
      }
      if (data.provider_id === "module-events" && !data.resource?.trim()) {
        return c.json({ error: "triggers.resourceRequired" }, 400);
      }
    }
    const agentError = await validateAgentTypeKey(
      resolved.scope.tenantId,
      data.task_template?.agent_type_key
    );
    if (agentError) {
      return c.json({ error: agentError }, 400);
    }
    try {
      const trigger = (await invokerFor(resolved.scope)("triggers_create", {
        cron: data.cron ?? null,
        description: data.description ?? null,
        enabled: data.enabled ?? true,
        event_filter: data.event_filter ?? null,
        kind: data.kind,
        name: data.name,
        provider_id: data.provider_id ?? null,
        quiet_hours: data.quiet_hours ?? null,
        resource: data.resource ?? null,
        task_template: data.task_template,
        task_template_id: data.task_template_id,
        timezone: data.timezone ?? null,
      })) as TriggerDetailRow;
      try {
        await syncAfterWrite(resolved.scope, trigger);
      } catch (syncError) {
        // Invalid cron (or scheduler unavailable): roll the row back so the
        // trigger list never shows a schedule that cannot fire.
        await invokerFor(resolved.scope)("triggers_delete", {
          id: trigger.id,
        }).catch(() => {
          // best-effort rollback
        });
        return c.json(
          {
            error: "triggers.invalidSchedule",
            message:
              syncError instanceof Error
                ? syncError.message
                : String(syncError),
          },
          400
        );
      }
      return c.json({ trigger });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to create trigger",
        "triggers.internalError",
        err
      );
    }
  });

  app.patch(`${base}/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const parsed = updateTriggerSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json(
        { details: parsed.error.issues, error: "triggers.invalidInput" },
        400
      );
    }
    const data = parsed.data;
    const agentError = await validateAgentTypeKey(
      resolved.scope.tenantId,
      data.task_template?.agent_type_key
    );
    if (agentError) {
      return c.json({ error: agentError }, 400);
    }
    const invoke = invokerFor(resolved.scope);
    try {
      const trigger = (await invoke("triggers_update", {
        cron: data.cron,
        description: data.description,
        enabled: data.enabled,
        event_filter: data.event_filter,
        id: c.req.param("id"),
        name: data.name,
        provider_id: data.provider_id,
        quiet_hours: data.quiet_hours,
        resource: data.resource,
        timezone: data.timezone,
      })) as TriggerDetailRow;
      if (data.task_template && trigger.task_template_id) {
        await invoke("task_templates_update", {
          id: trigger.task_template_id,
          ...data.task_template,
        });
      }
      try {
        await syncAfterWrite(resolved.scope, trigger);
      } catch (syncError) {
        return c.json(
          {
            error: "triggers.invalidSchedule",
            message:
              syncError instanceof Error
                ? syncError.message
                : String(syncError),
          },
          400
        );
      }
      return c.json({ trigger });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to update trigger",
        "triggers.internalError",
        err
      );
    }
  });

  app.delete(`${base}/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const invoke = invokerFor(resolved.scope);
    try {
      const trigger = (await invoke("triggers_get", {
        id: c.req.param("id"),
      })) as TriggerDetailRow;
      if (trigger.source === "module") {
        // Module-declared triggers are disabled, not deleted — reconcile would
        // recreate them on the next boot.
        return c.json({ error: "triggers.moduleTriggerNotDeletable" }, 400);
      }
      await invoke("triggers_delete", { id: trigger.id });
      await deleteTriggerHeartbeat(mastra, trigger.heartbeat_id);
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete trigger",
        "triggers.internalError",
        err
      );
    }
  });

  // Manual fire — deliberately bypasses quiet hours (it is an explicit ask).
  app.post(`${base}/:id/run`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const task = await invokerFor(resolved.scope)("triggers_fire", {
        id: c.req.param("id"),
      });
      return c.json({ ok: true, task });
    } catch (err) {
      return handleRouteError(
        c,
        "trigger run failed",
        "triggers.runFailed",
        err
      );
    }
  });

  app.post(`${base}/reconcile`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      await reconcileScheduler({
        invokeOperation: createSchedulerOperationInvoker(),
        mastra,
        moduleLoader,
        tenantId: resolved.scope.tenantId,
      });
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "trigger reconcile failed",
        "triggers.internalError",
        err
      );
    }
  });
}
