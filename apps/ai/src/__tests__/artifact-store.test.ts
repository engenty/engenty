import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  ARTIFACT_INLINE_CONTENT_MAX_BYTES,
  ArtifactContentTooLargeError,
  ArtifactVersionConflictError,
  createArtifactStore,
} from "../dal/artifacts/artifact-store.js";

const tenantId = "tenant-1";

/**
 * Chainable supabase fake. Every builder method returns the builder; terminal
 * calls (single/maybeSingle) resolve to a per-table queued result. `inserts`
 * records what was written so we can assert both writes happened on create.
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
    const store = createArtifactStore(client);

    await expect(
      store.addVersion({
        tenantId,
        artifactId: "a1",
        content: "x",
        expectedVersion: 1,
        createdByKind: "agent",
      })
    ).rejects.toBeInstanceOf(ArtifactVersionConflictError);
    // No version written on conflict.
    expect(inserts).toHaveLength(0);
  });

  it("rejects content over the inline size limit", async () => {
    const { client } = makeFake({});
    const store = createArtifactStore(client);
    const tooBig = "a".repeat(ARTIFACT_INLINE_CONTENT_MAX_BYTES + 1);

    await expect(
      store.create({
        tenantId,
        type: "markdown",
        title: "Big",
        scopeType: "thread",
        scopeId: "t1",
        createdByKind: "agent",
        content: tooBig,
      })
    ).rejects.toBeInstanceOf(ArtifactContentTooLargeError);
  });

  it("rejects an unknown artifact type", async () => {
    const { client } = makeFake({});
    const store = createArtifactStore(client);

    await expect(
      store.create({
        tenantId,
        type: "spreadsheet-3000",
        title: "X",
        scopeType: "thread",
        scopeId: "t1",
        createdByKind: "agent",
        content: "hi",
      })
    ).rejects.toThrow(/unknown artifact type/i);
  });

  it("writes both the artifact and its first version on create", async () => {
    const { client, inserts } = makeFake({});
    const store = createArtifactStore(client);

    await store.create({
      tenantId,
      type: "markdown",
      title: "Doc",
      scopeType: "thread",
      scopeId: "t1",
      createdByKind: "agent",
      content: "# hi",
    });

    expect(inserts.map((i) => i.table)).toEqual([
      "artifact",
      "artifact_version",
    ]);
  });
});
