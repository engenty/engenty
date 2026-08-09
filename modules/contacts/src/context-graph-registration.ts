// Contacts → context-graph wiring.
//
// Schema registration: entity types (`contacts.person`, `contacts.organisation`)
// and edge types (`contacts.works_at`, `contacts.member_of`, `contacts.client_of`)
// plus declarative `onEvents` bindings for live sync.
//
// Source registration: bulk backfill via `registerContextGraphSource` so the
// context-graph HTTP API can expose status and sync endpoints without coupling
// to the contacts module at the package level.

import type { PluginServerApi } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

interface ContactRow {
  display_name: string | null;
  id: string;
  notes: string | null;
  type: "organisation" | "person";
}

interface RelationRow {
  from_contact_id: string;
  relation_type: "client_of" | "member_of" | "works_at";
  to_contact_id: string;
}

interface EventPayload {
  contact_id?: string;
  tenant_id?: string;
}

const personSchema = z
  .object({
    display_name: z.string().nullish(),
    notes: z.string().nullish(),
  })
  .loose();

const organisationSchema = personSchema;
const relationAttrs = z
  .object({
    department: z.string().nullish(),
    label: z.string().nullish(),
    position: z.string().nullish(),
    role: z.string().nullish(),
  })
  .loose();

export function registerContactsContextGraph(input: {
  /** Tenant-locked handle factory (engenty_server lane, RLS-enforced) — the
   * event loaders, status, and sync callbacks all carry a tenant id. */
  getDb: (auth: { tenantId: string }) => SupabaseClient;
  server: Pick<
    PluginServerApi,
    "registerContextGraphSchema" | "registerContextGraphSource"
  >;
}): void {
  const { getDb, server } = input;
  if (!server.registerContextGraphSchema) {
    return;
  }
  const contacts = (db: SupabaseClient) =>
    db.schema("module_contacts").from("contacts");
  const relations = (db: SupabaseClient) =>
    db.schema("module_contacts").from("contact_relations");

  async function loadContact(
    tenantId: string,
    contactId: string
  ): Promise<{ contact: ContactRow; relations: RelationRow[] } | null> {
    const db = getDb({ tenantId });
    const { data: contact, error } = await contacts(db)
      .select("id, type, display_name, notes")
      .eq("tenant_id", tenantId)
      .eq("id", contactId)
      .maybeSingle();
    if (error || !contact) {
      return null;
    }
    const { data: rel } = await relations(db)
      .select("from_contact_id, to_contact_id, relation_type")
      .eq("tenant_id", tenantId)
      .or(`from_contact_id.eq.${contactId},to_contact_id.eq.${contactId}`);
    return {
      contact: contact as ContactRow,
      relations: (rel ?? []) as RelationRow[],
    };
  }

  server.registerContextGraphSchema({
    moduleId: "contacts",
    entityTypes: [
      {
        id: "contacts.person",
        displayName: "Person",
        attributesSchema: personSchema,
      },
      {
        id: "contacts.organisation",
        displayName: "Organisation",
        attributesSchema: organisationSchema,
      },
    ],
    edgeTypes: [
      {
        id: "contacts.works_at",
        displayName: "Works at",
        subjectTypes: ["contacts.person"],
        objectTypes: ["contacts.organisation"],
        attributesSchema: relationAttrs,
      },
      {
        id: "contacts.member_of",
        displayName: "Member of",
        subjectTypes: ["contacts.person", "contacts.organisation"],
        objectTypes: ["contacts.organisation"],
        attributesSchema: relationAttrs,
      },
      {
        id: "contacts.client_of",
        displayName: "Client of",
        subjectTypes: ["contacts.person", "contacts.organisation"],
        objectTypes: ["contacts.person", "contacts.organisation"],
        attributesSchema: relationAttrs,
      },
    ],
    onEvents: [
      {
        name: "contacts.contact.created",
        action: "upsert",
        load: async (payload) => buildUpsert(payload, loadContact),
      },
      {
        name: "contacts.contact.updated",
        action: "upsert",
        load: async (payload) => buildUpsert(payload, loadContact),
      },
      {
        name: "contacts.contact.deleted",
        action: "delete",
        externalRef: (payload) => {
          const id = (payload as EventPayload).contact_id;
          return id ? { module: "contacts", entity: "contact", id } : null;
        },
      },
    ],
  });

  server.registerContextGraphSource?.({
    id: "contacts",
    displayName: "Contacts",
    description: "People and organisations from the contacts module",
    entityTypeIds: ["contacts.person", "contacts.organisation"],
    getStatus: async (api, tenantId) => {
      const [inGraphEntities, countResult] = await Promise.all([
        api.listEntities({ tenantId, module: "contacts" }),
        getDb({ tenantId })
          .schema("module_contacts")
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),
      ]);
      return {
        inGraph: (inGraphEntities as unknown[]).length,
        inSource: countResult.count ?? 0,
      };
    },
    sync: async (api, tenantId) => {
      const db = getDb({ tenantId });
      const { data: contactRows, error: contactErr } = await db
        .schema("module_contacts")
        .from("contacts")
        .select("id, type, display_name, notes")
        .eq("tenant_id", tenantId);
      if (contactErr) {
        throw new Error(`contacts: ${contactErr.message}`);
      }

      let entities = 0;
      for (const row of (contactRows ?? []) as ContactRow[]) {
        await api.upsertEntity({
          tenantId,
          type:
            row.type === "person" ? "contacts.person" : "contacts.organisation",
          externalRef: { module: "contacts", entity: "contact", id: row.id },
          name: row.display_name,
          attributes: {
            display_name: row.display_name,
            notes: row.notes,
          },
        });
        entities++;
      }

      const { data: relRows, error: relErr } = await db
        .schema("module_contacts")
        .from("contact_relations")
        .select("from_contact_id, to_contact_id, relation_type")
        .eq("tenant_id", tenantId);
      if (relErr) {
        throw new Error(`contact_relations: ${relErr.message}`);
      }

      let edges = 0;
      for (const row of (relRows ?? []) as RelationRow[]) {
        const subject = await api.getEntity({
          tenantId,
          externalRef: {
            module: "contacts",
            entity: "contact",
            id: row.from_contact_id,
          },
        });
        const object = await api.getEntity({
          tenantId,
          externalRef: {
            module: "contacts",
            entity: "contact",
            id: row.to_contact_id,
          },
        });
        if (!(subject && object)) {
          continue;
        }
        await api.upsertEdge({
          tenantId,
          type: `contacts.${row.relation_type}`,
          subjectId: (subject as { id: string }).id,
          objectId: (object as { id: string }).id,
          attributes: {},
        });
        edges++;
      }

      return { entities, edges };
    },
  });
}

async function buildUpsert(
  payload: unknown,
  loadContact: (
    tenantId: string,
    contactId: string
  ) => Promise<{ contact: ContactRow; relations: RelationRow[] } | null>
) {
  const { contact_id, tenant_id } = payload as EventPayload;
  if (!(contact_id && tenant_id)) {
    return null;
  }
  const loaded = await loadContact(tenant_id, contact_id);
  if (!loaded) {
    return null;
  }
  const { contact, relations: rels } = loaded;
  const type =
    contact.type === "person" ? "contacts.person" : "contacts.organisation";
  return {
    entity: {
      type,
      externalRef: { module: "contacts", entity: "contact", id: contact.id },
      name: contact.display_name,
      attributes: {
        display_name: contact.display_name,
        notes: contact.notes,
      },
    },
    edges: rels
      .filter((r) => r.from_contact_id === contact.id)
      .map((r) => ({
        type: `contacts.${r.relation_type}`,
        direction: "out" as const,
        other: {
          module: "contacts",
          entity: "contact",
          id: r.to_contact_id,
        },
      })),
  };
}
