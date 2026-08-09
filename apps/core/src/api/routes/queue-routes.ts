import { createLogger } from "@engenty/telemetry";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createClient } from "@supabase/supabase-js";
import type { PluginRegistry } from "../../plugins/registry.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireSuperAdmin } from "./authz.js";

const logger = createLogger({ name: "queue-routes" });

export function registerQueueRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  registry?: PluginRegistry;
}) {
  const { app, config, registry } = params;

  function getSupabaseClient() {
    const supabaseUrl =
      (config.supabaseUrl as string) || process.env.SUPABASE_URL || "";
    const supabaseServiceRoleKey =
      (config.supabaseServiceRoleKey as string) ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "";
    if (!(supabaseUrl && supabaseServiceRoleKey)) {
      return null;
    }
    return createClient(supabaseUrl, supabaseServiceRoleKey);
  }

  // Every route here reads GLOBAL pgmq state through a service-role client:
  // the queues are not tenant-partitioned, and a peeked message body carries
  // whichever tenant's payload happens to be enqueued (that is how consumers
  // resolve their tenant handle). So these are platform diagnostics and must
  // be superadmin-only — under the previous `requireAuth` gate any member of
  // any tenant could enumerate the queues and read other tenants' payloads.
  // Nothing in the product calls these; they exist for operators.

  // ── GET /api/queues — list all pgmq queues with message counts ──
  app.get("/api/queues", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const client = getSupabaseClient();
    if (!client) {
      return jsonApiError(c, 503, {
        message: "Queue service not available (Supabase not configured)",
      });
    }

    try {
      const { data, error } = await client.rpc("pgmq_list_queues");
      if (error) {
        logger.error("Failed to list queues", { error: error.message });
        return jsonApiError(c, 500, { message: error.message });
      }
      return jsonApiSuccess(c, data ?? []);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Queue list failed", { error: error.message });
      return jsonApiError(c, 500, { message: error.message });
    }
  });

  // ── GET /api/queues/meta — queue display metadata registered by plugins ──
  app.get("/api/queues/meta", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const definitions = (registry?.queueDefinitions ?? []).map((entry) => ({
      name: entry.queue.name,
      label: entry.queue.label,
      color: entry.queue.color ?? null,
      description: entry.queue.description ?? null,
      plugin_id: entry.pluginId,
    }));

    return jsonApiSuccess(c, definitions);
  });

  // ── GET /api/queues/:name/messages — peek at messages in a queue ──
  app.get("/api/queues/:name/messages", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const client = getSupabaseClient();
    if (!client) {
      return jsonApiError(c, 503, {
        message: "Queue service not available",
      });
    }

    const queueName = c.req.param("name");
    const limit = Number.parseInt(c.req.query("limit") || "20", 10);

    try {
      const { data, error } = await client.rpc("pgmq_peek", {
        queue: queueName,
        n: limit,
      });
      if (error) {
        logger.error("Failed to peek at queue", {
          queue: queueName,
          error: error.message,
        });
        return jsonApiError(c, 500, { message: error.message });
      }

      // Parse message JSON if it's a string
      const messages = ((data as unknown[]) ?? []).map((msg: unknown) => {
        const m = msg as Record<string, unknown>;
        if (typeof m.message === "string") {
          try {
            m.message = JSON.parse(m.message as string);
          } catch {
            // keep as string
          }
        }
        return m;
      });

      return jsonApiSuccess(c, messages);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Queue peek failed", { error: error.message });
      return jsonApiError(c, 500, { message: error.message });
    }
  });
}
