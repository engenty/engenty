import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  ArtifactVersionConflictError,
  createArtifactStore,
} from "../dal/artifacts/artifact-store.js";
import { createRecordingDbSource } from "./helpers/recording-db-source.js";

const tenantId = "tenant-1";

/**
 * Chainable supabase fake. Every builder method returns the builder; terminal
 * calls resolve to the queued result. `inserts` records what was written.
 */
function makeFake(opts: {
  // Result returned by the artifact SELECT (existing row lookup), if any.
  existingArtifact?: unknown;
}) {
  const inserts: Array<{ table: string; row: unknown }> = [];

  function builder(table: string) {
    let lastInsert: unknown;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      update: () => b,
      insert: (row: unknown) => {
        lastInsert = row;
        inserts.push({ table, row });
        return b;
      },
      // create()/addVersion() read back the inserted row via .single()
      single: async () => ({ data: lastInsert ?? {}, error: null }),
      // getArtifactRow() reads via .maybeSingle()
      maybeSingle: async () => ({
        data: opts.existingArtifact ?? null,
        error: null,
      }),
    };
    return b;
  }

  const client = {
    schema: () => ({ from: (table: string) => builder(table) }),
  } as unknown as SupabaseClient;

  return { client, inserts };
}

describe("artifact store logic", () => {
  it("throws a version conflict when expectedVersion is stale", async () => {
    const { client, inserts } = makeFake({
      existingArtifact: {
        id: "a1",
        tenant_id: tenantId,
        type: "markdown",
        current_version: 3,
      },
    });
    const db = createRecordingDbSource(client);
    const store = createArtifactStore(db.source as never);

    await expect(
      store.addVersion({
        tenantId,
        artifactId: "a1",
        content: "x",
        expectedVersion: 1,
        createdByKind: "agent",
      })
    ).rejects.toBeInstanceOf(ArtifactVersionConflictError);
    expect(inserts).toHaveLength(0);
  });
});
