// Lean coverage for the `contacts.contact` retrieval source. The central
// service owns embedding/fusion/backfill (tested in @engenty/retrieval);
// here we test the contact-specific *decisions*:
//
//   1. `buildDocument` — canonical text via `buildContactSearchDocument`
//      (incl. relation texts), `title = display_name` (the trigram target),
//      and multi-valued filter metadata `{ type, roles: [...] }`.
//   2. `mapFilters` — `role` becomes a `roles` ARRAY containment filter
//      (jsonb `@>` against the stored superset), `type` a plain equality.
//   3. `hydrate` — fused chunk matches map back to `ContactSearchMatch`
//      (contact row + roles, match_reason from matched_fields, doc dedupe).

import type { RetrievalMatch } from "@engenty/retrieval";
import { describe, expect, it } from "vitest";
import { createContactsRetrievalSource } from "./contacts-retrieval-source.js";

interface FakeCall {
  args: unknown[];
  method: string;
}

/** Minimal chainable PostgREST fake: per-table canned rows, thenable chain
 *  (mirrors packages/retrieval/src/test-utils.ts, which is not exported). */
function createFakeSupabase(tables: Record<string, unknown[]>) {
  const calls = new Map<string, FakeCall[]>();
  function builderFor(name: string) {
    const tableCalls = calls.get(name) ?? [];
    calls.set(name, tableCalls);
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "or", "order", "limit"]) {
      builder[method] = (...args: unknown[]) => {
        tableCalls.push({ args, method });
        return builder;
      };
    }
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable Supabase query mock
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) =>
      Promise.resolve({ data: tables[name] ?? [], error: null }).then(
        resolve,
        reject
      );
    return builder;
  }
  return {
    calls,
    schema: () => ({ from: (name: string) => builderFor(name) }),
  };
}

const CONTACT_ROW = {
  id: "c1",
  tenant_id: "tenant-1",
  scope_id: "default",
  type: "person",
  display_name: "Maria Muster",
  first_name: "Maria",
  last_name: "Muster",
  contact_name: "",
  email: "maria@example.com",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
  deleted_at: null,
};

const OTHER_ROW = {
  id: "c2",
  tenant_id: "tenant-1",
  scope_id: "default",
  type: "organisation",
  display_name: "Acme GmbH",
  contact_name: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  deleted_at: null,
};

describe("contacts retrieval source — buildDocument", () => {
  it("builds the canonical document with title, relation texts, and multi-valued filter metadata", async () => {
    const supabase = createFakeSupabase({
      contact_relations: [
        {
          from_contact_id: "c1",
          to_contact_id: "c2",
          relation_type: "employment",
          label: null,
          role: null,
          position: "CEO",
          department: null,
        },
      ],
      contact_roles: [
        { contact_id: "c1", role: "client" },
        { contact_id: "c1", role: "partner" },
      ],
      contacts: [CONTACT_ROW, OTHER_ROW],
    });
    const source = createContactsRetrievalSource({
      getDb: () => supabase as never,
    });

    const document = await source.buildDocument({
      doc_id: "c1",
      tenant_id: "tenant-1",
    });

    expect(document).not.toBeNull();
    expect(document?.source_type).toBe("contacts.contact");
    expect(document?.title).toBe("Maria Muster");
    expect(document?.source_updated_at).toBe("2026-02-01T00:00:00Z");
    // Filter metadata: type equality + roles as ARRAY (jsonb containment
    // matches `{"roles":["client"]}` against this superset).
    expect(document?.filter_metadata).toEqual({
      roles: ["client", "partner"],
      type: "person",
    });
    // buildContactSearchDocument output incl. the relation line.
    expect(document?.text).toContain("Display name: Maria Muster");
    expect(document?.text).toContain("Roles: client, partner");
    expect(document?.text).toContain("Relation: employment CEO Acme GmbH");
  });

  it("returns null for a missing (or soft-deleted) contact", async () => {
    const supabase = createFakeSupabase({ contacts: [] });
    const source = createContactsRetrievalSource({
      getDb: () => supabase as never,
    });
    await expect(
      source.buildDocument({ doc_id: "missing", tenant_id: "tenant-1" })
    ).resolves.toBeNull();
  });
});

describe("contacts retrieval source — mapFilters", () => {
  const source = createContactsRetrievalSource({
    getDb: () => createFakeSupabase({}) as never,
  });
  const mapFilters = source.retriever?.mapFilters;
  if (!mapFilters) {
    throw new Error("contacts source must define mapFilters");
  }

  it("maps role to a roles ARRAY containment filter and type to equality", () => {
    expect(mapFilters({ role: "client", type: "person" })).toEqual({
      metadata: { roles: ["client"], type: "person" },
      scope_id: undefined,
    });
  });

  it("omits metadata when no role/type filter is set and passes scope through", () => {
    expect(mapFilters({ scope_id: "default" })).toEqual({
      metadata: undefined,
      scope_id: "default",
    });
  });
});

describe("contacts retrieval source — hydrate", () => {
  function makeMatch(overrides: Partial<RetrievalMatch>): RetrievalMatch {
    return {
      chunk_id: "c1::chunk::0",
      chunk_index: 0,
      doc_id: "c1",
      matched_fields: [],
      metadata: {},
      module: "contacts",
      occurred_at: null,
      score: 1.2,
      source_scores: { fts: 0.5, trigram: 0.2, vector: 0 },
      source_type: "contacts.contact",
      text: "Display name: Maria Muster",
      title: "Maria Muster",
      ...overrides,
    };
  }

  it("maps fused matches to ContactSearchMatch with loaded contact + roles", async () => {
    const supabase = createFakeSupabase({
      contact_roles: [{ contact_id: "c1", role: "client" }],
      contacts: [CONTACT_ROW],
    });
    const source = createContactsRetrievalSource({
      getDb: () => supabase as never,
    });

    const results = await source.retriever?.hydrate?.(
      [makeMatch({ matched_fields: ["fuzzy"] })],
      { query: "Mria Mustr", tenant_id: "tenant-1", user_id: null }
    );

    expect(results).toHaveLength(1);
    const item = results?.[0]?.item;
    expect(item?.contact.id).toBe("c1");
    expect(item?.contact.roles).toEqual(["client"]);
    expect(item?.match_reason).toBe("fuzzy");
    expect(item?.matched_fields).toEqual(["fuzzy"]);
    expect(item?.score).toBe(1.2);
    // Legacy source-score shape survives; the role signal is retired (a role
    // filter is a hard metadata filter now, not a score).
    expect(item?.source_scores).toEqual({
      fts: 0.5,
      role: 0,
      trigram: 0.2,
      vector: 0,
    });
  });

  it("dedupes chunks per contact and drops matches without a loadable contact", async () => {
    const supabase = createFakeSupabase({
      contact_roles: [],
      contacts: [CONTACT_ROW],
    });
    const source = createContactsRetrievalSource({
      getDb: () => supabase as never,
    });

    const results = await source.retriever?.hydrate?.(
      [
        makeMatch({ matched_fields: ["text"] }),
        makeMatch({ chunk_id: "c1::chunk::1", chunk_index: 1 }),
        makeMatch({ chunk_id: "gone::chunk::0", doc_id: "gone" }),
      ],
      { query: "Muster", tenant_id: "tenant-1", user_id: null }
    );

    expect(results).toHaveLength(1);
    expect(results?.[0]?.item.contact.id).toBe("c1");
    expect(results?.[0]?.item.match_reason).toBe("text");
  });
});
