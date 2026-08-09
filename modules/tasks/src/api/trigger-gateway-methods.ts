// Gateway operations for Triggers + Task templates.
//
// A Trigger is the single "reason work starts" (schedule | event | manual) and
// always references a task template. `triggers_fire` materializes the Task —
// it is the one execution path shared by scheduled fires (the apps/ai
// heartbeat hook), manual "run now", and (later) event-driven fires.
import { randomBytes } from "node:crypto";
import {
  actorUserIdFromAuth,
  type PluginAuthContext,
  type PluginServerApi,
  type QueueServiceLike,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTriggersRepoSupabase,
  type TriggersRepo,
} from "../dal/triggers.js";
import {
  taskSchema,
  taskTemplateCreateInputSchema,
  taskTemplateSchema,
  taskTemplateUpdateInputSchema,
  triggerCreateInputSchema,
  triggerDetailSchema,
  triggerIdParamsSchema,
  triggersListQuerySchema,
  triggersListSchema,
  triggerUpdateInputSchema,
} from "../schema/zod.js";
import { MODULE_EVENTS_PROVIDER_ID } from "./trigger-event-subscriber.js";
import { fireTrigger } from "./trigger-fire.js";
import { WEBHOOK_PROVIDER_ID } from "./trigger-webhook-route.js";

export type TriggersRepoFactory = (auth: PluginAuthContext) => TriggersRepo;

const readOp = {
  moduleId: "tasks",
  requiredCapabilities: ["module.tasks.read"],
  riskLevel: "low" as const,
  idempotent: true,
  dryRunSupported: false,
  requiresApproval: false,
};

const writeOp = {
  moduleId: "tasks",
  requiredCapabilities: ["module.tasks.write"],
  riskLevel: "high" as const,
  idempotent: false,
  dryRunSupported: false,
  requiresApproval: true,
};

export interface TriggerGatewayOptions {
  /** Tenant-locked handle factory (engenty_server lane, RLS-enforced). */
  getDb: (auth: { tenantId: string }) => SupabaseClient;
  /** Ensure the module-event bus listener covers a trigger's resource — the
   * subscriber's `ensureSubscribed`, called on event-trigger create/update. */
  onEventResourceAdded?: (resource: string) => void;
  /** Queue for auto-dispatching agent tasks materialized by a fire. */
  queue?: QueueServiceLike | null;
}

export function createTriggersRepoFactory(
  getDb: (auth: { tenantId: string }) => SupabaseClient
): TriggersRepoFactory {
  return (auth) =>
    createTriggersRepoSupabase(getDb(auth), auth.tenantId, auth.scopeId);
}

