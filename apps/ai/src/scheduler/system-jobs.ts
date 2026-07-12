// System jobs — internal scheduled maintenance. Not triggers: not user-facing,
// never creates a Task. Each job is backed by its own Mastra heartbeat
// (metadata `{ engenty: { kind: 'system-job', jobId, tenantId } }`) and runs
// inside the heartbeat `prepare` hook.
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
  /** Stable id; the backing heartbeat is `hb_system_<id-slug>`. */
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
async function runInboxSync(): Promise<string> {
  const { createSchedulerOperationInvoker } = await import(
    "./service-invoker.js"
  );
  const invoke = createSchedulerOperationInvoker();
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
async function runCalendarSync(): Promise<string> {
  const { createSchedulerOperationInvoker } = await import(
    "./service-invoker.js"
  );
  const invoke = createSchedulerOperationInvoker();
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

export function listSystemJobs(): SystemJob[] {
  return [
    {
      id: "cleanup-interrupts",
      name: "Cleanup expired interrupts",
      schedule: "30 3 * * *",
      execute: cleanupExpiredInterrupts,
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
  ];
}

/** Run one system job by id — called from the heartbeat `prepare` hook. */
export async function runSystemJob(
  jobId: string,
  tenantId: string
): Promise<string> {
  const job = listSystemJobs().find((entry) => entry.id === jobId);
  if (!job) {
    throw new Error(`unknown system job: ${jobId}`);
  }
  const { createAiDatabaseAdapter } = await import("../infra/database.js");
  const db = createAiDatabaseAdapter();
  if (!db) {
    return "skipped: no database";
  }
  return job.execute({ db, tenantId });
}
