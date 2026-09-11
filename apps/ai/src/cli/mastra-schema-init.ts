// Applies Mastra's own DDL. The ONLY place `disableInit` is lifted.
//
// Run by `engenty db migrate` (and directly via `engenty db mastra-init`).
// Kept out of the runtime because Mastra's init issues ~34 idempotent DDL
// statements, and Postgres fires `ddl_command_end` for those even when they
// change nothing — which makes Supabase reload PostgREST's schema cache and
// 502 whatever was in flight. See mastra-storage.ts for the full trace.
//
// Safe to run repeatedly: every statement is `IF NOT EXISTS`. Running it is
// what costs a schema reload, which is why it belongs next to the migrations
// rather than on the boot path.
import {
  createEngentyMastraStorage,
  resolveRunSnapshotConnectionString,
} from "../ai/mastra-storage.js";

export async function runMastraSchemaInit(): Promise<void> {
  if (!resolveRunSnapshotConnectionString()) {
    // No DB configured is a valid setup (unit-test envs), not a failure — but
    // say so, because a silent no-op here looks like a successful migration.
    console.log(
      "Skipped Mastra schema init: no SUPABASE_DB_URL / ENGENTY_WORKSPACE_VECTOR_DB_URL configured."
    );
    return;
  }
  const storage = createEngentyMastraStorage({ allowInit: true });
  if (!storage) {
    return;
  }
  console.log("Applying Mastra storage schema to ai.* …");
  try {
    await storage.init();
    console.log("Mastra storage schema applied.");
  } finally {
    // Leaving the pool open holds the process after the CLI finishes.
    await storage.close?.().catch?.(() => undefined);
  }
}

await runMastraSchemaInit();
