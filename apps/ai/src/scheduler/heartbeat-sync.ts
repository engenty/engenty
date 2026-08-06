// Trigger ↔ schedule synchronization.
//
// The trigger row (module_tasks.triggers, managed via gateway operations) is
// the source of truth; the Mastra schedule is derived runtime state. Sync is
// idempotent: called after every trigger mutation and in full from
// `reconcileScheduler` at boot.
//
// Mastra 1.50+ renamed heartbeats → schedules. Agent-schedule ids are
// normalized to `agent_<slug>` on create (legacy `hb_*` ids still resolve via
// `schedules.get`). Our create payloads keep the stable `hb_trigger-*` /
// `hb_system-*` stems; the returned id (possibly `agent_hb-…`) is what we
// persist onto `triggers.heartbeat_id`.

import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { listRegisteredRoutines } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Mastra } from "@mastra/core/mastra";
import {
  buildHeartbeatMetadata,
  readHeartbeatMetadata,
} from "./heartbeat-metadata.js";
import { routineDeclarationDrifted } from "./routine-declaration-drift.js";
import type { SchedulerOperationInvoker } from "./service-invoker.js";
import { listSystemJobs } from "./system-jobs.js";

const logger = createLogger({ name: "scheduler" });

/** The trigger fields sync needs — a subset of the gateway's TriggerDetail. */
export interface SyncableTrigger {
  cron: string | null;
  enabled: boolean;
  heartbeat_id: string | null;
  id: string;
  kind: string;
  name: string;
  timezone: string | null;
}

/**
 * Ensure a schedule trigger's Mastra schedule matches its row: create it when
 * missing, update cron/timezone when drifted, pause/resume with `enabled`.
 * Returns the schedule id (persisted back onto the row by the caller when it
 * changed). Non-schedule triggers have no schedule.
 */
export async function syncTriggerHeartbeat(
  mastra: Mastra,
  tenantId: string,
  trigger: SyncableTrigger
): Promise<string | null> {
  if (trigger.kind !== "schedule" || !trigger.cron) {
    return null;
  }
  const desiredStatus = trigger.enabled ? "active" : "paused";
  const existing = trigger.heartbeat_id
    ? await mastra.schedules.get(trigger.heartbeat_id)
    : null;

  if (!existing) {
    const created = await mastra.schedules.create({
      agentId: SCHEDULER_AGENT_ID,
      cron: trigger.cron,
      // Stable stem; Mastra normalizes to `agent_<slug>` and returns the stored
      // id — we persist whatever comes back onto the trigger row.
      id: `hb_trigger-${trigger.id}`,
      metadata: buildHeartbeatMetadata({
        kind: "trigger",
        tenantId,
        triggerId: trigger.id,
      }),
      name: trigger.name,
      // Never used — prepare() always short-circuits — but required.
      prompt: trigger.name,
      status: desiredStatus,
      ...(trigger.timezone ? { timezone: trigger.timezone } : {}),
    });
    return created.id;
  }

  // `mastra.schedules.get` answers the AnySchedule union and only
  // AgentSchedule carries `name`. Narrow on the property actually read — NOT
  // on `agentId`, which a stored schedule may omit even though it has a name;
  // doing that treats every such schedule as drifted and re-updates it.
  const existingName = "name" in existing ? existing.name : undefined;

  if (
    existing.cron !== trigger.cron ||
    (existing.timezone ?? null) !== (trigger.timezone ?? null) ||
    existing.status !== desiredStatus ||
    existingName !== trigger.name
  ) {
    await mastra.schedules.update(existing.id, {
      cron: trigger.cron,
      name: trigger.name,
      status: desiredStatus,
      ...(trigger.timezone ? { timezone: trigger.timezone } : {}),
    });
  }
  return existing.id;
}

export async function deleteTriggerHeartbeat(
  mastra: Mastra,
  heartbeatId: string | null
): Promise<void> {
  if (!heartbeatId) {
    return;
  }
  await mastra.schedules.delete(heartbeatId).catch(() => {
    // Already gone — deletion is idempotent.
  });
}

export const SCHEDULER_AGENT_ID = "engenty.scheduler";

interface TriggerListRow extends SyncableTrigger {
  description: string | null;
  module_id: string | null;
  module_key: string | null;
  source: string;
  task_template: {
    agent_type_key: string;
    description: string | null;
    priority: string;
    title: string;
  } | null;
}

/**
 * Full reconcile, run at boot:
 * 1. Module ROUTINE.md declarations → trigger + template rows (deterministic
 *    upsert on (module_id, module_key); user-owned fields — enabled, cron
 *    override — are only seeded on insert, template content follows the
 *    declaration).
 * 2. Every schedule trigger → its Mastra schedule (create/update/pause).
 * 3. System jobs → their schedules.
 * 4. Orphaned Engenty schedules (trigger deleted) → removed.
 */
