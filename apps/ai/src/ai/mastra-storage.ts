// Durable Mastra storage for suspended-run snapshots. This is the prerequisite
// for native suspend/resume: `agent.resumeStreamUntilIdle(resumeData, { runId })`
// reloads the suspended run from here across the approve -> resume HTTP boundary.
// Backed by the same Supabase Postgres the workspace search already uses.
import { PostgresStore } from "@mastra/pg";

export function resolveRunSnapshotConnectionString(): string | undefined {
  return (
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.ENGENTY_WORKSPACE_VECTOR_DB_URL?.trim() ||
    undefined
  );
}

// Returns a PostgresStore when a Postgres connection is configured, otherwise
// undefined (e.g. unit-test envs with no DB). Construction is lazy — no
// connection is opened until the store is first used.
export function createEngentyMastraStorage(): PostgresStore | undefined {
  const connectionString = resolveRunSnapshotConnectionString();
  if (!connectionString) {
    return;
  }
  return new PostgresStore({
    connectionString,
    id: "engenty-ai-runs",
    // Mastra's own tables live in our existing `ai` schema (not `public`, not a
    // separate `mastra` schema) — alongside ai.thread and ai.mastra_cache_*.
    schemaName: "ai",
  });
}
