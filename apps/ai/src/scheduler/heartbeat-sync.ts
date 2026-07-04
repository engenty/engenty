// Trigger ↔ heartbeat synchronization.
//
// The trigger row (module_tasks.triggers, managed via gateway operations) is
// the source of truth; the Mastra heartbeat is derived runtime state. Sync is
// idempotent: called after every trigger mutation and in full from
// `reconcileScheduler` at boot.

import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { listRegisteredRoutines } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Mastra } from "@mastra/core/mastra";
import {
  buildHeartbeatMetadata,
  readHeartbeatMetadata,
} from "./heartbeat-metadata.js";
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
 * Ensure a schedule trigger's heartbeat matches its row: create it when
 * missing, update cron/timezone when drifted, pause/resume with `enabled`.
 * Returns the heartbeat id (persisted back onto the row by the caller when it
 * changed). Non-schedule triggers have no heartbeat.
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
    ? await mastra.heartbeats.get(trigger.heartbeat_id)
    : null;

  if (!existing) {
    const created = await mastra.heartbeats.create({
      agentId: SCHEDULER_AGENT_ID,
      cron: trigger.cron,
      // Pre-normalized (Mastra slugifies underscores to dashes); the actual
      // stored id is returned and persisted onto the trigger row regardless.
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

  if (
    existing.cron !== trigger.cron ||
    (existing.timezone ?? null) !== (trigger.timezone ?? null) ||
    existing.status !== desiredStatus ||
    existing.name !== trigger.name
  ) {
    await mastra.heartbeats.update(existing.id, {
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
  await mastra.heartbeats.delete(heartbeatId).catch(() => {
    // Already gone — deletion is idempotent.
  });
}

export const SCHEDULER_AGENT_ID = "engenty.scheduler";

interface TriggerListRow extends SyncableTrigger {
  module_id: string | null;
  module_key: string | null;
  source: string;
}

/**
 * Full reconcile, run at boot:
 * 1. Module ROUTINE.md declarations → trigger + template rows (deterministic
 *    upsert on (module_id, module_key); user-owned fields — enabled, cron
 *    override — are only seeded on insert, template content follows the
 *    declaration).
 * 2. Every schedule trigger → its heartbeat (create/update/pause).
 * 3. System jobs → their heartbeats.
 * 4. Orphaned Engenty heartbeats (trigger deleted) → removed.
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
    if (existing) {
      continue;
    }
    await invokeOperation("triggers_create", {
      cron: definition.schedule,
      description: definition.description ?? null,
      enabled: definition.enabled_by_default,
      kind: "schedule",
      module_id: definition.module_id,
      module_key: definition.id,
      name: definition.name,
      quiet_hours: definition.quiet_hours ?? null,
      source: "module",
      task_template: {
        agent_type_key: template.agent_type_key,
        description: template.description ?? null,
        name: definition.name,
        priority: normalizePriority(template.priority),
        title: template.title,
      },
    });
    logger.info("module trigger created", {
      moduleId: definition.module_id,
      moduleKey: definition.id,
    });
  }

  // 2. Every schedule trigger → heartbeat.
  const current = (await invokeOperation(
    "triggers_list",
    {}
  )) as TriggerListRow[];
  const liveHeartbeatIds = new Set<string>();
  for (const trigger of current) {
    const heartbeatId = await syncTriggerHeartbeat(mastra, tenantId, trigger);
    if (heartbeatId) {
      liveHeartbeatIds.add(heartbeatId);
      if (trigger.heartbeat_id !== heartbeatId) {
        await invokeOperation("triggers_update", {
          heartbeat_id: heartbeatId,
          id: trigger.id,
        });
      }
    }
  }

  // 3. System jobs → heartbeats.
  for (const job of listSystemJobs()) {
    // Mastra slugifies heartbeat ids (underscores → dashes after the `hb_`
    // prefix) — use the already-normalized form so get() finds what create()
    // stored.
    const id = `hb_system-${job.id}`;
    const existing = await mastra.heartbeats.get(id);
    if (existing) {
      liveHeartbeatIds.add(existing.id);
    } else {
      const created = await mastra.heartbeats.create({
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
      liveHeartbeatIds.add(created.id);
    }
  }

  // 4. Orphaned Engenty heartbeats → delete.
  const all = await mastra.heartbeats.list();
  for (const heartbeat of all) {
    const meta = readHeartbeatMetadata(heartbeat.metadata);
    if (!meta || liveHeartbeatIds.has(heartbeat.id)) {
      continue;
    }
    logger.info("removing orphaned scheduler heartbeat", {
      heartbeatId: heartbeat.id,
    });
    await deleteTriggerHeartbeat(mastra, heartbeat.id);
  }

  logger.info("scheduler reconciled", {
    heartbeats: liveHeartbeatIds.size,
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
