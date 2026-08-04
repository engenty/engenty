// Mastra schedule lifecycle hooks — the entire Engenty scheduler runtime.
//
// Schedules are used as a pure cron substrate: every fire enters `prepare`,
// which does the actual work (fire the trigger → materialize its Task, or run
// a system job) and then returns `null` so NO agent run ever happens. The
// schedule's agent (`engenty.scheduler`) exists only because the worker
// requires a registered agent; it never executes.
//
// Quiet hours are enforced here (scheduled fires only) — manual "run now"
// calls `triggers_fire` directly and deliberately bypasses them.
import { createLogger } from "@engenty/telemetry";
import type { Config } from "@mastra/core/mastra";
import { emitInboxNotification } from "../notifications/inbox.js";
import { readHeartbeatMetadata } from "./heartbeat-metadata.js";
import { isWithinQuietHours } from "./quiet-hours.js";
import {
  createSchedulerOperationInvoker,
  type SchedulerOperationInvoker,
} from "./service-invoker.js";
import { runSystemJob } from "./system-jobs.js";

const logger = createLogger({ name: "scheduler" });

/** The `schedules` hook bundle shape from the Mastra constructor config. */
type SchedulerScheduleHooks = NonNullable<Config["schedules"]>;

interface TriggerRow {
  enabled: boolean;
  id: string;
  name: string;
  quiet_hours: string | null;
}

export function createSchedulerHeartbeatHooks(options?: {
  invokeOperation?: SchedulerOperationInvoker;
  now?: () => Date;
}): SchedulerScheduleHooks {
  // Every fire acts for the tenant stamped in its schedule's metadata — the
  // invoker is built per fire so a platform-scoped credential mints the
  // right tenant's token (an injected invoker, used by tests, wins).
  const invokerFor = (tenantId: string): SchedulerOperationInvoker =>
    options?.invokeOperation ?? createSchedulerOperationInvoker(tenantId);
  const now = options?.now ?? (() => new Date());

  return {
    async prepare({ schedule }) {
      const meta = readHeartbeatMetadata(
        schedule.metadata as Record<string, unknown> | undefined
      );
      if (!meta) {
        // Not an Engenty-owned schedule — let it fire normally.
        return;
      }
      const invoke = invokerFor(meta.tenantId);

      if (meta.kind === "system-job") {
        const result = await runSystemJob(meta.jobId, meta.tenantId);
        logger.info("system job ran", { jobId: meta.jobId, result });
        return null;
      }

      const trigger = (await invoke("triggers_get", {
        id: meta.triggerId,
      })) as TriggerRow;
      if (!trigger.enabled) {
        // Reconcile pauses disabled triggers' schedules; this covers the gap
        // between a disable write and the next reconcile.
        return null;
      }
      if (
        trigger.quiet_hours &&
        isWithinQuietHours(trigger.quiet_hours, now())
      ) {
        logger.info("trigger fire suppressed by quiet hours", {
          triggerId: trigger.id,
        });
        return null;
      }

      const task = (await invoke("triggers_fire", { id: trigger.id })) as {
        id?: string;
      } | null;
      logger.info("trigger fired", {
        taskId: task?.id ?? null,
        triggerId: trigger.id,
      });
      return null;
    },

    async onError({ schedule, phase, error }) {
      const meta = readHeartbeatMetadata(
        schedule.metadata as Record<string, unknown> | undefined
      );
      logger.warn("schedule fire failed", {
        message: error.message,
        phase,
        scheduleId: schedule.id,
      });
      if (meta?.kind !== "trigger") {
        return;
      }
      const invoke = invokerFor(meta.tenantId);
      await invoke("triggers_record_result", {
        id: meta.triggerId,
        result: `error: ${error.message}`,
      }).catch((recordError: unknown) => {
        logger.warn("failed to record trigger error", {
          message:
            recordError instanceof Error
              ? recordError.message
              : String(recordError),
          triggerId: meta.triggerId,
        });
      });
      await emitInboxNotification({
        // Dedupe while unhandled: a crashing schedule fires every interval —
        // coalesce into one inbox entry until someone looks at it.
        dedupeKey: `trigger_failed:${meta.triggerId}`,
        kind: "trigger_failed",
        metadata: { heartbeat_id: schedule.id, trigger_id: meta.triggerId },
        payload: { error: error.message.slice(0, 1000), phase },
        priority: "high",
        source: "triggers",
        summary: `Scheduled trigger fire failed: ${error.message.slice(0, 200)}`,
        tenantId: meta.tenantId,
      });
    },
  };
}
