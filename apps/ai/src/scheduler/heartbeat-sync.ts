// Routine ↔ schedule synchronization.
//
// The routine row (`ai.routines`) is the source of truth; the Mastra schedule
// is derived runtime state. Sync is idempotent: called after every routine
// mutation and in full from `reconcileScheduler` at boot.
//
// Mastra 1.50+ renamed heartbeats → schedules. Agent-schedule ids are
// normalized to `agent_<slug>` on create (legacy `hb_*` ids still resolve via
// `schedules.get`). Our create payloads keep the stable `hb_routine-*` /
// `hb_system-*` stems; the returned id (possibly `agent_hb-…`) is what we
// persist onto `routines.schedule_id`.

import type {
  DynamicAiModuleCapabilityLoader,
  RoutineDefinition,
  WorkflowDefinition,
} from "@engenty/ai-core";
import {
  listRegisteredRoutines,
  listRegisteredWorkflows,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Mastra } from "@mastra/core/mastra";
import type { EngentyCoreClient } from "../ai/core-http-client.js";
import {
  isOwnerMissingResult,
  ownerMissingResult,
  ownerResolvedResult,
} from "../ai/routines/owner-paused.js";
import { reconcileModuleWorkflows } from "../ai/workflows/reconcile-module-workflows.js";
import type {
  RoutineRow,
  RoutineStore,
} from "../dal/routines/routine-store.js";
import type { RoutineTriggerStore } from "../dal/routines/routine-trigger-store.js";
import type { WorkflowStore } from "../dal/workflows/workflow-store.js";
import {
  buildHeartbeatMetadata,
  readHeartbeatMetadata,
} from "./heartbeat-metadata.js";
import { listSystemJobs } from "./system-jobs.js";

const logger = createLogger({ name: "scheduler" });

/** The trigger fields sync needs — a subset of the row. */
export interface SyncableTrigger {
  cron: string | null;
  enabled: boolean;
  id: string;
  kind: string;
  routine_id: string;
  schedule_id: string | null;
  timezone: string | null;
}

/**
 * Ensure a schedule TRIGGER's Mastra schedule matches its row: create it when
 * missing, update cron/timezone when drifted, pause/resume with the combined
 * enabled state (routine master switch AND the trigger's own). Returns the
 * schedule id (persisted back onto the trigger row by the caller when it
 * changed). Non-schedule triggers have no schedule.
 */