export async function reconcileScheduler(options: {
  invokeOperation: SchedulerOperationInvoker;
  mastra: Mastra;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  tenantId: string;
}): Promise<void> {
  const { invokeOperation, mastra, moduleLoader, tenantId } = options;

  // 1. Module routine declarations → trigger rows.
  const declarations = [
    ...listRegisteredRoutines(),
    ...(moduleLoader
      ? (await moduleLoader.listModuleCapabilities()).flatMap(
          (capability) => capability.routines ?? []
        )
      : []),
  ].filter((definition) => definition.target.kind === "task_template");

  // The core envelope unwraps a single-key `{ data }` payload — the invoker
  // returns the row array directly.
  const listed = (await invokeOperation(
    "triggers_list",
    {}
  )) as TriggerListRow[];
  const byModuleKey = new Map(
    listed
      .filter((row) => row.module_id && row.module_key)
      .map((row) => [`${row.module_id}:${row.module_key}`, row])
  );

  for (const definition of declarations) {
    const template = definition.target.task_template;
    const existing = byModuleKey.get(
      `${definition.module_id}:${definition.id}`
    );
    const desired = {
      description: definition.description ?? null,
      template: {
        agent_type_key: template.agent_type_key,
        description: template.description ?? null,
        priority: normalizePriority(template.priority),
        title: template.title,
      },
    };
    if (existing) {
      // Declaration-owned fields follow ROUTINE.md; user-owned enabled/cron/
      // timezone/quiet_hours/approval_grants are never touched here.
      if (routineDeclarationDrifted(existing, desired)) {
        try {
          await invokeOperation("triggers_update", {
            description: desired.description,
            id: existing.id,
            task_template: {
              agent_type_key: desired.template.agent_type_key,
              description: desired.template.description,
              name: definition.name,
              priority: desired.template.priority,
              title: desired.template.title,
            },
          });
          logger.info("module trigger reconciled", {
            moduleId: definition.module_id,
            moduleKey: definition.id,
            triggerId: existing.id,
          });
        } catch (err) {
          logger.error("routine reconcile update failed", {
            message: err instanceof Error ? err.message : String(err),
            moduleId: definition.module_id,
            moduleKey: definition.id,
            triggerId: existing.id,
          });
        }
      }
      continue;
    }
    // One malformed declaration must not take the scheduler down with it: this
    // loop runs before schedule sync, so an uncaught throw here left EVERY
    // schedule trigger without a schedule — a single over-long ROUTINE.md
    // silently stopped all scheduled work.
    try {
      await invokeOperation("triggers_create", {
        cron: definition.schedule,
        description: desired.description,
        enabled: definition.enabled_by_default,
        kind: "schedule",
        module_id: definition.module_id,
        module_key: definition.id,
        name: definition.name,
        quiet_hours: definition.quiet_hours ?? null,
        source: "module",
        task_template: {
          agent_type_key: desired.template.agent_type_key,
          description: desired.template.description,
          name: definition.name,
          priority: desired.template.priority,
          title: desired.template.title,
        },
      });
      logger.info("module trigger created", {
        moduleId: definition.module_id,
        moduleKey: definition.id,
      });
    } catch (err) {
      logger.error("module trigger create failed — routine will not run", {
        message: err instanceof Error ? err.message : String(err),
        moduleId: definition.module_id,
        moduleKey: definition.id,
      });
    }
  }

  // 2. Every schedule trigger → Mastra schedule.
  const current = (await invokeOperation(
    "triggers_list",
    {}
  )) as TriggerListRow[];
  const liveScheduleIds = new Set<string>();
  for (const trigger of current) {
    // Same isolation as above: one unschedulable trigger (bad cron, say) must
    // not deny every other trigger its schedule.
    try {
      const scheduleId = await syncTriggerHeartbeat(mastra, tenantId, trigger);
      if (scheduleId) {
        liveScheduleIds.add(scheduleId);
        if (trigger.heartbeat_id !== scheduleId) {
          await invokeOperation("triggers_update", {
            heartbeat_id: scheduleId,
            id: trigger.id,
          });
        }
      }
    } catch (err) {
      logger.error("trigger schedule sync failed — trigger will not fire", {
        message: err instanceof Error ? err.message : String(err),
        triggerId: trigger.id,
      });
    }
  }

  // 3. System jobs → schedules. The id is tenant-qualified: system jobs run
  // once PER TENANT (each tenant's inbox sync pulls that tenant's mail). A
  // bare `hb_system-${job.id}` would be claimed by whichever tenant
  // reconciled first and every other tenant would silently get no sync.
  // Legacy unqualified rows are cleaned up by the orphan sweep below (their
  // metadata names the tenant that stamped them).
  for (const job of listSystemJobs()) {
    // Stable stem; create() may store `agent_hb-system-…`. get() resolves both
    // the stem and the canonical form.
    const id = `hb_system-${tenantId}-${job.id}`;
    const existing = await mastra.schedules.get(id);
    if (existing) {
      liveScheduleIds.add(existing.id);
    } else {
      const created = await mastra.schedules.create({
        agentId: SCHEDULER_AGENT_ID,
        cron: job.schedule,
        id,
        metadata: buildHeartbeatMetadata({
          jobId: job.id,
          kind: "system-job",
          tenantId,
        }),
        name: job.name,
        prompt: job.name,
      });
      liveScheduleIds.add(created.id);
    }
  }

  // 4. Orphaned Engenty schedules → delete (matched by metadata.engenty, not
  // id prefix — covers both legacy `hb_*` and `agent_hb-*` rows).
  // ONLY this tenant's rows: the Mastra store is global and the reconcile
  // runs once per tenant — an unscoped sweep would let each tenant's pass
  // delete every other tenant's schedules (last reconciled tenant wins,
  // every other tenant's triggers silently stop firing).
  const all = await mastra.schedules.list();
  for (const schedule of all) {
    const meta = readHeartbeatMetadata(schedule.metadata);
    if (
      !meta ||
      meta.tenantId !== tenantId ||
      liveScheduleIds.has(schedule.id)
    ) {
      continue;
    }
    logger.info("removing orphaned scheduler schedule", {
      scheduleId: schedule.id,
    });
    await deleteTriggerHeartbeat(mastra, schedule.id);
  }

  logger.info("scheduler reconciled", {
    schedules: liveScheduleIds.size,
    triggers: current.length,
  });
}

function normalizePriority(
  priority: string | undefined
): "critical" | "high" | "medium" | "low" {
  return priority === "critical" || priority === "high" || priority === "low"
    ? priority
    : "medium";
}
