// Where a headless run's agentic-loop snapshot lives.
//
// An Agent only writes a durable loop snapshot when it has a Mastra instance
// with storage — the chat lane hands its agent the app singleton for exactly
// that reason, and the delegated lane had none. Without a snapshot a pause is
// terminal: `resumeStream()` answers "could not find a suspended run for
// runId", so a gated tool call could be reported but never resolved, in either
// direction.
//
// The instance holds nothing but the store: a leaf run reaches its tools
// through the agent it was assembled with, never through a registry.
import { Mastra } from "@mastra/core/mastra";
import { createEngentyMastraStorage } from "../mastra-storage.js";

// One store for the whole process. Each `PostgresStore` owns its own pg pool,
// so building one per delegated run would leak a pool per run; the store is
// stateless across runs, so sharing it is safe.
let instance: Mastra | undefined;
let resolved = false;

/** Undefined where no Postgres is configured — unit-test envs run without one. */
export function getHeadlessSnapshotMastra(): Mastra | undefined {
  if (!resolved) {
    const storage = createEngentyMastraStorage();
    instance = storage ? new Mastra({ storage } as never) : undefined;
    resolved = true;
  }
  return instance;
}
