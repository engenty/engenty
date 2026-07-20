// DAL behavior that the gateway ops rely on:
//   - upsert is slug-keyed: an existing (scope_kind, scope_ref, slug) row is
//     updated in place (id stable), a missing one is inserted
//   - a plain re-save does NOT resurrect archived/proposed rows (status only
//     changes when the caller forces one)
//   - archive is a status flip, and every mutation emits its module event

import { describe, expect, it } from "vitest";
import type { MemoryEventVerb } from "./contracts.js";
import { createMemoryRepoSupabase } from "./supabase.js";

function memoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    tenant_id: "tenant-1",
    scope_id: "default",
    scope_kind: "user",
    scope_ref: "user-1",
    kind: "preference",
    slug: "prefers-brief-emails",
    title: "Prefers brief emails",
    body_md: "Short.",
    source_kind: "agent",
    agent_type_key: null,
    confidence: "medium",
    status: "active",
    supersedes: null,
    created_by: "user-1",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

interface Recorded {
  method: string;
  args: unknown[];
}

/**
 * Chainable PostgREST fake with a FIFO of terminal responses: each
 * maybeSingle()/single()/await pops the next canned response. Records every
 * chained call for assertions.
 */
function createFakeSupabase(responses: unknown[]) {
  const queue = [...responses];
  const calls: Recorded[] = [];
  const next = () =>
    Promise.resolve(
      queue.shift() ?? { data: null, error: { message: "queue empty" } }
    );
  function builder() {
    const b: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "is",
      "in",
      "order",
      "limit",
      "insert",
      "update",
    ]) {
      b[method] = (...args: unknown[]) => {
        calls.push({ args, method });
        return b;
      };
    }
    b.maybeSingle = () => {
      calls.push({ args: [], method: "maybeSingle" });
      return next();
    };
    b.single = () => {
      calls.push({ args: [], method: "single" });
      return next();
    };
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable Supabase query mock
    b.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => next().then(resolve, reject);
    return b;
  }
  return {
    calls,
    client: { schema: () => ({ from: () => builder() }) },
  };
}

function upsertInput(overrides: Record<string, unknown> = {}) {
  return {
    scope_kind: "user" as const,
    scope_ref: "user-1",
    slug: "prefers-brief-emails",
    title: "Prefers brief emails",
    body_md: "Short.",
    kind: "preference" as const,
    confidence: "medium" as const,
    source_kind: "agent" as const,
    ...overrides,
  };
}

describe("memory repo — upsert", () => {
  it("inserts a new record when the slug is free and emits 'created'", async () => {
    const fake = createFakeSupabase([
      { data: null, error: null }, // findBySlug: no row
      { data: memoryRow(), error: null }, // insert().single()
    ]);
    const events: MemoryEventVerb[] = [];
    const repo = createMemoryRepoSupabase(fake.client, "tenant-1", "default", {
      emitMemoryEvent: async (verb) => {
        events.push(verb);
      },
    });
    const saved = await repo.upsert(upsertInput());
    expect(saved.id).toBe("m1");
    expect(events).toEqual(["created"]);
    const insert = fake.calls.find((call) => call.method === "insert");
    const row = insert?.args[0] as Record<string, unknown>;
    expect(row.tenant_id).toBe("tenant-1");
    expect(row.scope_id).toBe("default");
    expect(row.status).toBe("active");
    expect(typeof row.id).toBe("string");
  });

  it("updates in place when the slug exists and emits 'updated'", async () => {
    const fake = createFakeSupabase([
      { data: memoryRow(), error: null }, // findBySlug hit
      { data: memoryRow({ title: "New title" }), error: null }, // update().single()
    ]);
    const events: MemoryEventVerb[] = [];
    const repo = createMemoryRepoSupabase(fake.client, "tenant-1", "default", {
      emitMemoryEvent: async (verb) => {
        events.push(verb);
      },
    });
    const saved = await repo.upsert(upsertInput({ title: "New title" }));
    expect(saved.id).toBe("m1");
    expect(saved.title).toBe("New title");
    expect(events).toEqual(["updated"]);
    const update = fake.calls.find((call) => call.method === "update");
    const patch = update?.args[0] as Record<string, unknown>;
    expect(patch.title).toBe("New title");
    // No forced status → an archived/proposed row keeps its status on re-save.
    expect(patch).not.toHaveProperty("status");
    expect(fake.calls.some((call) => call.method === "insert")).toBe(false);
  });

  it("applies a forced status on update (org governance path)", async () => {
    const fake = createFakeSupabase([
      { data: memoryRow({ scope_kind: "org", scope_ref: null }), error: null },
      {
        data: memoryRow({
          scope_kind: "org",
          scope_ref: null,
          status: "proposed",
        }),
        error: null,
      },
    ]);
    const repo = createMemoryRepoSupabase(fake.client, "tenant-1", "default");
    await repo.upsert(
      upsertInput({
        scope_kind: "org",
        scope_ref: null,
        status: "proposed",
      })
    );
    const update = fake.calls.find((call) => call.method === "update");
    expect((update?.args[0] as Record<string, unknown>).status).toBe(
      "proposed"
    );
  });
});

describe("memory repo — archive", () => {
  it("flips status to archived and emits 'archived'", async () => {
    const fake = createFakeSupabase([
      { data: memoryRow({ status: "archived" }), error: null },
    ]);
    const events: MemoryEventVerb[] = [];
    const repo = createMemoryRepoSupabase(fake.client, "tenant-1", "default", {
      emitMemoryEvent: async (verb) => {
        events.push(verb);
      },
    });
    const archived = await repo.archive("m1");
    expect(archived.status).toBe("archived");
    expect(events).toEqual(["archived"]);
    const update = fake.calls.find((call) => call.method === "update");
    expect((update?.args[0] as Record<string, unknown>).status).toBe(
      "archived"
    );
  });
});
