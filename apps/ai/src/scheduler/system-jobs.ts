// System jobs — internal scheduled maintenance. Not triggers: not user-facing,
// never creates a Task. Each job is backed by its own Mastra schedule
// (metadata `{ engenty: { kind: 'system-job', jobId, tenantId } }`) and runs
// inside the schedule `prepare` hook.
import {
  AG_UI_OPEN_INTERRUPT_METADATA_KEY,
  isAgUiOpenInterruptExpired,
  readAgUiOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";

const logger = createLogger({ name: "system-jobs" });

export interface SystemJob {
  execute: (ctx: { db: SupabaseClient; tenantId: string }) => Promise<string>;
  /** Stable id; the backing schedule stem is `hb_system-<id>` (Mastra may store `agent_hb-system-…`). */
  id: string;
  name: string;
  /** Cron, UTC. */
  schedule: string;
}

/** Clear expired open-interrupt entries from ai.thread metadata (hygiene). */
async function cleanupExpiredInterrupts(ctx: {
  db: SupabaseClient;
  tenantId: string;
}): Promise<string> {
  const { data, error } = await ctx.db
    .schema("ai")
    .from("thread")
    .select("id, metadata")
    .eq("tenant_id", ctx.tenantId)
    .not("metadata", "is", null);
  if (error) {
    throw new Error(`thread scan failed: ${error.message}`);
  }

  let cleaned = 0;
  for (const row of (data ?? []) as Array<{
    id: string;
    metadata: Record<string, unknown> | null;
  }>) {
    const metadata = row.metadata ?? {};
    const open = readAgUiOpenInterrupt(metadata);
    if (!(open && isAgUiOpenInterruptExpired(open))) {
      continue;
    }
    const { [AG_UI_OPEN_INTERRUPT_METADATA_KEY]: _removed, ...rest } = metadata;
    const { error: updateError } = await ctx.db
      .schema("ai")
      .from("thread")
      .update({ metadata: rest })
      .eq("id", row.id)
      .eq("tenant_id", ctx.tenantId);
    if (updateError) {
      logger.warn("failed to clear expired interrupt", {
        threadId: row.id,
        err: updateError.message,
      });
      continue;
    }
    cleaned += 1;
  }
  return `cleared ${cleaned} expired interrupt(s)`;
}

/**
 * Pull the inbox mail streams. The sync itself lives in the inbox module
 * (core process — that's where the connector registry is populated); this job
 * is only the cron edge, invoking the module operation over the service JWT.
 */
async function runInboxSync(ctx: { tenantId: string }): Promise<string> {
  const { createSchedulerOperationInvoker } = await import(
    "./service-invoker.js"
  );
  const invoke = createSchedulerOperationInvoker(ctx.tenantId);
  const result = (await invoke("inbox_sync_run", {})) as {
    connections?: { error: string | null; new_messages: number }[];
  } | null;
  const connections = result?.connections ?? [];
  const synced = connections.reduce(
    (sum, entry) => sum + entry.new_messages,
    0
  );
  const failed = connections.filter((entry) => entry.error).length;
  return `pulled ${connections.length} connection(s), ${synced} new message(s)${
    failed > 0 ? `, ${failed} failed` : ""
  }`;
}

/**
 * Reconcile time-entry ⇄ calendar sync (backfill new entries, repair failures,
 * delete orphaned events). Cron edge only — the work runs in the time-tracking
 * module operation over the service JWT, where the connector registry lives.
 */
async function runCalendarSync(ctx: { tenantId: string }): Promise<string> {
  const { createSchedulerOperationInvoker } = await import(
    "./service-invoker.js"
  );
  const invoke = createSchedulerOperationInvoker(ctx.tenantId);
  const result = (await invoke("time_tracking_calendar_sync_run", {})) as {
    connections?: number;
    pushed?: number;
    deleted?: number;
    errors?: number;
  } | null;
  const pushed = result?.pushed ?? 0;
  const deleted = result?.deleted ?? 0;
  const errors = result?.errors ?? 0;
  return `reconciled ${result?.connections ?? 0} connection(s): ${pushed} pushed, ${deleted} deleted${
    errors > 0 ? `, ${errors} failed` : ""
  }`;
}

/**
 * Resume graph-action runs whose durable wait has elapsed.
 *
 * Every minute, because `wait_until` is how a flow says "chase in 5 days" and a
 * wake that lands a minute late is fine, while one that lands an hour late is
 * not. The sweep is cheap when idle: a single indexed lookup on
 * `workflow_run.wake_at` that normally returns nothing.
 */
async function runGraphWakeSweep(ctx: { tenantId: string }): Promise<string> {
  const [{ sweepDueGraphWaits }, stores] = await Promise.all([
    import("../ai/workflows/wake-sweep.js"),
    import("../ai/index.js"),
  ]);
  const graphs = stores.createWorkflowStoreFromEnv();
  const requests = stores.createWorkflowRunStoreFromEnv();
  if (!(graphs && requests)) {
    return "skipped: action graph stores unavailable";
  }
  const result = await sweepDueGraphWaits({
    graphs,
    requests,
    tenantId: ctx.tenantId,
  });
  if (result.claimed === 0) {
    return "no runs due";
  }
  return `woke ${result.resumed}/${result.claimed} run(s)${
    result.failed > 0 ? `, ${result.failed} failed` : ""
  }`;
}

/**
 * Repair routine ↔ schedule drift for this tenant. A routine written from
 * another process (an agent calling `routines_create`) cannot reach this
 * Mastra instance, so it has no schedule until this pass (or a restart) picks
 * it up, and a deleted one leaves a live orphan. The sync is the same
 * idempotent pass boot reconcile runs, minus the trigger-declaration
 * upserts.
 */
async function runSchedulerSync(ctx: { tenantId: string }): Promise<string> {
  // Dynamic imports: heartbeat-sync statically imports this file (it lists the
  // jobs to ensure their schedules), so the reverse edge must stay dynamic.
  const [{ getSchedulerMastra }, { syncTenantSchedules }, stores] =
    await Promise.all([
      import("./scheduler-runtime.js"),
      import("./heartbeat-sync.js"),
      import("../ai/index.js"),
    ]);
  const mastra = getSchedulerMastra();
  if (!mastra) {
    return "skipped: scheduler not online";
  }
  const routines = stores.createRoutineStoreFromEnv();
  const triggers = stores.createRoutineTriggerStoreFromEnv();
  if (!(routines && triggers)) {
    return "skipped: routine store unavailable";
  }
  const result = await syncTenantSchedules({
    mastra,
    routines,
    tenantId: ctx.tenantId,
    triggers,
  });
  return `${result.live} schedule(s) live, ${result.repaired} repaired, ${result.removed} orphan(s) removed`;
}

/**
 * Prune AG-UI replay events for long-terminal runs.
 *
 * `ai.agent_run_event` holds every event of every run so a reconnecting client
 * can replay the stream; that need ends shortly after the run does, but the rows
 * lived forever. Events for runs completed/failed/cancelled and STARTED more
 * than 30 days ago are dropped run-by-run; the `ai.agent_run` row itself
 * (status, tokens, error, trace id) is kept forever. `running`,
 * `requires_action` and `paused` never match — a parked approval's events ARE
 * the pending card.
 *
 * Started-at, not finished-at, keys the cutoff: it is NOT NULL for every run,
 * while a cancelled run can carry a NULL `finished_at` that no timestamp
 * comparison would ever match — those rows would be immortal.
 */
const RUN_EVENT_RETENTION_DAYS = 30;
const RUN_EVENT_PRUNE_PASSES = 50;

async function pruneRunEvents(ctx: {
  db: SupabaseClient;
  tenantId: string;
}): Promise<string> {
  const cutoff = new Date(
    Date.now() - RUN_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  let pruned = 0;
  // PostgREST cannot DELETE across an embedded join, so each pass SELECTs event
  // rows whose parent run is prunable (`!inner` + filters on the embed), then
  // deletes those runs' events by id. A pass that returns rows from one busy
  // run still clears that whole run; a backlog larger than the pass budget
  // drains across the following days rather than in one long transaction.
  for (let pass = 0; pass < RUN_EVENT_PRUNE_PASSES; pass++) {
    const { data, error } = await ctx.db
      .schema("ai")
      .from("agent_run_event")
      .select("run_id, agent_run!inner(id)")
      .eq("tenant_id", ctx.tenantId)
      .in("agent_run.status", ["completed", "failed", "cancelled"])
      .lt("agent_run.started_at", cutoff)
      .limit(500);
    if (error) {
      throw new Error(`agent_run_event scan failed: ${error.message}`);
    }
    const runIds = Array.from(
      new Set(
        ((data ?? []) as Array<{ run_id: string }>).map((row) => row.run_id)
      )
    );
    if (runIds.length === 0) {
      break;
    }
    const { error: deleteError } = await ctx.db
      .schema("ai")
      .from("agent_run_event")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .in("run_id", runIds);
    if (deleteError) {
      throw new Error(`agent_run_event prune failed: ${deleteError.message}`);
    }
    pruned += runIds.length;
  }
  return pruned === 0
    ? "no prunable runs"
    : `pruned events for ${pruned} run(s)`;
}

export function listSystemJobs(): SystemJob[] {
  return [
    {
      id: "cleanup-interrupts",
      name: "Cleanup expired interrupts",
      schedule: "30 3 * * *",
      execute: cleanupExpiredInterrupts,
    },
    {
      id: "prune-run-events",
      name: "Prune replay events of old runs",
      schedule: "50 3 * * *",
      execute: pruneRunEvents,
    },
    {
      id: "scheduler-sync",
      name: "Trigger schedule sync",
      schedule: "*/2 * * * *",
      execute: runSchedulerSync,
    },
    {
      id: "inbox-sync",
      name: "Inbox mail sync",
      schedule: "*/5 * * * *",
      execute: runInboxSync,
    },
    {
      id: "calendar-sync",
      name: "Time-tracking calendar sync",
      schedule: "*/15 * * * *",
      execute: runCalendarSync,
    },
    {
      id: "graph-wake",
      name: "Wake sleeping flow runs",
      schedule: "* * * * *",
      execute: runGraphWakeSweep,
    },
  ];
}

/** Run one system job by id — called from the schedule `prepare` hook. */
export async function runSystemJob(
  jobId: string,
  tenantId: string
): Promise<string> {
  const job = listSystemJobs().find((entry) => entry.id === jobId);
  if (!job) {
    throw new Error(`unknown system job: ${jobId}`);
  }
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): the scheduler is the
  // sweep pattern — tenants are ENUMERATED on the service lane
  // (scheduler/tenants.ts), but each job execution here is already scoped to
  // one tenantId, so its DB work runs on a tenant-locked handle.
  const { getTenantDbFactoryFromEnv } = await import("../infra/tenant-db.js");
  const factory = getTenantDbFactoryFromEnv();
  if (!factory) {
    return "skipped: no database";
  }
  return job.execute({ db: factory.getTenantDb({ tenantId }), tenantId });
}