export function registerTriggerGatewayMethods(
  api: PluginServerApi,
  triggersRepoFactory: TriggersRepoFactory,
  options: TriggerGatewayOptions
) {
  api.registerOperation({
    operationId: "triggers_list",
    summary: "List triggers",
    ...readOp,
    inputSchema: triggersListQuerySchema.partial(),
    outputSchema: triggersListSchema,
    handler: async (input, ctx) => {
      const repo = triggersRepoFactory(requireAuth(ctx.auth));
      const filter = triggersListQuerySchema.parse(input ?? {});
      return { data: await repo.listTriggers(filter) };
    },
  });

  api.registerOperation({
    operationId: "triggers_get",
    summary: "Get trigger by ID",
    ...readOp,
    inputSchema: triggerIdParamsSchema,
    outputSchema: triggerDetailSchema,
    handler: async (input, ctx) => {
      const repo = triggersRepoFactory(requireAuth(ctx.auth));
      const { id } = triggerIdParamsSchema.parse(input);
      const trigger = await repo.getTrigger(id);
      if (!trigger) {
        throw new Error("trigger_not_found");
      }
      return trigger;
    },
  });

  api.registerOperation({
    operationId: "triggers_create",
    summary: "Create trigger",
    ...writeOp,
    inputSchema: triggerCreateInputSchema,
    outputSchema: triggerDetailSchema,
    handler: async (input, ctx) => {
      const auth = requireAuth(ctx.auth);
      const repo = triggersRepoFactory(auth);
      const parsed = triggerCreateInputSchema.parse(input);
      if (parsed.kind === "schedule" && !parsed.cron?.trim()) {
        throw new Error("trigger_schedule_requires_cron");
      }
      if (parsed.kind === "event") {
        if (!parsed.provider_id) {
          throw new Error("trigger_event_requires_provider");
        }
        if (
          parsed.provider_id === MODULE_EVENTS_PROVIDER_ID &&
          !parsed.resource?.trim()
        ) {
          throw new Error("trigger_event_requires_resource");
        }
      }
      let templateId = parsed.task_template_id;
      if (!templateId) {
        if (!parsed.task_template) {
          throw new Error("trigger_requires_task_template");
        }
        const template = await repo.createTaskTemplate(
          parsed.task_template,
          actorUserIdFromAuth(auth)
        );
        templateId = template.id;
      }
      const trigger = await repo.createTrigger(
        {
          cron: parsed.cron ?? null,
          description: parsed.description ?? null,
          enabled: parsed.enabled ?? true,
          event_filter: parsed.event_filter ?? null,
          kind: parsed.kind,
          module_id: parsed.module_id ?? null,
          module_key: parsed.module_key ?? null,
          name: parsed.name,
          provider_id: parsed.provider_id ?? null,
          quiet_hours: parsed.quiet_hours ?? null,
          resource: parsed.resource ?? null,
          source: parsed.source ?? "custom",
          task_template_id: templateId,
          timezone: parsed.timezone ?? null,
          // Webhook triggers are fired by external systems posting to the
          // public hook route; the per-trigger secret is the authentication.
          webhook_secret:
            parsed.kind === "event" &&
            parsed.provider_id === WEBHOOK_PROVIDER_ID
              ? randomBytes(24).toString("hex")
              : null,
        },
        actorUserIdFromAuth(auth)
      );
      if (
        trigger.kind === "event" &&
        trigger.provider_id === MODULE_EVENTS_PROVIDER_ID &&
        trigger.resource
      ) {
        options.onEventResourceAdded?.(trigger.resource);
      }
      const detail = await repo.getTrigger(trigger.id);
      if (!detail) {
        throw new Error("trigger_not_found");
      }
      return detail;
    },
  });

  api.registerOperation({
    operationId: "triggers_update",
    summary: "Update trigger",
    ...writeOp,
    inputSchema: triggerUpdateInputSchema.extend({ id: z.string().uuid() }),
    outputSchema: triggerDetailSchema,
    handler: async (input, ctx) => {
      const repo = triggersRepoFactory(requireAuth(ctx.auth));
      const { id, task_template, ...patch } = triggerUpdateInputSchema
        .extend({ id: z.string().uuid() })
        .parse(input);
      const updated = await repo.updateTrigger(id, patch);
      if (!updated) {
        throw new Error("trigger_not_found");
      }
      if (task_template) {
        const templateId = updated.task_template_id;
        const templateUpdated = await repo.updateTaskTemplate(
          templateId,
          task_template
        );
        if (!templateUpdated) {
          throw new Error("task_template_not_found");
        }
      }
      if (
        updated.kind === "event" &&
        updated.provider_id === MODULE_EVENTS_PROVIDER_ID &&
        updated.resource
      ) {
        options.onEventResourceAdded?.(updated.resource);
      }
      const detail = await repo.getTrigger(id);
      if (!detail) {
        throw new Error("trigger_not_found");
      }
      return detail;
    },
  });

  api.registerOperation({
    operationId: "triggers_delete",
    summary: "Delete trigger",
    ...writeOp,
    inputSchema: triggerIdParamsSchema,
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = triggersRepoFactory(requireAuth(ctx.auth));
      const { id } = triggerIdParamsSchema.parse(input);
      const ok = await repo.deleteTrigger(id);
      if (!ok) {
        throw new Error("trigger_not_found");
      }
      return { ok: true };
    },
  });

  // The single execution path: materialize the trigger's task template into a
  // real Task (and auto-dispatch it when it targets an agent). Scheduled fires
  // (heartbeat hook) and manual "run now" both call this.
  api.registerOperation({
    operationId: "triggers_fire",
    summary: "Fire trigger (materialize its task)",
    ...writeOp,
    inputSchema: triggerIdParamsSchema,
    outputSchema: taskSchema,
    handler: async (input, ctx) => {
      const auth = requireAuth(ctx.auth);
      const repo = triggersRepoFactory(auth);
      const { id } = triggerIdParamsSchema.parse(input);
      // The scoped lookup IS the authorization: the caller can only fire
      // triggers in their own tenant/scope. The fire itself runs on the
      // shared path used by all ingestion edges.
      const trigger = await repo.getTrigger(id);
      if (!trigger) {
        throw new Error("trigger_not_found");
      }
      // `created_by_user_id` on both `trigger` and the materialized task is a
      // core.users FK, and this path is the one the scheduler drives as the AI
      // service principal — whose principalId is a core.service_credential id.
      // Writing it raw makes the insert fail the FK, so a service fire records
      // nothing. Unattended fires simply have no human creator.
      return fireTrigger({
        createdByUserId: actorUserIdFromAuth(auth),
        queue: options.queue ?? null,
        supabase: options.getDb({ tenantId: auth.tenantId }),
        trigger,
      });
    },
  });

  // Bookkeeping write from the apps/ai scheduler hook (fire failures and other
  // outcomes that don't flow through triggers_fire itself).
  api.registerOperation({
    operationId: "triggers_record_result",
    summary: "Record a trigger fire result",
    ...writeOp,
    inputSchema: triggerIdParamsSchema.extend({
      result: z.string().max(2000),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = triggersRepoFactory(requireAuth(ctx.auth));
      const { id, result } = triggerIdParamsSchema
        .extend({ result: z.string().max(2000) })
        .parse(input);
      await repo.recordTriggerFire(id, result);
      return { ok: true };
    },
  });

  api.registerOperation({
    operationId: "task_templates_list",
    summary: "List task templates",
    ...readOp,
    inputSchema: z.object({}).partial(),
    outputSchema: z.object({ data: z.array(taskTemplateSchema) }),
    handler: async (_input, ctx) => {
      const repo = triggersRepoFactory(requireAuth(ctx.auth));
      return { data: await repo.listTaskTemplates() };
    },
  });

  api.registerOperation({
    operationId: "task_templates_create",
    summary: "Create task template",
    ...writeOp,
    inputSchema: taskTemplateCreateInputSchema,
    outputSchema: taskTemplateSchema,
    handler: async (input, ctx) => {
      const auth = requireAuth(ctx.auth);
      const repo = triggersRepoFactory(auth);
      return repo.createTaskTemplate(
        taskTemplateCreateInputSchema.parse(input),
        actorUserIdFromAuth(auth)
      );
    },
  });

  api.registerOperation({
    operationId: "task_templates_update",
    summary: "Update task template",
    ...writeOp,
    inputSchema: taskTemplateUpdateInputSchema.extend({
      id: z.string().uuid(),
    }),
    outputSchema: taskTemplateSchema,
    handler: async (input, ctx) => {
      const repo = triggersRepoFactory(requireAuth(ctx.auth));
      const { id, ...patch } = taskTemplateUpdateInputSchema
        .extend({ id: z.string().uuid() })
        .parse(input);
      const updated = await repo.updateTaskTemplate(id, patch);
      if (!updated) {
        throw new Error("task_template_not_found");
      }
      return updated;
    },
  });
}

function requireAuth(auth: PluginAuthContext | undefined): PluginAuthContext {
  if (!auth) {
    throw new Error("Auth context required");
  }
  return auth;
}
