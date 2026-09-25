// Mastra schedule lifecycle hooks — the entire Engenty scheduler runtime.
//
// Schedules are used as a pure cron substrate: every fire enters `prepare`,
// which does the actual work (fire the routine → start its run, or run a system
// job) and then returns `null` so NO agent run ever happens on the schedule's
// own agent. The schedule's agent (`engenty.scheduler`) exists only because the
// worker requires a registered agent; it never executes.
//
// A fire produces a RUN, never a Task — see docs/content/dev/work-model.md.
// Quiet hours are enforced by `fireRoutine` for scheduled fires only; run-now
// deliberately bypasses them.
import { createLogger } from "@engenty/telemetry";
import type { Config } from "@mastra/core/mastra";
import {
  createRoutineStoreFromEnv,
  createRoutineTriggerStoreFromEnv,
  createWorkflowRunStoreFromEnv,
  createWorkflowStoreFromEnv,
} from "../ai/index.js";
import { fireRoutine } from "../ai/routines/fire-routine.js";
import { emitInboxNotification } from "../notifications/inbox.js";
import { failureLine } from "../notifications/run-notifications.js";
import { readHeartbeatMetadata } from "./heartbeat-metadata.js";
import { runSystemJob } from "./system-jobs.js";

const logger = createLogger({ name: "scheduler" });

/** The `schedules` hook bundle shape from the Mastra constructor config. */
type SchedulerScheduleHooks = NonNullable<Config["schedules"]>;

export function createSchedulerHeartbeatHooks(options?: {
  now?: () => Date;
}): SchedulerScheduleHooks {
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

      if (meta.kind === "system-job") {
        const result = await runSystemJob(meta.jobId, meta.tenantId);
        logger.info("system job ran", { jobId: meta.jobId, result });
        return null;
      }

      const routines = createRoutineStoreFromEnv();
      const flowGraphs = createWorkflowStoreFromEnv();
      const requests = createWorkflowRunStoreFromEnv();
      if (!(routines && flowGraphs && requests)) {
        logger.warn("routine fire skipped — stores unavailable", {
          routineId: meta.routineId,
        });
        return null;
      }

      const routine = await routines.get({
        id: meta.routineId,
        tenantId: meta.tenantId,
      });
      if (!routine) {
        // Deleted while its schedule still lives: an orphan awaiting the next
        // scheduler-sync sweep, not a failure — erroring here would spam the
        // inbox with routine_failed cards until then.
        logger.info("schedule fire skipped — routine row deleted", {
          routineId: meta.routineId,
          scheduleId: schedule.id,
        });
        return null;
      }

      // The trigger's own switch: reconcile pauses the schedule of a disabled
      // trigger; this covers the gap between the write and the next sweep.
      if (meta.triggerId) {
        const triggers = createRoutineTriggerStoreFromEnv();
        const trigger = triggers
          ? await triggers.get({ id: meta.triggerId, tenantId: meta.tenantId })
          : null;
        if (trigger && !trigger.enabled) {
          logger.info("schedule fire skipped — trigger disabled", {
            routineId: meta.routineId,
            triggerId: meta.triggerId,
          });
          return null;
        }
      }

      await fireRoutine({
        flowGraphs,
        honorQuietHours: true,
        now: now(),
        requests,
        routine,
        routines,
        trigger: "cron",
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
      if (meta?.kind !== "routine") {
        return;
      }
      const routines = createRoutineStoreFromEnv();
      await routines
        ?.recordFire({
          id: meta.routineId,
          result: `error: ${error.message}`,
          tenantId: meta.tenantId,
        })
        .catch((recordError: unknown) => {
          logger.warn("failed to record routine error", {
            message:
              recordError instanceof Error
                ? recordError.message
                : String(recordError),
            routineId: meta.routineId,
          });
        });
      // Space + owner for the audience ladder; a failed read only loses them.
      const routine = await Promise.resolve()
        .then(() =>
          routines?.get({ id: meta.routineId, tenantId: meta.tenantId })
        )
        .catch(() => null);
      const failureBody = failureLine(error);
      await emitInboxNotification({
        // Dedupe while unhandled: a crashing schedule fires every interval —
        // coalesce into one inbox entry until someone looks at it.
        dedupeKey: `routine_failed:${meta.routineId}`,
        kind: "routine_failed",
        metadata: {
          routine_id: meta.routineId,
          schedule_id: schedule.id,
          ...(routine?.agent_id ? { agent_id: routine.agent_id } : {}),
        },
        ownerUserId: routine?.created_by_user_id ?? null,
        payload: { error: error.message.slice(0, 1000), phase },
        priority: "high",
        source: "routines",
        spaceId: routine?.space_id ?? null,
        subject: { id: meta.routineId, type: "routine" },
        // The error's class or first line — never the stack.
        ...(failureBody ? { body: failureBody } : {}),
        summary: "A scheduled routine failed",
        tenantId: meta.tenantId,
        ...(routine?.name?.trim()
          ? {
              title: {
                key: "routine_failed",
                params: { name: routine.name.trim() },
              },
            }
          : {}),
      });
    },
  };
}
