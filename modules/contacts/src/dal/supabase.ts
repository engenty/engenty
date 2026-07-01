import type { SearchResult } from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import {
  getPrimaryContactIdForRelation,
  isCurrentContactRelation,
  normalizeContactRelationParticipants,
  validateContactRelationParticipants,
} from "../schema/contact-relations.js";
import type {
  Contact,
  ContactInput,
  ContactRelation,
  ContactRelationInput,
  ContactRelationListItem,
  ContactRelationUpdate,
  ContactRole,
  ContactSearchMatch,
  ContactSettings,
  ContactSettingsInput,
  ContactsPaginatedResponse,
  ContactsQueryParams,
  ContactsSearchParams,
  ContactsSearchResponse,
  ContactUpdateInput,
} from "../schema/types.js";
import {
  applyResolvedPersonNameToContactInput,
  applyResolvedPersonNameToContactPatch,
} from "../services/contact-input.js";
import {
  DEFAULT_CONTACT_SETTINGS,
  mapSortBy,
  rowToContact,
  sanitizeInput,
  sanitizePartialPatch,
} from "./contact-mappers.js";
import type { ContactsSearchProvider } from "./contacts-search-index-provider.js";
import type { ContactRepo } from "./contracts.js";

export type ContactRepoSupabase = ContactRepo;

// `EmitContactEvent` decouples the repo from the plugin events runtime so
// tests can pass a no-op while production wiring forwards to
// `engenty.events.modules.emit("contacts.contact.<verb>", ...)` — the SDK
// declarative re-index binding then routes those into the search provider's
// replace/delete paths.
export type EmitContactEvent = (
  verb: "created" | "deleted" | "updated",
  payload: { contact_id: string; scope_id: string; tenant_id: string }
) => void | Promise<void>;

export interface CreateContactRepoSupabaseOptions {
  emitContactEvent?: EmitContactEvent;
  searchProvider: ContactsSearchProvider;
}

