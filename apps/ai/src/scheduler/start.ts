// Scheduler startup: bring the Mastra heartbeat runtime online and reconcile
// triggers ↔ heartbeats. Replaces the pg_cron `/routines/tick` entry point —
// with this, Engenty performs no cron parsing of its own.
import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Mastra } from "@mastra/core/mastra";
import { reconcileScheduler } from "./heartbeat-sync.js";
import {
  createSchedulerOperationInvoker,
  resolveSchedulerServiceScope,
} from "./service-invoker.js";

const logger = createLogger({ name: "scheduler" });

const RECONCILE_DELAY_MS = 5000;
const RECONCILE_RETRIES = 3;

/**
 * Start heartbeat/scheduler workers and schedule the trigger reconcile.
 * No-ops with a loud warning when the service JWT is missing/unresolvable
 * (scheduled triggers stay off — same failure mode as the old tick without
 * its Vault secret).
 *
 * The reconcile is DEFERRED past boot: the module capability loader blocks
 * until plugin registration settles (awaiting it inside createApp deadlocks
 * the boot), and reconcile only needs to happen "soon", not "before serving".
 */
export async function startScheduler(options: {
  mastra: Mastra;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
}): Promise<void> {
  const scope = await resolveSchedulerServiceScope();
  if (!scope) {
    logger.warn(
      "scheduler disabled — ENGENTY_AI_SERVICE_JWT missing or unresolvable; scheduled triggers will not fire"
    );
    return;
  }

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
}
