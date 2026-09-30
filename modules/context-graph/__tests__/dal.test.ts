// Round-trip the Supabase DAL against the local stack. Covers idempotent
// upserts on the unique indexes, cascade delete from entity to edges, and
// tenant isolation. Skips automatically when SUPABASE_URL or the service
// role key are not set.

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createContextGraphRepoSupabase } from "../src/dal/supabase.js";
import { createOntologyRegistry } from "../src/registry.js";
import { createContextGraphServerApi } from "../src/server-api.js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const hasValidServiceRoleKey =
  SERVICE_ROLE_KEY.split(".").length === 3 && SERVICE_ROLE_KEY.length > 20;
const hasSupabase = SUPABASE_URL.startsWith("http") && hasValidServiceRoleKey;

const supabase: SupabaseClient | null = hasSupabase
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const repo = supabase ? createContextGraphRepoSupabase(supabase) : null;

async function createTenant(name: string): Promise<string> {
  if (!supabase) {
    throw new Error("supabase not configured");
  }
  const id = randomUUID();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const { error } = await supabase
    .schema("core")
    .from("tenants")
    .insert({ id, slug, name });
  if (error) {
    throw new Error(`createTenant: ${error.message}`);
  }
  return id;
}

async function deleteTenant(id: string): Promise<void> {
  if (!supabase) {
    return;
  }
  await supabase.schema("core").from("tenants").delete().eq("id", id);
}

describe.skipIf(!hasSupabase)("context-graph DAL", () => {
  let tenantA = "";
  let tenantB = "";

  beforeAll(async () => {
    tenantA = await createTenant(`cg-dal-a-${Date.now()}`);
    tenantB = await createTenant(`cg-dal-b-${Date.now()}`);
  });

  afterAll(async () => {
    if (tenantA) {
      await deleteTenant(tenantA);
    }
    if (tenantB) {
      await deleteTenant(tenantB);
    }
  });

  it("upsertEntity is idempotent on external_ref", async () => {
    if (!repo) {
      return;
    }
    const externalRef = {
      module: "contacts",
      entity: "contact",
      id: randomUUID(),
    };
    const first = await repo.upsertEntity({
      tenantId: tenantA,
      type: "contacts.person",
      externalRef,
      name: "Ada",
      attributes: { email: "ada@example.com" },
    });
    const second = await repo.upsertEntity({
      tenantId: tenantA,
      type: "contacts.person",
      externalRef,
      name: "Ada Lovelace",
      attributes: { phone: "+1" },
    });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Ada Lovelace");
    expect(second.attributes).toMatchObject({
      email: "ada@example.com",
      phone: "+1",
    });
  });

  it("upsertEdge is idempotent on (tenant, type, subject, object)", async () => {
    if (!repo) {
      return;
    }
    const person = await repo.upsertEntity({
      tenantId: tenantA,
      type: "contacts.person",
      externalRef: { module: "contacts", entity: "contact", id: randomUUID() },
    });
    const org = await repo.upsertEntity({
      tenantId: tenantA,
      type: "contacts.organisation",
      externalRef: { module: "contacts", entity: "contact", id: randomUUID() },
    });
    const first = await repo.upsertEdge({
      tenantId: tenantA,
      type: "contacts_works_at",
      subjectId: person.id,
      objectId: org.id,
      attributes: { role: "engineer" },
    });
    const second = await repo.upsertEdge({
      tenantId: tenantA,
      type: "contacts_works_at",
      subjectId: person.id,
      objectId: org.id,
      attributes: { role: "lead" },
    });
    expect(second.id).toBe(first.id);
    expect(second.attributes).toMatchObject({ role: "lead" });
    const edges = await repo.listEdges({
      tenantId: tenantA,
      fromEntityId: person.id,
    });
    expect(edges).toHaveLength(1);
  });

  it("deleting an entity cascades its edges", async () => {
    if (!repo) {
      return;
    }
    const person = await repo.upsertEntity({
      tenantId: tenantA,
      type: "contacts.person",
      externalRef: { module: "contacts", entity: "contact", id: randomUUID() },
    });
    const org = await repo.upsertEntity({
      tenantId: tenantA,
      type: "contacts.organisation",
      externalRef: { module: "contacts", entity: "contact", id: randomUUID() },
    });
    await repo.upsertEdge({
      tenantId: tenantA,
      type: "contacts_member_of",
      subjectId: person.id,
      objectId: org.id,
    });
    await repo.deleteEntity({ tenantId: tenantA, id: person.id });
    const edges = await repo.listEdges({
      tenantId: tenantA,
      toEntityId: org.id,
    });
    expect(edges).toHaveLength(0);
    expect(
      await repo.getEntity({ tenantId: tenantA, id: person.id })
    ).toBeNull();
  });

  it("server API rejects unregistered entity types before any DB write", async () => {
    if (!repo) {
      return;
    }
    const registry = createOntologyRegistry();
    const api = createContextGraphServerApi({ registry, repo });
    await expect(
      api.upsertEntity({
        tenantId: tenantA,
        type: "contacts.unknown",
        attributes: {},
      })
    ).rejects.toThrow(/unknown entity type/);
    // Edge upsert also fails fast — even before resolving the endpoint types
    // when the edge type itself is not registered.
    registry.registerSchema({
      moduleId: "contacts",
      entityTypes: [
        {
          id: "contacts.person",
          displayName: "Person",
          attributesSchema: z.object({}),
        },
      ],
    });
    const person = await api.upsertEntity({
      tenantId: tenantA,
      type: "contacts.person",
      externalRef: { module: "contacts", entity: "contact", id: randomUUID() },
    });
    await expect(
      api.upsertEdge({
        tenantId: tenantA,
        type: "contacts.imaginary",
        subjectId: person.id,
        objectId: person.id,
        attributes: {},
      })
    ).rejects.toThrow();
  });

  it("isolates rows across tenants", async () => {
    if (!repo) {
      return;
    }
    const externalRef = {
      module: "contacts",
      entity: "contact",
      id: randomUUID(),
    };
    const inA = await repo.upsertEntity({
      tenantId: tenantA,
      type: "contacts.person",
      externalRef,
      name: "A-side",
    });
    const inB = await repo.upsertEntity({
      tenantId: tenantB,
      type: "contacts.person",
      externalRef,
      name: "B-side",
    });
    expect(inA.id).not.toBe(inB.id);
    const fromA = await repo.getEntity({ tenantId: tenantA, externalRef });
    const fromB = await repo.getEntity({ tenantId: tenantB, externalRef });
    expect(fromA?.name).toBe("A-side");
    expect(fromB?.name).toBe("B-side");
    const listA = await repo.listEntities({
      tenantId: tenantA,
      module: "contacts",
    });
    expect(listA.every((e) => e.tenant_id === tenantA)).toBe(true);
  });
});
