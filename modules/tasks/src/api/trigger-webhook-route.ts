// Webhook ingestion edge for event triggers.
//
// `POST /api/tasks/trigger-hooks/:triggerId/:secret` — public (external
// systems post here), authenticated by the per-trigger secret generated at
// creation. A valid call fires the trigger through the shared `fireTrigger`
// path with the request body attached as event context.
import { timingSafeEqual } from "node:crypto";
import type { PluginServerApi, QueueServiceLike } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTriggerByIdUnscoped } from "../dal/triggers.js";
import { fireTrigger } from "./trigger-fire.js";

const logger = createLogger({ name: "tasks-trigger-webhook" });

export const WEBHOOK_PROVIDER_ID = "webhook";

function secretsMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

export function registerTriggerWebhookRoute(
  api: Pick<PluginServerApi, "registerHttpRoute">,
  options: { queue?: QueueServiceLike | null; supabase: SupabaseClient }
): void {
  api.registerHttpRoute({
    method: "post",
    path: "/api/tasks/trigger-hooks/:triggerId/:secret",
    isPublic: true,
    summary: "Fire an event trigger from an inbound webhook",
    // The route host only parses a JSON body when a schema is declared —
    // callers must post a JSON object (an empty {} is fine).
    request: { body: z.record(z.string(), z.unknown()) },
    handler: async (ctx) => {
      const params = ctx.params as { secret: string; triggerId: string };
      const trigger = await getTriggerByIdUnscoped(
        options.supabase,
        params.triggerId
      ).catch(() => null);
      // One generic 401 for every reject reason — a probe cannot distinguish
      // "no such trigger" from "wrong secret" from "disabled".
      if (
        !(
          trigger?.enabled &&
          trigger.kind === "event" &&
          trigger.provider_id === WEBHOOK_PROVIDER_ID &&
          trigger.webhook_secret &&
          secretsMatch(trigger.webhook_secret, params.secret)
        )
      ) {
        return json(401, { error: "invalid_trigger_hook" });
      }
      const payload =
        ctx.body && typeof ctx.body === "object" && !Array.isArray(ctx.body)
          ? (ctx.body as Record<string, unknown>)
          : {};
      const task = await fireTrigger({
        eventContext: payload,
        firedBy: "webhook",
        queue: options.queue ?? null,
        supabase: options.supabase,
        trigger,
      });
      logger.info("webhook trigger fired", {
        taskId: task.id,
        triggerId: trigger.id,
      });
      return json(200, { ok: true, task_id: task.id });
    },
  });
}
