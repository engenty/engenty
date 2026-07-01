// Smoke test for the contacts → context-graph pilot wiring. Stubs the
// supabase client and `registerContextGraphSchema` so we can assert the
// registration shape and the `load()` payload mapping without standing up
// the local stack.

import type { ContextGraphSchemaRegistration } from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { registerContactsContextGraph } from "./context-graph-registration.js";

interface StubResponse<T> {
  data: T | null;
  error: { message: string } | null;
}

function createStubSupabase(input: {
  contact: {
    id: string;
    type: "organisation" | "person";
    display_name: string | null;
    notes: string | null;
  } | null;
  relations: Array<{
    from_contact_id: string;
    to_contact_id: string;
    relation_type: "client_of" | "member_of" | "works_at";
  }>;
}) {
  // The chain we need: supabase.schema("module_contacts").from("contacts")
  //   .select("...").eq("tenant_id", ...).eq("id", ...).maybeSingle()
  // and supabase.schema("module_contacts").from("contact_relations")
  //   .select("...").eq("tenant_id", ...).or("...")
  const contactsQuery = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(
      async (): Promise<StubResponse<unknown>> => ({
        data: input.contact,
        error: null,
      })
    );
    return chain;
  };
  const relationsQuery = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.or = vi.fn(
      async (): Promise<StubResponse<unknown>> => ({
        data: input.relations,
        error: null,
      })
    );
    return chain;
  };
  return {
    schema: () => ({
      from: (table: string) =>
        table === "contacts" ? contactsQuery() : relationsQuery(),
    }),
  } as unknown as Parameters<
    typeof registerContactsContextGraph
  >[0]["supabase"];
}

describe("registerContactsContextGraph", () => {
  it("registers contacts.person, contacts.organisation, and three edge types", () => {
    const captured: ContextGraphSchemaRegistration[] = [];
    registerContactsContextGraph({
      supabase: createStubSupabase({ contact: null, relations: [] }),
      server: {
        registerContextGraphSchema: (input) => {
          captured.push(input);
          return;
        },
      },
    });
    expect(captured).toHaveLength(1);
    const reg = captured[0];
    expect(reg).toBeDefined();
    expect(reg?.moduleId).toBe("contacts");
    expect(reg?.entityTypes?.map((t) => t.id).sort()).toEqual([
      "contacts.organisation",
      "contacts.person",
    ]);
    expect(reg?.edgeTypes?.map((t) => t.id).sort()).toEqual([
      "contacts.client_of",
      "contacts.member_of",
      "contacts.works_at",
    ]);
    expect(reg?.onEvents?.map((b) => b.name).sort()).toEqual([
      "contacts.contact.created",
      "contacts.contact.deleted",
      "contacts.contact.updated",
    ]);
  });

  it("upsert binding load() maps a person row + relation to the entity/edge upsert input", async () => {
    const captured: ContextGraphSchemaRegistration[] = [];
    const supabase = createStubSupabase({
      contact: {
        id: "person-1",
        type: "person",
        display_name: "Ada Lovelace",
        notes: null,
      },
      relations: [
        {
          from_contact_id: "person-1",
          to_contact_id: "org-1",
          relation_type: "works_at",
        },
      ],
    });
    registerContactsContextGraph({
      supabase,
      server: {
        registerContextGraphSchema: (input) => {
          captured.push(input);
          return;
        },
      },
    });
    const binding = captured[0]?.onEvents?.find(
      (b) => b.name === "contacts.contact.updated"
    );
    expect(binding).toBeDefined();
    const result = await binding?.load?.({
      tenant_id: "tenant-1",
      contact_id: "person-1",
    });
    expect(result).not.toBeNull();
    expect(result?.entity.type).toBe("contacts.person");
    expect(result?.entity.externalRef).toEqual({
      module: "contacts",
      entity: "contact",
      id: "person-1",
    });
    expect(result?.entity.name).toBe("Ada Lovelace");
    expect(result?.edges).toHaveLength(1);
    expect(result?.edges?.[0]).toMatchObject({
      type: "contacts.works_at",
      direction: "out",
      other: { module: "contacts", entity: "contact", id: "org-1" },
    });
  });

  it("delete binding externalRef() resolves the contact's external ref", () => {
    const captured: ContextGraphSchemaRegistration[] = [];
    registerContactsContextGraph({
      supabase: createStubSupabase({ contact: null, relations: [] }),
      server: {
        registerContextGraphSchema: (input) => {
          captured.push(input);
          return;
        },
      },
    });
    const binding = captured[0]?.onEvents?.find(
      (b) => b.name === "contacts.contact.deleted"
    );
    expect(binding?.externalRef?.({ contact_id: "person-1" })).toEqual({
      module: "contacts",
      entity: "contact",
      id: "person-1",
    });
    expect(binding?.externalRef?.({})).toBeNull();
  });
});
