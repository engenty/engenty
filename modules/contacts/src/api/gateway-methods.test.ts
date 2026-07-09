import type {
  PluginGatewayMethod,
  PluginRegistrationReceipt,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import type { ContactRepo } from "../dal/contracts.js";
import type {
  Contact,
  ContactInput,
  ContactRelation,
  ContactRelationInput,
  ContactRelationUpdate,
  ContactSettings,
  ContactUpdateInput,
} from "../schema/types.js";
import { registerContactsApi } from "./index.js";

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact-1",
    tenant_id: "tenant-1",
    scope_id: "default",
    display_name: "Acme GmbH",
    legal_name: "Acme GmbH",
    contact_name: "",
    email: null,
    billing_email: null,
    phone: null,
    type: "organisation",
    address_street: null,
    address_zip: null,
    address_city: null,
    address_country: null,
    address_info: null,
    vat_id: null,
    tax_id: null,
    registration_number: null,
    court_of_registration: null,
    legal_form: null,
    website_contact: null,
    website_impress: null,
    logo_url: null,
    reference_id: null,
    import_id: null,
    last_imported_at: null,
    notes: null,
    created_by: null,
    deleted_at: null,
    roles: [],
    created_at: "2026-05-14T00:00:00.000Z",
    updated_at: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

function makeRelation(
  overrides: Partial<ContactRelation> = {}
): ContactRelation {
  return {
    id: "relation-1",
    from_contact_id: "contact-1",
    to_contact_id: "contact-2",
    relation_type: "client_of",
    label: null,
    position: null,
    department: null,
    role: null,
    is_primary: false,
    valid_from: null,
    valid_to: null,
    created_at: "2026-05-14T00:00:00.000Z",
    updated_at: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

function makeSettings(
  overrides: Partial<ContactSettings> = {}
): ContactSettings {
  return {
    id_prefix: "C-",
    id_offset: 1,
    id_postfix: "",
    salutations: ["Hi"],
    languages: ["en"],
    default_language: "en",
    ...overrides,
  };
}

function makeRepo(): ContactRepo {
  const contacts = new Map<string, Contact>();
  const relations = new Map<string, ContactRelation>();
  let contactSequence = 1;
  let relationSequence = 1;
  let settings = makeSettings();

  return {
    addContactRole: async (contactId, role) => {
      const contact = contacts.get(contactId);
      if (!contact) {
        return false;
      }
      contacts.set(contactId, {
        ...contact,
        roles: contact.roles.includes(role)
          ? contact.roles
          : [...contact.roles, role],
      });
      return true;
    },
    create: async (input: ContactInput) => {
      const id = `contact-${contactSequence}`;
      contactSequence += 1;
      const contact = makeContact({
        ...input,
        id,
        contact_name: input.contact_name ?? "",
        roles: [],
      });
      contacts.set(id, contact);
      return contact;
    },
    createRelation: async (input: ContactRelationInput) => {
      const id = `relation-${relationSequence}`;
      relationSequence += 1;
      const relation = makeRelation({
        ...input,
        id,
        is_primary: input.is_primary ?? false,
      });
      relations.set(id, relation);
      return relation;
    },
    delete: async (id) => contacts.delete(id),
    deleteRelation: async (relationId) => {
      const relation = relations.get(relationId) ?? null;
      relations.delete(relationId);
      return relation;
    },
    getById: async (id) => contacts.get(id) ?? null,
    getByImportId: async (importId) =>
      Array.from(contacts.values()).find((c) => c.import_id === importId) ??
      null,
    getByReferenceId: async (referenceId) =>
      Array.from(contacts.values()).find(
        (c) => c.reference_id === referenceId
      ) ?? null,
    getSettings: async () => settings,
    list: async () => Array.from(contacts.values()),
    listPaginated: async () => ({
      data: Array.from(contacts.values()),
      total: contacts.size,
      page: 1,
      pageSize: 25,
    }),
    listRelationsForContact: async (contactId) =>
      Array.from(relations.values())
        .filter(
          (relation) =>
            relation.from_contact_id === contactId ||
            relation.to_contact_id === contactId
        )
        .map((relation) => ({
          ...relation,
          other_contact: {
            id:
              relation.from_contact_id === contactId
                ? relation.to_contact_id
                : relation.from_contact_id,
            display_name: "Related contact",
            type: "organisation",
            email: null,
            phone: null,
          },
        })),
    removeContactRole: async (contactId, role) => {
      const contact = contacts.get(contactId);
      if (!contact) {
        return false;
      }
      contacts.set(contactId, {
        ...contact,
        roles: contact.roles.filter((candidate) => candidate !== role),
      });
      return true;
    },
    search: async () => ({
      data: Array.from(contacts.values()).map((contact) => ({
        contact,
        match_reason: "text",
        matched_fields: ["display_name"],
        score: 1,
        source_scores: { fts: 1, role: 0, trigram: 0, vector: 0 },
      })),
      total: contacts.size,
      page: 1,
      pageSize: 25,
    }),
    setSettings: async (input) => {
      settings = input;
      return settings;
    },
    update: async (id, input: ContactUpdateInput) => {
      const existing = contacts.get(id);
      if (!existing) {
        return null;
      }
      const updated = makeContact({ ...existing, ...input });
      contacts.set(id, updated);
      return updated;
    },
    updateRelation: async (relationId, input: ContactRelationUpdate) => {
      const existing = relations.get(relationId);
      if (!existing) {
        return null;
      }
      const updated = makeRelation({ ...existing, ...input });
      relations.set(relationId, updated);
      return updated;
    },
  };
}

function makeMockApi() {
  const gatewayMethods: PluginGatewayMethod[] = [];
  const serverOperations: PluginServerOperation[] = [];
  const noopReceipt = (): PluginRegistrationReceipt => ({
    dispose: () => {},
  });
  const api: PluginServerApi = {
    callGatewayMethod: async () => null,
    hasOperation: () => false,
    registerHttpRoute: () => noopReceipt(),
    registerOperation: (operation) => {
      serverOperations.push(operation);
      return noopReceipt();
    },
    registerAiRegistration: () => {},
    registerFeatureFlags: () => [],
    registerProfilePolicy: () => {},
    registerRoleProfiles: () => {},
    registerResultPolicy: () => {},
    registerService: () => {},
    registerTestDataType: () => noopReceipt(),
    registerCli: () => {},
    resolvePath: (p: string) => p,
  };

  return { api, gatewayMethods, serverOperations };
}

function getOperation(
  operations: PluginServerOperation[],
  operationId: string
): PluginServerOperation {
  const found = operations.find(
    (operation) => operation.operationId === operationId
  );
  if (!found) {
    throw new Error(`server operation not found: ${operationId}`);
  }
  return found;
}

describe("registerContactsApi server operations", () => {
  it("registers contacts operations through the server operation API", () => {
    const { api, gatewayMethods, serverOperations } = makeMockApi();

    registerContactsApi(api, makeRepo());

    expect(gatewayMethods).toEqual([]);
    // The synthesized `contacts_contact_search` op is registered by
    // `engenty.server.registerSearchIndexProvider` in `plugin.ts`, *not* by
    // `registerContactsApi`. This test exercises the API registration only,
    // so the search op does not appear here — and the legacy
    // `contacts_search` / `contacts.searchEmbeddings.backfill` /
    // `contacts.searchIndex.status` were retired with the unified surface.
    expect(serverOperations.map((operation) => operation.operationId)).toEqual([
      "contacts_create",
      "contacts_list",
      "contacts_get",
      "contacts_update",
      "contacts_delete",
      "contacts_add_contact_role",
      "contacts_settings_get",
      "contacts_linkedin_get_profile",
      "contacts_settings_update",
      "contacts_create_relation",
      "contacts_list_relations",
      "contacts_update_relation",
      "contacts_delete_relation",
    ]);
    expect(getOperation(serverOperations, "contacts_list")).toMatchObject({
      moduleId: "contacts",
      requiredCapabilities: ["module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
    });
    expect(getOperation(serverOperations, "contacts_create")).toMatchObject({
      moduleId: "contacts",
      requiredCapabilities: ["module.contacts.write"],
      riskLevel: "high",
      requiresApproval: true,
    });
  });

  it("preserves contact and relation operation handlers", async () => {
    const { api, serverOperations } = makeMockApi();
    registerContactsApi(api, makeRepo());

    const ctx = {
      auth: { tenantId: "tenant-1", scopeId: "default", principalId: "user-1" },
    };
    const created = (await getOperation(
      serverOperations,
      "contacts_create"
    ).handler(
      { display_name: "Acme GmbH", type: "organisation", roles: ["client"] },
      ctx
    )) as Contact;
    expect(created).toMatchObject({
      display_name: "Acme GmbH",
      roles: ["client"],
    });

    const listed = (await getOperation(
      serverOperations,
      "contacts_list"
    ).handler({}, ctx)) as { data: Contact[]; total: number };
    expect(listed).toMatchObject({ total: 1 });

    const updated = (await getOperation(
      serverOperations,
      "contacts_update"
    ).handler(
      { id: created.id, patch: { notes: "Reviewed" } },
      ctx
    )) as Contact;
    expect(updated).toMatchObject({ notes: "Reviewed" });

    const relation = (await getOperation(
      serverOperations,
      "contacts_create_relation"
    ).handler(
      {
        from_contact_id: created.id,
        to_contact_id: "contact-2",
        relation_type: "client_of",
      },
      ctx
    )) as ContactRelation;
    expect(relation).toMatchObject({ from_contact_id: created.id });

    const relations = (await getOperation(
      serverOperations,
      "contacts_list_relations"
    ).handler({ id: created.id }, ctx)) as ContactRelation[];
    expect(relations).toHaveLength(1);

    const deleted = await getOperation(
      serverOperations,
      "contacts_delete_relation"
    ).handler({ relationId: relation.id }, ctx);
    expect(deleted).toMatchObject({ id: relation.id });
  });
});
