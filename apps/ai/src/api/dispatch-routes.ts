// UI-4 Part A — Dispatch status endpoint.
// GET /ai/v1/dispatch/status — returns queue metrics + kill-switch state.
// Capability-gated on core.ai.dispatch: the platform-wide queue state is a
// tenant-admin view (members and service credentials hold module-tier
// capabilities, which do not cover core.*).

import type { QueueService } from "@engenty/queue";
import { createLogger } from "@engenty/telemetry";
import type { Hono } from "hono";
import { scopeCoversCapability } from "../ai/sessions.js";
import { AI_BASE_PATH } from "../config/constants.js";
import { AI_CAPABILITIES } from "./capabilities.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

const logger = createLogger({ name: "dispatch-routes" });

const DISPATCH_QUEUE = "agent_task_dispatch";

export interface RegisterDispatchRoutesOptions {
  getQueue: () => QueueService | null;
  scopeResolver: AiScopeResolver;
}

export function registerDispatchRoutes(
  app: Hono<any>,
  options: RegisterDispatchRoutesOptions
) {
  const { getQueue, scopeResolver } = options;

  app.get(`${AI_BASE_PATH}/v1/dispatch/status`, async (c) => {
    try {
      const resolved = await resolveScope(c, scopeResolver);
      if (!resolved.ok) {
        return resolved.response;
      }
      if (!scopeCoversCapability(resolved.scope, AI_CAPABILITIES.dispatch)) {
        return c.json({ error: "dispatch.forbidden" }, 403);
      }

      const enabled =
        process.env.ENGENTY_AGENT_TASK_DISPATCH_ENABLED !== "false";
      const queue = getQueue();

      if (!queue) {
        return c.json({ enabled, queue: null });
      }

      try {
        const m = await queue.metrics(DISPATCH_QUEUE);
        return c.json({
          enabled,
          queue: {
            depth: m.queue_length,
            oldest_msg_age_seconds: m.oldest_msg_age_seconds,
          },
        });
      } catch (err) {
        // Queue may not exist yet (pgmq queue not created). Return null rather
        // than erroring — the UI renders "queue unconfigured".
        logger.warn("dispatch queue metrics failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return c.json({ enabled, queue: null });
      }
    } catch (err) {
      return handleRouteError(
        c,
        "failed to read dispatch status",
        "dispatch.internalError",
        err
      );
    }
  });
}
