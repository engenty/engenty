// Boot gate for the Mastra run-snapshot Postgres (see mastra-storage.ts).
// Runs in apps/ai boot BEFORE Mastra/PostgresStore init and delegates to the
// generic waitForDatabaseReady retry gate (db-readiness.ts) so a transient
// DB-not-ready-yet at startup (e.g. local Supabase still booting) retries within
// a window instead of crashing apps/ai with an opaque
// MASTRA_STORAGE_PG_CREATE_TABLE_FAILED uncaught rejection. Storage is optional:
// no connection string configured → returns silently (e.g. unit-test envs).
// When configured but still unreachable past the timeout it fails loud (no
// fallback to a different storage backend).
import type { RuntimeLogger } from "@engenty/telemetry";
import {
  resolveDbReadyTimeoutMs,
  waitForDatabaseReady,
} from "./db-readiness.js";
import { resolveRunSnapshotConnectionString } from "./mastra-storage.js";

const SUPABASE_HINT =
  "is local Supabase running? Start it with `pnpm supabase:start`, then retry (widen the boot wait via ENGENTY_AI_DB_READY_TIMEOUT_MS). apps/ai needs the Mastra Postgres store (SUPABASE_DB_URL) for native suspend/resume";

export interface EnsureMastraStorageReachableOptions {
  intervalMs?: number;
  logger?: RuntimeLogger;
  // Injectable probe for tests; defaults to a real pg `SELECT 1` (db-readiness).
  probe?: (connectionString: string) => Promise<void>;
  timeoutMs?: number;
}

// Returns silently when no storage DB is configured (storage is optional). When
// a connection string IS configured, waits/retries until the DB answers
// `SELECT 1`, otherwise throws DatabaseNotReadyError after the timeout.
export async function ensureMastraStorageReachable(
  options: EnsureMastraStorageReachableOptions = {}
): Promise<void> {
  const connectionString = resolveRunSnapshotConnectionString();
  if (!connectionString) {
    return;
  }
  await waitForDatabaseReady({
    connectionString,
    hint: SUPABASE_HINT,
    intervalMs: options.intervalMs,
    logger: options.logger,
    probe: options.probe,
    timeoutMs: options.timeoutMs ?? resolveDbReadyTimeoutMs(),
  });
}