export function createContactRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string,
  options: CreateContactRepoSupabaseOptions
): ContactRepo {
  const supabase = adapter as SupabaseClient;
  const schema = "module_contacts";
  const contacts = () => supabase.schema(schema).from("contacts");
  const contactRelations = () =>
    supabase.schema(schema).from("contact_relations");
  const contactRoles = () => supabase.schema(schema).from("contact_roles");
  const settings = () => supabase.schema(schema).from("contact_settings");

  async function getRolesForContactIds(
    ids: string[]
  ): Promise<Map<string, ContactRole[]>> {
    const map = new Map<string, ContactRole[]>();
    if (ids.length === 0) {
      return map;
    }
    const { data, error } = await contactRoles()
      .select("contact_id, role")
      .in("contact_id", ids);
    if (error) {
      return map;
    }
    for (const row of data ?? []) {
      const eid = String((row as { contact_id: string }).contact_id);
      const r = row.role as ContactRole;
      const arr = map.get(eid) ?? [];
      if (!arr.includes(r)) {
        arr.push(r);
      }
      map.set(eid, arr);
    }
    return map;
  }

  async function attachRolesToContacts<T extends { id: string }>(
    items: T[]
  ): Promise<(T & { roles: ContactRole[] })[]> {
    const ids = items.map((i) => i.id);
    const rolesMap = await getRolesForContactIds(ids);
    return items.map((item) => ({
      ...item,
      roles: rolesMap.get(item.id) ?? [],
    }));
  }

  function rowToRelation(row: Record<string, unknown>): ContactRelation {
    return {
      id: String(row.id),
      from_contact_id: String(row.from_contact_id),
      to_contact_id: String(row.to_contact_id),
      relation_type: row.relation_type as ContactRelation["relation_type"],
      label: (row.label as string | null) ?? null,
      position: (row.position as string | null) ?? null,
      department: (row.department as string | null) ?? null,
      role: (row.role as string | null) ?? null,
      is_primary: Boolean(row.is_primary),
      valid_from: (row.valid_from as string | null) ?? null,
      valid_to: (row.valid_to as string | null) ?? null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  async function getContactsByIds(ids: string[]) {
    if (ids.length === 0) {
      return new Map<string, Contact>();
    }

    const { data, error } = await contacts()
      .select("*")
      .in("id", ids)
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .is("deleted_at", null);

    if (error) {
      throw new Error(`Failed to load contacts: ${error.message}`);
    }

    const rolesMap = await getRolesForContactIds(ids);
    return new Map(
      (data ?? []).map((row) => {
        const id = String((row as { id: string }).id);
        return [
          id,
          rowToContact(
            row as Record<string, unknown>,
            rolesMap.get(id) ?? []
          ) as Contact,
        ];
      })
    );
  }

  async function getContactByIdForRelation(id: string) {
    const map = await getContactsByIds([id]);
    return map.get(id) ?? null;
  }

  async function getRelationById(
    relationId: string
  ): Promise<ContactRelation | null> {
    const { data, error } = await contactRelations()
      .select("*")
      .eq("id", relationId)
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load contact relation: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return rowToRelation(data as Record<string, unknown>);
  }

  async function clearPrimaryWorksAtRelations(
    personContactId: string,
    exceptRelationId?: string
  ) {
    let query = contactRelations()
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("relation_type", "works_at")
      .eq("from_contact_id", personContactId)
      .eq("is_primary", true);

    if (exceptRelationId) {
      query = query.neq("id", exceptRelationId);
    }

    const { error } = await query;
    if (error) {
      throw new Error(`Failed to update primary relation: ${error.message}`);
    }
  }

  async function buildRelationListItems(
    contactId: string,
    relations: ContactRelation[]
  ): Promise<ContactRelationListItem[]> {
    const otherContactIds = Array.from(
      new Set(
        relations.map((relation) =>
          relation.from_contact_id === contactId
            ? relation.to_contact_id
            : relation.from_contact_id
        )
      )
    );
    const contactsById = await getContactsByIds(otherContactIds);

    return relations
      .map((relation) => {
        const otherContactId =
          relation.from_contact_id === contactId
            ? relation.to_contact_id
            : relation.from_contact_id;
        const otherContact = contactsById.get(otherContactId);
        if (!otherContact) {
          return null;
        }

        return {
          ...relation,
          other_contact: {
            id: otherContact.id,
            display_name: otherContact.display_name,
            type: otherContact.type,
            email: otherContact.email,
            phone: otherContact.phone,
          },
        } satisfies ContactRelationListItem;
      })
      .filter((item): item is ContactRelationListItem => item !== null);
  }

  // Persist-time hook — fan out canonical entity events. The SDK's
  // declarative re-index binding handles the actual `replaceDocument` /
  // `deleteDocument` against the contacts search provider; the repo is no
  // longer in the embedding-write path.
  const emit = options.emitContactEvent;
  async function emitEntity(
    verb: "created" | "deleted" | "updated",
    contactId: string
  ): Promise<void> {
    if (!emit) {
      return;
    }
    await emit(verb, {
      contact_id: contactId,
      scope_id: scopeId,
      tenant_id: tenantId,
    });
  }

  return {
    async create(input: ContactInput): Promise<Contact> {
      const id = uuidv7();
      const now = new Date().toISOString();
      const normalized = applyResolvedPersonNameToContactInput(
        sanitizeInput(input) as ContactInput
      );

      const { data: inserted, error } = await contacts()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          type: normalized.type,
          display_name: normalized.display_name,
          name_prefix: normalized.name_prefix,
          first_name: normalized.first_name,
          middle_name: normalized.middle_name,
          last_name: normalized.last_name,
          name_suffix: normalized.name_suffix,
          phonetic_name: normalized.phonetic_name,
          birth_name: normalized.birth_name,
          display_name_override: normalized.display_name_override,
          legal_name: normalized.legal_name,
          contact_name: normalized.contact_name,
          email: normalized.email,
          billing_email: normalized.billing_email,
          phone: normalized.phone,
          vat_id: normalized.vat_id,
          tax_id: normalized.tax_id,
          registration_number: normalized.registration_number,
          court_of_registration: normalized.court_of_registration,
          legal_form: normalized.legal_form,
          address_street: normalized.address_street,
          address_info: normalized.address_info,
          address_zip: normalized.address_zip,
          address_city: normalized.address_city,
          address_country: normalized.address_country,
          website_contact: normalized.website_contact,
          website_impress: normalized.website_impress,
          logo_url: normalized.logo_url,
          reference_id: normalized.reference_id,
          import_id: normalized.import_id ?? null,
          last_imported_at: normalized.last_imported_at ?? null,
          notes: normalized.notes,
          created_by: normalized.created_by,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create contact: ${error.message}`);
      }
      const created = inserted
        ? rowToContact(inserted as Record<string, unknown>)
        : ({
            ...normalized,
            id,
            tenant_id: tenantId,
            scope_id: scopeId,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          } as Contact);
      await emitEntity("created", created.id);
      return created;
    },

    async createRelation(
      input: ContactRelationInput
    ): Promise<ContactRelation> {
      const rawFromContact = await getContactByIdForRelation(
        input.from_contact_id
      );
      const rawToContact = await getContactByIdForRelation(input.to_contact_id);
      if (!(rawFromContact && rawToContact)) {
        throw new Error("Both contacts must exist before creating a relation");
      }

      const normalized = normalizeContactRelationParticipants(
        input,
        { id: rawFromContact.id, type: rawFromContact.type },
        { id: rawToContact.id, type: rawToContact.type }
      );
      const validationError = validateContactRelationParticipants({
        fromContact: normalized.fromContact,
        relation_type: normalized.input.relation_type,
        toContact: normalized.toContact,
      });
      if (validationError) {
        throw new Error(validationError);
      }

      const primaryContactId = getPrimaryContactIdForRelation({
        from_contact_id: normalized.input.from_contact_id,
        relation_type: normalized.input.relation_type,
        to_contact_id: normalized.input.to_contact_id,
      });
      if (normalized.input.is_primary && primaryContactId) {
        await clearPrimaryWorksAtRelations(primaryContactId);
      }

      const now = new Date().toISOString();
      const id = uuidv7();
      const { data, error } = await contactRelations()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          from_contact_id: normalized.input.from_contact_id,
          to_contact_id: normalized.input.to_contact_id,
          relation_type: normalized.input.relation_type,
          label: normalized.input.label ?? null,
          position: normalized.input.position ?? null,
          department: normalized.input.department ?? null,
          role: normalized.input.role ?? null,
          is_primary: normalized.input.is_primary ?? false,
          valid_from: normalized.input.valid_from ?? null,
          valid_to: normalized.input.valid_to ?? null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create contact relation: ${error.message}`);
      }

      const relation = rowToRelation(
        data
          ? (data as Record<string, unknown>)
          : {
              id,
              ...normalized.input,
              is_primary: normalized.input.is_primary ?? false,
              created_at: now,
              updated_at: now,
            }
      );
      await Promise.all([
        emitEntity("updated", relation.from_contact_id),
        emitEntity("updated", relation.to_contact_id),
      ]);
      return relation;
    },

    async listRelationsForContact(
      contactId: string,
      options?: { includeInactive?: boolean }
    ): Promise<ContactRelationListItem[]> {
      const { data, error } = await contactRelations()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .or(`from_contact_id.eq.${contactId},to_contact_id.eq.${contactId}`)
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to list contact relations: ${error.message}`);
      }

      const relations = (data ?? []).map((row) =>
        rowToRelation(row as Record<string, unknown>)
      );
      const visibleRelations =
        options?.includeInactive === true
          ? relations
          : relations.filter((relation) => isCurrentContactRelation(relation));

      return buildRelationListItems(contactId, visibleRelations);
    },

    async updateRelation(
      relationId: string,
      input: ContactRelationUpdate
    ): Promise<ContactRelation | null> {
      const existing = await getRelationById(relationId);
      if (!existing) {
        return null;
      }

      const merged: ContactRelation = {
        ...existing,
        ...input,
        id: existing.id,
        from_contact_id: existing.from_contact_id,
        to_contact_id: existing.to_contact_id,
        relation_type: existing.relation_type,
        updated_at: new Date().toISOString(),
      };

      const primaryContactId = getPrimaryContactIdForRelation(merged);
      if (merged.is_primary && primaryContactId) {
        await clearPrimaryWorksAtRelations(primaryContactId, relationId);
      }

      const { error } = await contactRelations()
        .update({
          label: merged.label,
          position: merged.position,
          department: merged.department,
          role: merged.role,
          is_primary: merged.is_primary,
          valid_from: merged.valid_from,
          valid_to: merged.valid_to,
          updated_at: merged.updated_at,
        })
        .eq("id", relationId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to update contact relation: ${error.message}`);
      }

      await Promise.all([
        emitEntity("updated", merged.from_contact_id),
        emitEntity("updated", merged.to_contact_id),
      ]);
      return merged;
    },

    async deleteRelation(relationId: string): Promise<ContactRelation | null> {
      const existing = await getRelationById(relationId);
      if (!existing) {
        return null;
      }

      const { error } = await contactRelations()
        .delete()
        .eq("id", relationId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to delete contact relation: ${error.message}`);
      }

      await Promise.all([
        emitEntity("updated", existing.from_contact_id),
        emitEntity("updated", existing.to_contact_id),
      ]);
      return existing;
    },

    async list(): Promise<Contact[]> {
      const { data, error } = await contacts()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });

      if (error) {
        throw new Error(`Failed to list entities: ${error.message}`);
      }
      const items = (data ?? []).map((row) =>
        rowToContact(row as Record<string, unknown>, [])
      );
      return attachRolesToContacts(items) as Promise<Contact[]>;
    },

    async listPaginated(
      params: ContactsQueryParams = {}
    ): Promise<ContactsPaginatedResponse> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
      const sortBy = mapSortBy(params.sortBy);
      const sortOrder = params.sortOrder === "asc";

      if (params.search?.trim()) {
        const result = await this.search(params);
        return {
          data: result.data.map((match) => match.contact),
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        };
      }

      let contactIdsWithRole: string[] | null = null;
      if (params.role) {
        const { data: roleData } = await contactRoles()
          .select("contact_id")
          .eq("role", params.role);
        contactIdsWithRole = (roleData ?? []).map((r) =>
          String((r as { contact_id: string }).contact_id)
        );
        if (contactIdsWithRole.length === 0) {
          return { data: [], total: 0, page, pageSize };
        }
      }

      let query = contacts()
        .select("*", { count: "exact", head: false })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null);

      if (contactIdsWithRole) {
        query = query.in("id", contactIdsWithRole);
      }
      if (params.type) {
        query = query.eq("type", params.type);
      }
      if (params.search?.trim()) {
        const search = `%${params.search.trim()}%`;
        query = query.or(
          [
            `display_name.ilike.${search}`,
            `legal_name.ilike.${search}`,
            `first_name.ilike.${search}`,
            `middle_name.ilike.${search}`,
            `last_name.ilike.${search}`,
            `name_prefix.ilike.${search}`,
            `name_suffix.ilike.${search}`,
            `phonetic_name.ilike.${search}`,
            `birth_name.ilike.${search}`,
            `contact_name.ilike.${search}`,
            `email.ilike.${search}`,
            `billing_email.ilike.${search}`,
            `phone.ilike.${search}`,
            `reference_id.ilike.${search}`,
            `registration_number.ilike.${search}`,
            `vat_id.ilike.${search}`,
            `website_contact.ilike.${search}`,
            `website_impress.ilike.${search}`,
            `address_street.ilike.${search}`,
            `address_city.ilike.${search}`,
          ].join(",")
        );
      }

      const { data, error, count } = await query
        .order(sortBy, { ascending: sortOrder })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) {
        throw new Error(`Failed to list entities: ${error.message}`);
      }
      const items = (data ?? []).map((row) =>
        rowToContact(row as Record<string, unknown>, [])
      );
      const dataWithRoles = await attachRolesToContacts(items);
      return {
        data: dataWithRoles as Contact[],
        total: count ?? 0,
        page,
        pageSize,
      };
    },

    // Thin adapter over the unified `contacts.contact` SearchIndexProvider so
    // existing callers (`/api/contacts/search`, `listPaginated` fallback,
    // tests) keep their `ContactsSearchResponse` shape. The provider is the
    // source of truth — there is no second search code path.
    async search(
      params: ContactsSearchParams = {}
    ): Promise<ContactsSearchResponse> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
      // Map the legacy `"auto"` strategy to "let the provider decide" — the
      // canonical contract is `"hybrid" | "lexical" | "semantic"`. Explicit
      // `"lexical"` is preserved (BM25-only, no embedder call).
      const strategy = params.strategy === "auto" ? undefined : params.strategy;
      const response = await options.searchProvider.search({
        filters: {
          role: params.role,
          scope_id: scopeId,
          tenant_id: tenantId,
          type: params.type,
        },
        limit: pageSize,
        offset: (page - 1) * pageSize,
        ...(params.search?.trim() ? { query: params.search.trim() } : {}),
        ...(strategy ? { strategy } : {}),
      });
      return {
        data: response.results.map(
          (result: SearchResult<ContactSearchMatch>) => result.item
        ),
        page,
        pageSize,
        total: response.total,
      };
    },

    async getById(id: string): Promise<Contact | null> {
      const { data, error } = await contacts()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        return null;
      }
      const roles = await getRolesForContactIds([id]);
      return rowToContact(data as Record<string, unknown>, roles.get(id) ?? []);
    },

    async getByImportId(importId: string): Promise<Contact | null> {
      const { data, error } = await contacts()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("import_id", importId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      const roles = await getRolesForContactIds([(data as { id: string }).id]);
      return rowToContact(
        data as Record<string, unknown>,
        roles.get((data as { id: string }).id) ?? []
      );
    },

    async getByReferenceId(referenceId: string): Promise<Contact | null> {
      const { data, error } = await contacts()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("reference_id", referenceId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      const roles = await getRolesForContactIds([(data as { id: string }).id]);
      return rowToContact(
        data as Record<string, unknown>,
        roles.get((data as { id: string }).id) ?? []
      );
    },

    async update(
      id: string,
      input: ContactUpdateInput
    ): Promise<Contact | null> {
      const existing = await this.getById(id);
      if (!existing) {
        return null;
      }

      const normalized = sanitizePartialPatch(input);
      const namePatch = applyResolvedPersonNameToContactPatch(
        existing,
        normalized as ContactUpdateInput
      );
      const merged: Contact = {
        ...existing,
        ...(namePatch as ContactUpdateInput),
        id: existing.id,
        tenant_id: existing.tenant_id,
        scope_id: existing.scope_id,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
        deleted_at: existing.deleted_at,
      };

      const { error } = await contacts()
        .update({
          type: merged.type,
          display_name: merged.display_name,
          name_prefix: merged.name_prefix,
          first_name: merged.first_name,
          middle_name: merged.middle_name,
          last_name: merged.last_name,
          name_suffix: merged.name_suffix,
          phonetic_name: merged.phonetic_name,
          birth_name: merged.birth_name,
          display_name_override: merged.display_name_override,
          legal_name: merged.legal_name,
          contact_name: merged.contact_name,
          email: merged.email,
          billing_email: merged.billing_email,
          phone: merged.phone,
          vat_id: merged.vat_id,
          tax_id: merged.tax_id,
          registration_number: merged.registration_number,
          court_of_registration: merged.court_of_registration,
          legal_form: merged.legal_form,
          address_street: merged.address_street,
          address_info: merged.address_info,
          address_zip: merged.address_zip,
          address_city: merged.address_city,
          address_country: merged.address_country,
          website_contact: merged.website_contact,
          website_impress: merged.website_impress,
          logo_url: merged.logo_url,
          reference_id: merged.reference_id,
          import_id: merged.import_id ?? null,
          last_imported_at: merged.last_imported_at ?? null,
          notes: merged.notes,
          created_by: merged.created_by,
          updated_at: merged.updated_at,
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to update contact: ${error.message}`);
      }
      await emitEntity("updated", id);
      return merged;
    },

    async delete(id: string): Promise<boolean> {
      const existing = await this.getById(id);
      if (!existing) {
        return false;
      }

      const { error } = await contacts()
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to delete contact: ${error.message}`);
      }
      await emitEntity("deleted", id);
      return true;
    },

    async getSettings(): Promise<ContactSettings> {
      const { data, error } = await settings()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .single();

      if (error || !data) {
        return DEFAULT_CONTACT_SETTINGS;
      }

      const row = data as Record<string, unknown>;
      const parseJsonArray = (raw: unknown, fallback: string[]): string[] => {
        if (typeof raw !== "string") {
          return fallback;
        }
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!Array.isArray(parsed)) {
            return fallback;
          }
          return parsed.filter((e): e is string => typeof e === "string");
        } catch {
          return fallback;
        }
      };

      return {
        id_prefix: String(row.id_prefix ?? DEFAULT_CONTACT_SETTINGS.id_prefix),
        id_offset: Number(row.id_offset ?? DEFAULT_CONTACT_SETTINGS.id_offset),
        id_postfix: String(
          row.id_postfix ?? DEFAULT_CONTACT_SETTINGS.id_postfix
        ),
        salutations: parseJsonArray(
          row.salutations_json,
          DEFAULT_CONTACT_SETTINGS.salutations
        ),
        languages: parseJsonArray(
          row.languages_json,
          DEFAULT_CONTACT_SETTINGS.languages
        ),
        default_language: String(
          row.default_language ?? DEFAULT_CONTACT_SETTINGS.default_language
        ),
      };
    },

    async addContactRole(
      contactId: string,
      role: ContactRole
    ): Promise<boolean> {
      const contact = await this.getById(contactId);
      if (!contact) {
        return false;
      }
      const { error } = await contactRoles().upsert(
        { contact_id: contactId, role },
        { onConflict: "contact_id,role" }
      );
      if (!error) {
        await emitEntity("updated", contactId);
      }
      return !error;
    },

    async removeContactRole(
      contactId: string,
      role: ContactRole
    ): Promise<boolean> {
      const contact = await this.getById(contactId);
      if (!contact) {
        return false;
      }
      const { error } = await contactRoles()
        .delete()
        .eq("contact_id", contactId)
        .eq("role", role);
      if (!error) {
        await emitEntity("updated", contactId);
      }
      return !error;
    },

    async setSettings(input: ContactSettingsInput): Promise<ContactSettings> {
      const settingsRow = {
        tenant_id: tenantId,
        scope_id: scopeId,
        id_prefix: input.id_prefix,
        id_offset: input.id_offset,
        id_postfix: input.id_postfix,
        salutations_json: JSON.stringify(input.salutations),
        languages_json: JSON.stringify(input.languages),
        default_language: input.default_language,
        updated_at: new Date().toISOString(),
      };

      const { error } = await settings()
        .upsert(settingsRow, { onConflict: "tenant_id,scope_id" })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save settings: ${error.message}`);
      }

      return {
        id_prefix: input.id_prefix,
        id_offset: input.id_offset,
        id_postfix: input.id_postfix,
        salutations: input.salutations,
        languages: input.languages,
        default_language: input.default_language,
      };
    },
  };
}
