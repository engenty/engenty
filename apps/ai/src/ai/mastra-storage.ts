// Durable Mastra storage for suspended-run snapshots. This is the prerequisite
// for native suspend/resume: `agent.resumeStream(resumeData, { runId })` reloads
// the suspended run from here across the approve -> resume HTTP boundary.
// Backed by the same Supabase Postgres the workspace search already uses.
import { PostgresStore } from "@mastra/pg";

/** How an operator applies Mastra's own DDL. Named in the boot error. */
export const MASTRA_SCHEMA_INIT_COMMAND = "pnpm engenty db migrate";

export function resolveRunSnapshotConnectionString(): string | undefined {
  return (
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.ENGENTY_WORKSPACE_VECTOR_DB_URL?.trim() ||
    undefined
  );
}

export interface EngentyMastraStorageOptions {
  /**
   * Let the store issue its own DDL.
   *
   * ONLY the migration entry point (cli/mastra-schema-init.ts) passes this.
   * Never at runtime — see the note on `disableInit` below.
   */
  allowInit?: boolean;
}

/**
 * Returns a PostgresStore when a Postgres connection is configured, otherwise
 * undefined (e.g. unit-test envs with no DB). Construction is lazy — no
 * connection is opened until the store is first used.
 */
export function createEngentyMastraStorage(
  options: EngentyMastraStorageOptions = {}
): PostgresStore | undefined {
  const connectionString = resolveRunSnapshotConnectionString();
  if (!connectionString) {
    return;
  }
  return new PostgresStore({
    connectionString,
    // Mastra's init is idempotent but NOT free. It issues ~34 `CREATE TABLE IF
    // NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN
    // IF NOT EXISTS` statements every time a store initialises, and Postgres
    // fires `ddl_command_end` for those even when they change nothing —
    // verified directly, a no-op `CREATE TABLE IF NOT EXISTS` fires the trigger
    // exactly like a real one. On Supabase that trigger is `pgrst_ddl_watch`,
    // which NOTIFYs PostgREST to reload its schema cache and rebuild its
    // connection pool; requests in flight during the rebuild die through Kong
    // as "An invalid response was received from the upstream server".
    //
    // Postgres collapses duplicate NOTIFY payloads within a transaction, so the
    // cost is one reload per store init rather than one per statement —
    // measured on the dev stack: init on = 1 reload, init off = 0. One is
    // enough: it rebuilds the pool, and whatever was mid-request 502s. Every
    // boot and every dev-server reload paid it.
    //
    // DDL is a migration-time concern, which is exactly what upstream's
    // `disableInit` is for:
    // https://mastra.ai/reference/storage/postgresql
    //
    // Apply the DDL with `pnpm engenty db migrate`, which runs apps/ai's
    // `db:mastra-init`. The boot preflight fails loud when it is missing,
    // so a skipped migration is a clear error, never a silent half-schema.
    disableInit: !options.allowInit,
    id: "engenty-ai-runs",
    // Mastra's own tables live in our existing `ai` schema (not `public`, not a
    // separate `mastra` schema) — alongside ai.thread and ai.mastra_cache_*.
    schemaName: "ai",
  });
}
