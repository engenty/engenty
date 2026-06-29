// DB-readiness gate for the Mastra run-snapshot Postgres (see mastra-storage.ts).
// Mastra opens the PostgresStore during boot to create its run-snapshot tables
// (`mastra_threads`, ...). If the DB is not yet reachable (e.g. local Supabase is
// still starting), that surfaces as an opaque MASTRA_STORAGE_PG_CREATE_TABLE_FAILED
// uncaught rejection that hard-crashes apps/ai. This gate polls a real `SELECT 1`
// with bounded backoff BEFORE storage init: a transient DB-not-ready-yet at boot
// retries within a window instead of crashing the dev process; a genuinely
// missing/misconfigured DB still fails loud after the timeout (no fallback).
import { createLogger, type RuntimeLogger } from "@engenty/telemetry";

const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 60_000;
// Per-probe connect budget — short so a refused/unreachable host fails fast and
// we move on to the next retry tick instead of hanging on a single attempt.
const PROBE_CONNECT_TIMEOUT_MS = 5000;

export const DB_READY_TIMEOUT_ENV = "ENGENTY_AI_DB_READY_TIMEOUT_MS";

// Overall readiness budget: env override wins, otherwise the ~60s default.
export function resolveDbReadyTimeoutMs(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env[DB_READY_TIMEOUT_ENV]?.trim();
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

// Thrown when the DB never became reachable within the timeout window. Carries
// the redacted target + attempt count so boot can log one actionable line.
export class DatabaseNotReadyError extends Error {
  readonly attempts: number;
  readonly hint: string;
  readonly target: string;
  readonly timeoutMs: number;

  constructor(params: {
    attempts: number;
    cause?: unknown;
    hint: string;
    target: string;
    timeoutMs: number;
  }) {
    super(
      `Database not ready at ${params.target} after ${params.timeoutMs}ms (${params.attempts} attempts) — ${params.hint}`,
      params.cause === undefined ? undefined : { cause: params.cause }
    );
    this.name = "DatabaseNotReadyError";
    this.attempts = params.attempts;
    this.hint = params.hint;
    this.target = params.target;
    this.timeoutMs = params.timeoutMs;
  }
}

// Redacts credentials from a connection string for logs/errors (host:port/db).
function describeTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const port = url.port || "5432";
    return `${url.hostname || "127.0.0.1"}:${port}${url.pathname || ""}`;
  } catch {
    return "(unparseable connection string)";
  }
}

// One `SELECT 1` round-trip via a throwaway pg Client. Resolves on success;
// rejects on any connect/auth/query error so the caller can retry. Uses the pg
// client that @mastra/pg already pulls in (declared directly in package.json).
async function defaultProbe(connectionString: string): Promise<void> {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: PROBE_CONNECT_TIMEOUT_MS,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    // Best-effort close; a failed end() must not mask the probe's result.
    await client.end().catch(() => undefined);
  }
}

export interface WaitForDatabaseReadyOptions {
  connectionString: string;
  // Actionable next step appended to the thrown error (e.g. start the DB).
  hint?: string;
  intervalMs?: number;
  logger?: RuntimeLogger;
  // Injectable probe + clock for tests; defaults do a real pg `SELECT 1`.
  now?: () => number;
  probe?: (connectionString: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

// Polls the DB until a `SELECT 1` succeeds or the timeout elapses. Warns on each
// failed attempt, logs info once ready, and throws DatabaseNotReadyError on
// timeout (fail loud — never silently degrades or falls back to another store).
export async function waitForDatabaseReady(
  options: WaitForDatabaseReadyOptions
): Promise<void> {
  const {
    connectionString,
    hint = "ensure the database is running and reachable",
  } = options;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const probe = options.probe ?? defaultProbe;
  const logger = options.logger ?? createLogger({ name: "apps/ai" });
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const target = describeTarget(connectionString);
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastError: unknown;

  for (;;) {
    attempts += 1;
    try {
      await probe(connectionString);
      logger.info("database ready", {
        attempts,
        target,
        waitedMs: now() - startedAt,
      });
      return;
    } catch (err) {
      lastError = err;
      // No room for another full interval+probe before the deadline → fail loud.
      if (now() + intervalMs >= deadline) {
        throw new DatabaseNotReadyError({
          attempts,
          cause: lastError,
          hint,
          target,
          timeoutMs,
        });
      }
      logger.warn("database not ready yet — retrying", {
        attempt: attempts,
        elapsedMs: now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
        retryInMs: intervalMs,
        target,
      });
      await sleep(intervalMs);
    }
  }
}
