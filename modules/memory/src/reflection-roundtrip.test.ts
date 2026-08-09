// End-to-end proof of the memory loop's core promise: a learning an agent
// writes during post-task reflection is retrievable on the NEXT task. This
// crosses two real units against one shared in-memory row store — the write
// gateway (`memory_record_upsert`, source_kind 'reflection') and the retrieval
// source (`buildDocument` / `hydrate`) — with no model and no Supabase. It is
// the seam neither the gateway test nor the retrieval-source test covers alone.
//
// It also pins the governance↔recall interlock: an org-scope agent write lands
// 'proposed' and therefore never becomes indexable until a human approves it.

import type {
  PluginAuthContext,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import type { RetrievalMatch } from "@engenty/retrieval";
import { describe, expect, it } from "vitest";
import { registerMemoryGatewayMethods } from "./api/gateway-methods.js";
import type { MemoryRecordUpsert, MemoryRepo } from "./dal/contracts.js";
import { createMemoryRetrievalSource } from "./dal/memory-retrieval-source.js";
import type { MemoryRecord } from "./schema/zod.js";

const TENANT = "tenant-1";
const SCOPE = "default";
const NOW = "2026-07-21T00:00:00Z";

/** Minimal in-memory MemoryRepo backed by a caller-owned rows array. */
function createInMemoryRepo(rows: MemoryRecord[]): MemoryRepo {
  const find = (
    input: Pick<MemoryRecordUpsert, "scope_kind" | "scope_ref" | "slug">
  ) =>
    rows.find(
      (r) =>
        r.scope_kind === input.scope_kind &&
        r.scope_ref === input.scope_ref &&
        r.slug === input.slug
    );
  return {
    upsert: async (input) => {
      const existing = find(input);
      if (existing) {
        existing.title = input.title;
        existing.body_md = input.body_md;
        existing.kind = input.kind;
        existing.confidence = input.confidence;
        existing.status = input.status ?? existing.status;
        existing.updated_at = NOW;
        return existing;
      }
      const rec: MemoryRecord = {
        id: `mem-${rows.length + 1}`,
        tenant_id: TENANT,
        scope_id: SCOPE,
        scope_kind: input.scope_kind,
        scope_ref: input.scope_ref,
        kind: input.kind,
        slug: input.slug,
        title: input.title,
        body_md: input.body_md,
        source_kind: input.source_kind,
        agent_type_key: input.agent_type_key ?? null,
        confidence: input.confidence,
        status: input.status ?? "active",
        supersedes: input.supersedes ?? null,
        created_by: input.created_by ?? null,
        updated_by: input.updated_by ?? null,
        created_at: NOW,
        updated_at: NOW,
      };
      rows.push(rec);
      return rec;
    },
    getById: async (id) => rows.find((r) => r.id === id) ?? null,
    list: async () => [...rows],
    archive: async (id) => {
      const r = rows.find((x) => x.id === id);
      if (!r) {
        throw new Error(`no record ${id}`);
      }
      r.status = "archived";
      return r;
    },
    approve: async (id) => {
      const r = rows.find((x) => x.id === id);
      if (!r) {
        throw new Error(`no record ${id}`);
      }
      r.status = "active";
      return r;
    },
  };
}

/**
 * Fake Supabase over the same live rows array. Mirrors the shape the retrieval
 * source uses (`schema().from().select().eq().in()`), ignoring filters — the
 * source itself picks the row by id and re-checks status, so returning all
 * current rows is faithful (and reflects upserts that happened before await).
 */
function createFakeSupabase(rows: MemoryRecord[]) {
  function builder() {
    const b: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "order", "limit"]) {
      b[method] = () => b;
    }
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable query mock
    b.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    return b;
  }
  return { schema: () => ({ from: () => builder() }) };
}

/** Registers the real gateway ops against `repo` and returns a runner. */
function mountGateway(repo: MemoryRepo) {
  const ops = new Map<string, PluginServerOperation>();
  const api = {
    registerOperation: (op: PluginServerOperation) => {
      ops.set(op.operationId, op);
    },
  } as unknown as PluginServerApi;
  registerMemoryGatewayMethods(api, () => repo);
  return (opId: string, input: unknown, auth: PluginAuthContext) => {
    const op = ops.get(opId);
    if (!op) {
      throw new Error(`op ${opId} not registered`);
    }
    return op.handler(input, { auth } as never);
  };
}

