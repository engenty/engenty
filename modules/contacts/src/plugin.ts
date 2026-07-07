import {
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
  type EntityEventPayload,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { contactsAiRegistration } from "../ai/registrar.js";
import { registerContactsApi } from "./api/index.js";
import { registerContactsContextGraph } from "./context-graph-registration.js";
import {
  CONTACTS_CONTACT_SOURCE_TYPE,
  type ContactsSearchProvider,
  createContactRepoSupabase,
  createContactsRetrievalSource,
  type EmitContactEvent,
} from "./dal/index.js";
import { contactsProfilePolicy } from "./policies.js";
import { contactCreateInputSchema } from "./schema/zod.js";
import { applyResolvedPersonNameToContactInput } from "./services/contact-input.js";

type ContactEntityPayload = EntityEventPayload<"contact_id">;

const registerContactsPlugin: EngentyPluginFactory = (engenty) => {
  const { events, server } = engenty;
  const supabaseRaw = server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error(
      "Contacts module requires Supabase (supabaseUrl and supabaseServiceRoleKey)"
    );
  }
  // Core injects the supabase service-role client. The plugin SDK contract is
  // adapter-agnostic (`unknown`); contacts is intentionally Supabase-bound.
  const supabase = supabaseRaw as SupabaseClient;

  // `contacts.contact` is a managed retrieval source (retrieval-service
  // Phase 4): the central service owns embeddings/fusion/status/backfill;
  // this module supplies the contact document builder (incl. relation
  // texts), title-trigram fuzziness, type/role metadata filters, and
  // hydration. The host manufactures the provider, synthesizes the
  // unchanged `contacts_contact_search` tool, binds the
  // `contacts.contact.{created,updated,deleted}` events, and serves
  // `/api/search-index/providers/contacts.contact/*`.
  if (!(server.registerRetrievalSource && server.getRetrievalService)) {
    throw new Error(
      "Contacts module requires a host with the central retrieval service"
    );
  }
  server.registerRetrievalSource(createContactsRetrievalSource({ supabase }));
  const searchProvider = server
    .getRetrievalService()
    ?.getProvider(
      CONTACTS_CONTACT_SOURCE_TYPE
    ) as ContactsSearchProvider | null;
  if (!searchProvider) {
    throw new Error("contacts.contact retrieval source produced no provider");
  }

  const emitContactEvent: EmitContactEvent = async (verb, payload) => {
    const eventName = `contacts.contact.${verb}` as const;
    await events.modules.emit<ContactEntityPayload>(
      eventName,
      payload satisfies ContactEntityPayload,
      { tenantId: payload.tenant_id }
    );
  };

  const repoFactory = (auth: { tenantId: string; scopeId: string }) =>
    createContactRepoSupabase(supabase, auth.tenantId, auth.scopeId, {
      emitContactEvent,
      searchProvider,
    });

  server.registerFeatureFlags([
    {
      key: "contacts.organisation_accounts",
      namespace: "contacts",
      default: true,
      labelKey: "featureFlags.contacts.organisationAccounts",
      descriptionKey: "featureFlags.contacts.organisationAccountsDescription",
      pluginId: "contacts",
    },
    {
      key: "contacts.personal_accounts",
      namespace: "contacts",
      default: true,
      labelKey: "featureFlags.contacts.personalAccounts",
      descriptionKey: "featureFlags.contacts.personalAccountsDescription",
      pluginId: "contacts",
    },
  ]);
  server.registerProfilePolicy(contactsProfilePolicy);

  const CONTACTS_SCHEMA_DESCRIPTION = `Contact create schema (use snake_case). REQUIRED: display_name (string), type ("organisation" or "person").
Optional (string or null unless noted): legal_name, contact_name, email, billing_email, phone, address_street, address_zip, address_city, address_country, address_info, tax_id, registration_number, court_of_registration, legal_form, website_contact, website_impress, logo_url, reference_id, notes. Optional: created_by (string, UUID). Optional: roles (array of lowercase role slugs, e.g. "client", "partner", "supplier", "team").
vat_id: Use null for most records. If set, MUST match: ATU + 8 digits (e.g. ATU12345678), or DE + 9 digits (e.g. DE123456789), or CHE-XXX.XXX.XXX MWST. Spaces are normalized.`;

  server.registerTestDataType({
    meta: {
      createOperationId: "contacts_create",
      module_id: "contacts",
      data_type: "contacts",
      description: "Contact records (organisation or person)",
      recordSchema: contactCreateInputSchema,
      schemaDescription: CONTACTS_SCHEMA_DESCRIPTION,
    },
    normalizeInput: (record, ctx) => ({
      ...record,
      created_by:
        typeof record.created_by === "string" && record.created_by.length > 0
          ? record.created_by
          : ctx.principalId,
    }),
    persist: async (records, ctx) => {
      const scopeId = ctx.scopeId ?? "default";
      const principalId = ctx.auth?.principalId ?? "test-data-system";
      const repo = repoFactory({
        tenantId: ctx.tenantId,
        scopeId,
      });
      let created = 0;
      for (const raw of records) {
        const parsed = contactCreateInputSchema.parse(raw) as z.infer<
          typeof contactCreateInputSchema
        >;
        await repo.create(
          applyResolvedPersonNameToContactInput({
            display_name: parsed.display_name ?? "",
            type: parsed.type,
            name_prefix: parsed.name_prefix ?? null,
            first_name: parsed.first_name ?? null,
            middle_name: parsed.middle_name ?? null,
            last_name: parsed.last_name ?? null,
            name_suffix: parsed.name_suffix ?? null,
            phonetic_name: parsed.phonetic_name ?? null,
            birth_name: parsed.birth_name ?? null,
            display_name_override: parsed.display_name_override ?? null,
            legal_name: parsed.legal_name ?? null,
            contact_name: parsed.contact_name ?? "",
            email: parsed.email ?? null,
            billing_email: parsed.billing_email ?? null,
            phone: parsed.phone ?? null,
            address_street: parsed.address_street ?? null,
            address_zip: parsed.address_zip ?? null,
            address_city: parsed.address_city ?? null,
            address_country: parsed.address_country ?? null,
            address_info: parsed.address_info ?? null,
            vat_id: parsed.vat_id ?? null,
            tax_id: parsed.tax_id ?? null,
            registration_number: parsed.registration_number ?? null,
            court_of_registration: parsed.court_of_registration ?? null,
            legal_form: parsed.legal_form ?? null,
            website_contact: parsed.website_contact ?? null,
            website_impress: parsed.website_impress ?? null,
            logo_url: parsed.logo_url ?? null,
            reference_id: parsed.reference_id ?? null,
            import_id: parsed.import_id ?? null,
            last_imported_at: parsed.last_imported_at ?? null,
            notes: parsed.notes ?? null,
            created_by: parsed.created_by ?? principalId,
          })
        );
        created++;
      }
      return created;
    },
  });

  const { invokeOperation } = createPluginServerGatewayCaller(server);
  server.registerAiRegistration(
    contactsAiRegistration({ invokeContactsOperation: invokeOperation })
  );
  registerContactsApi(server, repoFactory);

  // Phase 7 pilot: mirror `module_contacts.contacts` + `contact_relations`
  // into the typed context graph (`contacts.person|organisation` + the
  // three relation edge types). Idempotent — re-running on every update
  // just re-upserts on the same external ref.
  registerContactsContextGraph({ supabase, server });
};

export default registerContactsPlugin;
