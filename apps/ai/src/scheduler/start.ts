// Scheduler startup: bring the Mastra schedules runtime online and reconcile
// triggers ↔ schedules. Replaces the pg_cron `/routines/tick` entry point —
// with this, Engenty performs no cron parsing of its own.
import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Mastra } from "@mastra/core/mastra";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { getServiceAccessToken } from "../ai/service-credential.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { reconcileScheduler } from "./heartbeat-sync.js";
import {
  createSchedulerOperationInvoker,
  resolveSchedulerServiceScope,
} from "./service-invoker.js";
import { listTenantIds } from "./tenants.js";

const logger = createLogger({ name: "scheduler" });

const RECONCILE_DELAY_MS = 5000;
const RECONCILE_RETRIES = 3;

const SCOPE_RETRY_DELAY_MS = 5000;
const SCOPE_RETRY_MAX_DELAY_MS = 60_000;

/**
 * Start schedule/scheduler workers and schedule the trigger reconcile.
 *
 * Service-scope resolution distinguishes three failure modes: no service
 * credential configured (neither ENGENTY_AI_SERVICE_JWT nor the
 * ENGENTY_AI_SERVICE_SECRET) disables the scheduler outright
 * (same failure mode as the old tick without its Vault secret), a 401 from
 * core disables it too (a rejected token never heals on its own), while any
 * other failed resolution (core unreachable — e.g. the AI app won the
 * dev-stack boot race — or a transient sign-in failure) is retried
 * indefinitely on a capped backoff.
 *
 * The reconcile is DEFERRED past boot: the module capability loader blocks
 * until plugin registration settles (awaiting it inside createApp deadlocks
 * the boot), and reconcile only needs to happen "soon", not "before serving".
 */
export async function startScheduler(options: {
  mastra: Mastra;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
}): Promise<void> {
  // Reconcile ONE tenant, with its own retry budget. Failures here are
  // per-tenant: a tenant-bound credential in a multi-tenant install can only
  // serve its own tenant, and the others must not take the scheduler down.
  const runReconcile = async (
    scope: AiSessionScope,
    attempt: number
  ): Promise<void> => {
    try {
      // The module capability loader reads its bearer from the Engenty-tools
      // ALS, which is normally entered by the HTTP middleware. A reconcile
      // has no request behind it, so enter it here with a freshly vended
      // service token. Without this the loader throws "…this run does not
      // include an end-user bearer token" on step 1 and NOTHING downstream
      // runs — no trigger and no system job ever gets its schedule.
      const serviceToken = await getServiceAccessToken({
        tenantId: scope.tenantId,
      });
      if (!serviceToken) {
        throw new Error(
          "scheduler: no service credential available to reconcile triggers"
        );
      }
      await engentyToolsRunAls.run(
        {
          tenantId: scope.tenantId,
          userAccessToken: serviceToken,
          userId: scope.userId,
        },
        () =>
          reconcileScheduler({
            invokeOperation: createSchedulerOperationInvoker(scope.tenantId),
            mastra: options.mastra,
            moduleLoader: options.moduleLoader,
            tenantId: scope.tenantId,
          })
      );
    } catch (err) {
      if (attempt < RECONCILE_RETRIES) {
        setTimeout(
          () => void runReconcile(scope, attempt + 1),
          RECONCILE_DELAY_MS * (attempt + 1)
        ).unref?.();
        return;
      }
      logger.error("scheduler reconcile failed", {
        message: err instanceof Error ? err.message : String(err),
        tenantId: scope.tenantId,
      });
    }
  };

  const bringOnline = async (firstScope: AiSessionScope): Promise<void> => {
    await options.mastra.startWorkers();

    // The scheduler serves EVERY tenant: mint a per-tenant scope and
    // reconcile each. The first tenant's scope is already resolved (it
    // proved the credential); the rest resolve here and a failure skips
    // that tenant only — with a tenant-bound credential the foreign mints
    // are refused at the exchange, which is exactly the single-tenant
    // behavior this generalizes.
    let tenantIds: string[];
    try {
      tenantIds = await listTenantIds();
    } catch (err) {
      logger.warn(
        "scheduler: tenant enumeration failed — reconciling the credential tenant only",
        { message: err instanceof Error ? err.message : String(err) }
      );
      tenantIds = [firstScope.tenantId];
    }
    if (!tenantIds.includes(firstScope.tenantId)) {
      tenantIds.unshift(firstScope.tenantId);
    }
    setTimeout(() => {
      void (async () => {
        for (const tenantId of tenantIds) {
          if (tenantId === firstScope.tenantId) {
            await runReconcile(firstScope, 0);
            continue;
          }
          const resolved = await resolveSchedulerServiceScope(tenantId);
          if (!resolved.ok) {
            logger.warn(
              "scheduler: skipping tenant — service scope unavailable (tenant-bound credential?)",
              {
                reason: resolved.reason,
                tenantId,
                ...(resolved.reason === "resolution_failed"
                  ? { error: resolved.error, status: resolved.status }
                  : {}),
              }
            );
            continue;
          }
          await runReconcile(resolved.scope, 0);
        }
      })();
    }, RECONCILE_DELAY_MS).unref?.();
  };

  const resolveAndStart = async (attempt: number): Promise<void> => {
    // Boot probe: a platform credential refuses a tenant-less mint, so probe
    // against a concrete tenant id first. When that fails and a tenant was
    // named, fall back to the tenant-less resolve — a tenant-bound
    // credential whose own tenant is not the first row must still come
    // online. The last result drives the disable/retry decision.
    const probeTenantId = await listTenantIds()
      .then((ids) => ids[0])
      .catch(() => undefined);
    let resolved = await resolveSchedulerServiceScope(probeTenantId);
    if (
      !resolved.ok &&
      resolved.reason === "resolution_failed" &&
      probeTenantId
    ) {
      const fallback = await resolveSchedulerServiceScope();
      if (fallback.ok) {
        resolved = fallback;
      }
    }
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
        "scheduler disabled — no service credential configured (set ENGENTY_AI_SERVICE_SECRET); scheduled triggers will not fire"
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