export async function syncTriggerSchedule(
  mastra: Mastra,
  tenantId: string,
  routine: Pick<RoutineRow, "enabled" | "name">,
  trigger: SyncableTrigger
): Promise<string | null> {
  if (trigger.kind !== "schedule" || !trigger.cron) {
    return null;
  }
  const desiredStatus =
    routine.enabled && trigger.enabled ? "active" : "paused";
  const existing = trigger.schedule_id
    ? await mastra.schedules.get(trigger.schedule_id)
    : null;

  if (!existing) {
    const created = await mastra.schedules.create({
      agentId: SCHEDULER_AGENT_ID,
      cron: trigger.cron,
      // Stable stem; Mastra normalizes to `agent_<slug>` and returns the stored
      // id — we persist whatever comes back onto the trigger row.
      id: `hb_routine-${trigger.id}`,
      metadata: buildHeartbeatMetadata({
        kind: "routine",
        routineId: trigger.routine_id,
        tenantId,
        triggerId: trigger.id,
      }),
      name: routine.name,
      // Never used — prepare() always short-circuits — but required.
      prompt: routine.name,
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
    existingName !== routine.name
  ) {
    await mastra.schedules.update(existing.id, {
      cron: trigger.cron,
      name: routine.name,
      status: desiredStatus,
      ...(trigger.timezone ? { timezone: trigger.timezone } : {}),
    });
  }
  return existing.id;
}

export async function deleteRoutineSchedule(
  mastra: Mastra,
  scheduleId: string | null
): Promise<void> {
  if (!scheduleId) {
    return;
  }
  await mastra.schedules.delete(scheduleId).catch(() => {
    // Already gone — deletion is idempotent.
  });
}

export const SCHEDULER_AGENT_ID = "engenty.scheduler";

/**
 * Has a module declaration moved on from the row reconciled from it?
 *
 * Declaration-owned fields only — `enabled`, `cron`, `timezone`, `quiet_hours`
 * and `approval_grants` belong to whoever edited the binding and are never
 * compared here.
 */
function declarationDrifted(
  existing: RoutineRow,
  desired: { agentId: string; description: string | null; workflowId: string }
): boolean {
  return (
    (existing.description?.trim() ?? "") !==
      (desired.description?.trim() ?? "") ||
    existing.agent_id !== desired.agentId ||
    existing.workflow_id !== desired.workflowId
  );
}

/**
 * One reconciled binding per (declaration, space) — `scope: "tenant"` keeps
 * one tenant-global row (`@` suffix absent so existing tenant rows keep their
 * declaration id shape).
 */
function declarationRowId(
  definition: Pick<RoutineDefinition, "id" | "module_id">,
  spaceId: string | null
): string {
  const base = `${definition.module_id}:${definition.id}`;
  return spaceId ? `${base}@${spaceId}` : base;
}

/**
 * Full reconcile, run at boot:
 * 0. Module workflow definitions → published `ai.workflow` rows.
 * 1. agent.json trigger declarations → `ai.routines` binding rows
 *    (deterministic upsert on the declaration id; `scope: "space"` fans out
 *    one row per space mounting the declaring module; unmount → disable).
 * 2. Every schedule binding → its Mastra schedule (create/update/pause).
 * 3. System jobs → their schedules.
 * 4. Orphaned Engenty schedules (routine deleted) → removed.
 */
export async function reconcileScheduler(options: {
  /** Space fan-out oracle; absent = tenant-scope declarations only. */
  coreClient?: EngentyCoreClient | null;
  /** Needed for step 0 + workflow resolution; absent skips both. */
  flowGraphs?: WorkflowStore | null;
  mastra: Mastra;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  routines: RoutineStore;
  tenantId: string;
  triggers: RoutineTriggerStore;
}): Promise<void> {
  const {
    coreClient,
    flowGraphs,
    mastra,
    moduleLoader,
    routines,
    tenantId,
    triggers,
  } = options;

  const capabilities = moduleLoader
    ? await moduleLoader.listModuleCapabilities()
    : [];

  // 0. Module workflows → published workflow rows. Must precede the
  // bindings: a binding names a workflow by module id and resolves it here.
  const workflows: WorkflowDefinition[] = [
    ...listRegisteredWorkflows(),
    ...capabilities.flatMap((capability) => capability.workflows ?? []),
  ];
  if (flowGraphs && workflows.length > 0) {
    await reconcileModuleWorkflows({
      workflows,
      store: flowGraphs,
      tenantId,
    });
  }

  // 1. Trigger declarations → binding rows.
  const declarations = [
    ...listRegisteredRoutines(),
    ...capabilities.flatMap((capability) => capability.routines ?? []),
  ];

  for (const definition of declarations) {
    // One malformed declaration must not take the scheduler down with it:
    // this loop runs before schedule sync, so an uncaught throw here left
    // EVERY schedule binding without a schedule.
    try {
      // The workflow the binding runs, resolved to the tenant row step 0
      // wrote. Unresolvable = refused with a named error; a binding that
      // cannot name a runnable workflow must not be created.
      const workflowRow = flowGraphs
        ? await flowGraphs.findBySourceWorkflow({
            sourceWorkflowId: definition.workflow,
            tenantId,
          })
        : null;
      if (!workflowRow) {
        throw new Error(
          `trigger_workflow_unresolved: no reconciled workflow "${definition.workflow}"`
        );
      }

      // Space fan-out: one row per space mounting the DECLARING module.
      const spaceIds: (string | null)[] =
        definition.scope === "tenant"
          ? [null]
          : coreClient
            ? (await coreClient.listSpacesMounting(definition.module_id))
                .space_ids
            : [];
      const mounted = new Set(
        spaceIds.filter((id): id is string => Boolean(id))
      );

      for (const spaceId of spaceIds) {
        const declarationId = declarationRowId(definition, spaceId);
        const desired = {
          agentId: definition.agent_id,
          description: definition.description?.trim() || null,
          workflowId: workflowRow.id,
        };
        const existing = await routines.getByDeclaration({
          declarationId,
          tenantId,
        });
        if (existing) {
          if (declarationDrifted(existing, desired)) {
            await routines.update({
              agentId: desired.agentId,
              description: desired.description,
              id: existing.id,
              tenantId,
              workflowId: desired.workflowId,
            });
            logger.info("module trigger reconciled", {
              declarationId,
              routineId: existing.id,
            });
          }
          continue;
        }
        const createdRoutine = await routines.create({
          workflowInput:
            (definition.input_mapping as Record<string, unknown>) ?? {},
          agentId: definition.agent_id,
          declarationId,
          description: desired.description,
          enabled: definition.enabled_by_default,
          moduleId: definition.module_id,
          name: definition.name,
          quietHours: definition.quiet_hours ?? null,
          source: "module",
          spaceId,
          tenantId,
          workflowId: workflowRow.id,
        });
        // The declared wake source, plus the standard manual/agent pair every
        // routine carries (same defaults the unification migration applied).
        await triggers.create({
          kind: definition.kind,
          routineId: createdRoutine.id,
          tenantId,
          ...(definition.cron ? { cron: definition.cron } : {}),
          ...(definition.timezone ? { timezone: definition.timezone } : {}),
          ...(definition.provider_id
            ? { providerId: definition.provider_id }
            : {}),
          ...(definition.resource ? { resource: definition.resource } : {}),
          ...(definition.event_filter
            ? { eventFilter: definition.event_filter }
            : {}),
        });
        for (const extraKind of ["manual", "agent"] as const) {
          if (definition.kind !== extraKind) {
            await triggers.create({
              kind: extraKind,
              routineId: createdRoutine.id,
              tenantId,
            });
          }
        }
        logger.info("module trigger created", { declarationId });
      }

      // Unmount → disable, not delete: a space that dropped the module keeps
      // its binding row (edits, history) but stops waking.
      if (definition.scope === "space" && coreClient) {
        const prefix = `${definition.module_id}:${definition.id}@`;
        const rows = await routines.list({ source: "module", tenantId });
        for (const row of rows) {
          if (!row.declaration_id?.startsWith(prefix)) {
            continue;
          }
          const rowSpace = row.declaration_id.slice(prefix.length);
          if (row.enabled && !mounted.has(rowSpace)) {
            await routines.update({
              enabled: false,
              id: row.id,
              tenantId,
            });
            logger.info("module trigger disabled — module unmounted", {
              declarationId: row.declaration_id,
            });
          }
        }
      }
    } catch (err) {
      logger.error("module trigger reconcile failed — binding will not run", {
        declarationId: `${definition.module_id}:${definition.id}`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 1b. A routine whose owner the registry cannot find must not keep waking;
  // one this sweep paused resumes the moment its owner resolves again. The
  // registry has to actually answer: a listing that throws or comes back
  // empty says nothing about any single owner, so the sweep stands down
  // rather than pausing every routine in the tenant on a hiccup.
  try {
    const { createDefaultAiRegistry } = await import("../ai/agents.js");
    const { createRegistryStoreFromEnv } = await import("../ai/index.js");
    const registry = createDefaultAiRegistry({
      databaseStore: createRegistryStoreFromEnv(),
      ...(moduleLoader ? { moduleLoader } : {}),
      tenantId,
    });
    const owners = new Set(
      (await registry.listAgentConfigs()).map((config) => config.id)
    );
    if (owners.size === 0) {
      logger.warn("routine owner sweep skipped — registry listed no agents", {
        tenantId,
      });
    } else {
      for (const row of await routines.list({ tenantId })) {
        const resolves = owners.has(row.agent_id);
        if (row.enabled && !resolves) {
          await routines.update({
            enabled: false,
            id: row.id,
            lastResult: ownerMissingResult(row.agent_id),
            tenantId,
          });
          logger.warn("routine paused — owner unresolvable", {
            agentId: row.agent_id,
            routineId: row.id,
          });
        } else if (
          !row.enabled &&
          resolves &&
          isOwnerMissingResult(row.last_result)
        ) {
          await routines.update({
            enabled: true,
            id: row.id,
            lastResult: ownerResolvedResult(row.agent_id),
            tenantId,
          });
          logger.info("routine resumed — owner resolves again", {
            agentId: row.agent_id,
            routineId: row.id,
          });
        }
      }
    }
  } catch (err) {
    logger.error("routine owner sweep failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // 2.–4. Binding + system-job schedules and the orphan sweep.
  const result = await syncTenantSchedules({
    mastra,
    routines,
    tenantId,
    triggers,
  });

  logger.info("scheduler reconciled", {
    routines: result.routines,
    schedules: result.live,
  });
}

export interface SyncTenantSchedulesResult {
  /** Schedules confirmed live after the pass (routines + system jobs). */
  live: number;
  /** Orphaned schedules removed. */
  removed: number;
  /** Routines whose schedule was newly created or whose id was re-persisted. */
  repaired: number;
  /** Schedule-routine rows examined. */
  routines: number;
}

/**
 * Ensure every schedule routine and system job of ONE tenant has a live Mastra
 * schedule, and sweep this tenant's orphans. Idempotent and cheap — beyond the
 * boot reconcile it runs periodically as the `scheduler-sync` system job,
 * because a routine written by an agent in another process cannot reach this
 * Mastra instance: without this pass such a routine has `schedule_id: null`
 * and never fires until the next apps/ai restart, and a deleted one leaves a
 * live orphan schedule behind.
 */
export async function syncTenantSchedules(options: {
  mastra: Mastra;
  routines: RoutineStore;
  tenantId: string;
  triggers: RoutineTriggerStore;
}): Promise<SyncTenantSchedulesResult> {
  const { mastra, routines, tenantId, triggers } = options;

  const scheduleTriggers = await triggers.list({ kind: "schedule", tenantId });
  const routineRows = await routines.list({ tenantId });
  const routineById = new Map(routineRows.map((row) => [row.id, row]));
  const liveScheduleIds = new Set<string>();
  let repaired = 0;
  for (const trigger of scheduleTriggers) {
    const routine = routineById.get(trigger.routine_id);
    if (!routine) {
      continue;
    }
    // Isolation: one unschedulable trigger (bad cron, say) must not deny every
    // other trigger its schedule.
    try {
      const scheduleId = await syncTriggerSchedule(
        mastra,
        tenantId,
        routine,
        trigger
      );
      if (scheduleId) {
        liveScheduleIds.add(scheduleId);
        if (trigger.schedule_id !== scheduleId) {
          repaired += 1;
          await triggers.update({
            id: trigger.id,
            scheduleId,
            tenantId,
          });
        }
      }
    } catch (err) {
      logger.error("trigger schedule sync failed — trigger will not fire", {
        message: err instanceof Error ? err.message : String(err),
        routineId: trigger.routine_id,
        triggerId: trigger.id,
      });
    }
  }

  // System jobs → schedules. The id is tenant-qualified: system jobs run
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

  // Orphaned Engenty schedules → delete (matched by metadata.engenty, not
  // id prefix — covers both legacy `hb_*` and `agent_hb-*` rows).
  // ONLY this tenant's rows: the Mastra store is global and the sync
  // runs once per tenant — an unscoped sweep would let each tenant's pass
  // delete every other tenant's schedules (last reconciled tenant wins,
  // every other tenant's routines silently stop firing).
  let removed = 0;
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
    await deleteRoutineSchedule(mastra, schedule.id);
    removed += 1;
  }

  return {
    live: liveScheduleIds.size,
    removed,
    repaired,
    routines: scheduleTriggers.length,
  };
}
