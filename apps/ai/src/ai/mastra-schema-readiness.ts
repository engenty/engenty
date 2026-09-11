// Boot check for Mastra's own tables (see mastra-storage.ts).
//
// The runtime store runs with `disableInit: true`, so it will not create what it
// needs — that is deliberate, because its idempotent DDL trips Supabase's
// `pgrst_ddl_watch` on every boot. The cost of not creating is that a database
// which never had the migration applied fails later, deep inside a run, as
// `relation "ai.mastra_threads" does not exist`. This turns that into one
// actionable line at boot.
import { MASTRA_SCHEMA_INIT_COMMAND } from "./mastra-storage.js";

/**
 * Tables probed as the schema's fingerprint. Not the full set (~42) — these are
 * the ones a conversation cannot run without, so a partially-applied schema
 * still fails here rather than mid-turn.
 */
const REQUIRED_TABLES = [
  "mastra_threads",
  "mastra_messages",
  "mastra_workflow_snapshot",
] as const;

const SCHEMA_NAME = "ai";

export class MastraSchemaMissingError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `Mastra storage schema is not applied — missing ${SCHEMA_NAME}.{${missing.join(", ")}}. Run \`${MASTRA_SCHEMA_INIT_COMMAND}\`. The runtime store does not create its own tables on purpose: its DDL reloads PostgREST's schema cache and 502s in-flight requests (see mastra-storage.ts).`
    );
    this.name = "MastraSchemaMissingError";
    this.missing = missing;
  }
}

/** The tables from {@link REQUIRED_TABLES} that are absent, in declared order. */
async function defaultProbe(
  connectionString: string
): Promise<readonly string[]> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const { rows } = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[])",
      [SCHEMA_NAME, [...REQUIRED_TABLES]]
    );
    const present = new Set(rows.map((row) => row.table_name));
    return REQUIRED_TABLES.filter((table) => !present.has(table));
  } finally {
    await client.end().catch(() => undefined);
  }
}

export interface EnsureMastraSchemaAppliedOptions {
  connectionString: string;
  /** Injectable for tests; defaults to a real information_schema lookup. */
  probe?: (connectionString: string) => Promise<readonly string[]>;
}

/**
 * Throws {@link MastraSchemaMissingError} when Mastra's tables are absent.
 *
 * A probe that itself fails is NOT treated as "missing": reachability is the
 * previous gate's job (db-readiness.ts), and reporting a connection blip as an
 * un-run migration would send someone to fix the wrong thing.
 */
export async function ensureMastraSchemaApplied(
  options: EnsureMastraSchemaAppliedOptions
): Promise<void> {
  const probe = options.probe ?? defaultProbe;
  const missing = await probe(options.connectionString);
  if (missing.length > 0) {
    throw new MastraSchemaMissingError(missing);
  }
}
