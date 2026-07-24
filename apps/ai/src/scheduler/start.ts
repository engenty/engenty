// Scheduler startup: bring the Mastra schedules runtime online and reconcile
// triggers ↔ schedules. Replaces the pg_cron `/routines/tick` entry point —
// with this, Engenty performs no cron parsing of its own.
import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Mastra } from "@mastra/core/mastra";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { reconcileScheduler } from "./heartbeat-sync.js";
import {
  createSchedulerOperationInvoker,
  resolveSchedulerServiceScope,
} from "./service-invoker.js";

const logger = createLogger({ name: "scheduler" });

const RECONCILE_DELAY_MS = 5000;
const RECONCILE_RETRIES = 3;

const SCOPE_RETRY_DELAY_MS = 5000;
const SCOPE_RETRY_MAX_DELAY_MS = 60_000;

/**
 * Start schedule/scheduler workers and schedule the trigger reconcile.
 *
 * Service-scope resolution distinguishes three failure modes: a missing
 * ENGENTY_AI_SERVICE_JWT env var disables the scheduler outright (same
 * failure mode as the old tick without its Vault secret), a 401 from core
 * disables it too (a rejected token never heals on its own), while any
 * other failed resolution (core unreachable — e.g. the AI app won the
 * dev-stack boot race) is retried indefinitely on a capped backoff.
 *
 * The reconcile is DEFERRED past boot: the module capability loader blocks
 * until plugin registration settles (awaiting it inside createApp deadlocks
 * the boot), and reconcile only needs to happen "soon", not "before serving".
 */
export async function startScheduler(options: {
  mastra: Mastra;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
}): Promise<void> {
  const bringOnline = async (scope: AiSessionScope): Promise<void> => {
    await options.mastra.startWorkers();

    const runReconcile = async (attempt: number): Promise<void> => {
      try {
        await reconcileScheduler({
          invokeOperation: createSchedulerOperationInvoker(),
          mastra: options.mastra,
          moduleLoader: options.moduleLoader,
          tenantId: scope.tenantId,
        });
      } catch (err) {
        if (attempt < RECONCILE_RETRIES) {
          setTimeout(
            () => void runReconcile(attempt + 1),
            RECONCILE_DELAY_MS * (attempt + 1)
          ).unref?.();
          return;
        }
        logger.error("scheduler reconcile failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    };
    setTimeout(() => void runReconcile(0), RECONCILE_DELAY_MS).unref?.();
  };

  const resolveAndStart = async (attempt: number): Promise<void> => {
    const resolved = await resolveSchedulerServiceScope();
    if (resolved.ok) {
      if (attempt > 0) {
        logger.info("scheduler service scope resolved after retry", {
          attempt,
        });
      }
      await bringOnline(resolved.scope);
      return;
    }
    if (resolved.reason === "jwt_missing") {
      logger.warn(
        "scheduler disabled — ENGENTY_AI_SERVICE_JWT is not set; scheduled triggers will not fire"
      );
      return;
    }
    if (resolved.status === 401) {
      logger.warn(
        "scheduler disabled — core rejected the service JWT (401 unauthorized); scheduled triggers will not fire",
        { error: resolved.error, status: resolved.status }
      );
      return;
    }
    const delayMs = Math.min(
      SCOPE_RETRY_DELAY_MS * (attempt + 1),
      SCOPE_RETRY_MAX_DELAY_MS
    );
    logger.info(
      "scheduler service scope resolution failed (core may still be booting); retrying",
      {
        attempt: attempt + 1,
        delayMs,
        error: resolved.error,
        status: resolved.status,
      }
    );
    setTimeout(() => {
      resolveAndStart(attempt + 1).catch((err) => {
        logger.error("trigger scheduler failed to start", {
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }, delayMs).unref?.();
  };

  await resolveAndStart(0);
}
