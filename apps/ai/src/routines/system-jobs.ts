// System jobs — internal scheduled maintenance that runs on the same tick as
// routines but is NOT a routine: not board-tracked, not surfaced in
// GET /ai/v1/routines, never creates a Task. Per the Actions/Tasks/Routines
// spec, only Routines (= Trigger(schedule) → Task) are user-facing; headless
// platform work (cleanup, the coordinator heartbeat) lives here.
import {
  AG_UI_OPEN_INTERRUPT_METADATA_KEY,
  isAgUiOpenInterruptExpired,
  readAgUiOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import { createLogger } from "@engenty/telemetry";
import type { RoutineExecutionContext } from "./executors.js";

const logger = createLogger({ name: "system-jobs" });

export interface SystemJob {
  /** Default true when no `routine_state` row exists. */
  enabled_by_default?: boolean;
  execute: (ctx: RoutineExecutionContext) => Promise<string>;
  /** Stable id; reuses `ai.routine_state` rows for enable/override/last-run. */
  id: string;
  name: string;
  quiet_hours?: string | null;
  /** Cron, UTC. */
  schedule: string;
}

/** Clear expired open-interrupt entries from ai.thread metadata (hygiene). */
async function cleanupExpiredInterrupts(
  ctx: RoutineExecutionContext
): Promise<string> {
  if (!ctx.db) {
    return "skipped: no database";
  }
  const { data, error } = await ctx.db
    .schema("ai")
    .from("thread")
    .select("id, metadata")
    .eq("tenant_id", ctx.scope.tenantId)
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
      .eq("tenant_id", ctx.scope.tenantId);
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

export function listSystemJobs(): SystemJob[] {
  return [
    {
      id: "engenty-ai.cleanup-interrupts",
      name: "Cleanup expired interrupts",
      schedule: "30 3 * * *",
      quiet_hours: null,
      execute: cleanupExpiredInterrupts,
    },
    // NOTE: the engenty-coordinator heartbeat job ran the coordinator agent via the
    // legacy detached-run executor, removed in the 2026-06-20 legacy cutover. The
    // coordinator (and other scheduled agent work) returns as a durable workflow /
    // control-plane job in the Actions/Tasks rebuild (Phase 4).
  ];
}