const agentAuth: PluginAuthContext = {
  principalId: "user-1",
  scopeId: SCOPE,
  tenantId: TENANT,
  agentId: "contacts.manager",
};

function match(docId: string): RetrievalMatch {
  return {
    chunk_id: `${docId}-c0`,
    doc_id: docId,
    matched_fields: ["text"],
    score: 0.9,
    source_scores: { fts: 0.9, trigram: 0, vector: 0 },
  } as unknown as RetrievalMatch;
}

describe("memory loop round-trip: reflection write → next-task recall", () => {
  it("a reflection-written user memory becomes indexable and hydrates back", async () => {
    const rows: MemoryRecord[] = [];
    const run = mountGateway(createInMemoryRepo(rows));

    // Task 1 reflection: the specialist saves one durable lesson.
    const saved = (await run(
      "memory_record_upsert",
      {
        scope_kind: "user",
        scope_ref: "user-1",
        slug: "acme-prefers-net30",
        title: "Acme prefers NET-30 invoices",
        body_md: "Acme rejects NET-14; always issue their invoices at NET-30.",
        kind: "lesson",
        confidence: "high",
        source_kind: "reflection",
        agent_type_key: "contacts.manager",
      },
      agentAuth
    )) as MemoryRecord;

    // Stored as a durable, active, reflection-provenance record.
    expect(saved.source_kind).toBe("reflection");
    expect(saved.status).toBe("active");
    expect(saved.agent_type_key).toBe("contacts.manager");
    expect(rows).toHaveLength(1);

    // Next task: the same row indexes (buildDocument non-null) with scope
    // metadata, and a search hit hydrates back to the exact record.
    const source = createMemoryRetrievalSource({
      getDb: () => createFakeSupabase(rows) as never,
    });

    const doc = await source.buildDocument({
      doc_id: saved.id,
      tenant_id: TENANT,
    });
    expect(doc).not.toBeNull();
    expect(doc?.text).toBe(
      "Acme prefers NET-30 invoices\n\nAcme rejects NET-14; always issue their invoices at NET-30."
    );
    expect(doc?.filter_metadata).toMatchObject({
      scope_kind: "user",
      scope_ref: "user-1",
      kind: "lesson",
    });

    const hits = await source.retriever?.hydrate?.([match(saved.id)], {
      tenant_id: TENANT,
    } as never);
    expect(hits).toHaveLength(1);
    expect(hits?.[0]?.item.record.id).toBe(saved.id);
    expect(hits?.[0]?.item.record.slug).toBe("acme-prefers-net30");
  });

  it("an org-scope agent write lands 'proposed' and stays OUT of recall until approved", async () => {
    const rows: MemoryRecord[] = [];
    const repo = createInMemoryRepo(rows);
    const run = mountGateway(repo);

    const proposed = (await run(
      "memory_record_upsert",
      {
        scope_kind: "org",
        scope_ref: undefined,
        slug: "quote-approval-threshold",
        title: "Quotes over 50k need CFO sign-off",
        body_md:
          "Any quote above €50,000 requires CFO approval before sending.",
        kind: "guideline",
        confidence: "high",
        source_kind: "reflection",
      },
      agentAuth
    )) as MemoryRecord;

    expect(proposed.status).toBe("proposed");

    const source = createMemoryRetrievalSource({
      getDb: () => createFakeSupabase(rows) as never,
    });

    // Governance ↔ recall interlock: proposed records never index.
    const before = await source.buildDocument({
      doc_id: proposed.id,
      tenant_id: TENANT,
    });
    expect(before).toBeNull();

    // After a human approves it, the same row becomes indexable.
    await repo.approve(proposed.id);
    const after = await source.buildDocument({
      doc_id: proposed.id,
      tenant_id: TENANT,
    });
    expect(after).not.toBeNull();
    expect(after?.filter_metadata).toMatchObject({ scope_kind: "org" });
  });
});
