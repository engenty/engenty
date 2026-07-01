/**
 * Module repository interfaces. Supabase adapters implement these.
 *
 * @see docs/content/dev/backend/dal.md
 *
 * Search/index/embedding access flows through the
 * `contacts.contact` SearchIndexProvider (see
 * `contacts-search-index-provider.ts` + `engenty.server.registerSearchIndexProvider`)
 * — no embedding/status/backfill methods live on this repo. The thin `search`
 * adapter below is here only because the legacy `/api/contacts/search` route
 * and the `listPaginated` fallback still expect the `ContactsSearchResponse`
 * shape; both delegate to the provider under the hood.
 */
import type {
  Contact,
  ContactInput,
  ContactRelation,
  ContactRelationInput,
  ContactRelationListItem,
  ContactRelationUpdate,
  ContactRole,
  ContactSettings,
  ContactSettingsInput,
  ContactsPaginatedResponse,
  ContactsQueryParams,
  ContactsSearchParams,
  ContactsSearchResponse,
  ContactUpdateInput,
} from "../schema/types.js";

export interface ScopeContext {
  scopeId: string;
  tenantId: string;
}

export interface ContactRepo {
  addContactRole(contactId: string, role: ContactRole): Promise<boolean>;
  create(input: ContactInput): Promise<Contact>;
  createRelation(input: ContactRelationInput): Promise<ContactRelation>;
  delete(id: string): Promise<boolean>;
  deleteRelation(relationId: string): Promise<ContactRelation | null>;
  getById(id: string): Promise<Contact | null>;
  getByImportId(importId: string): Promise<Contact | null>;
  getByReferenceId(referenceId: string): Promise<Contact | null>;
  getSettings(): Promise<ContactSettings>;
  list(): Promise<Contact[]>;
  listPaginated(
    params?: ContactsQueryParams
  ): Promise<ContactsPaginatedResponse>;
  listRelationsForContact(
    contactId: string,
    options?: { includeInactive?: boolean }
  ): Promise<ContactRelationListItem[]>;
  removeContactRole(contactId: string, role: ContactRole): Promise<boolean>;
  search(params: ContactsSearchParams): Promise<ContactsSearchResponse>;
  setSettings(input: ContactSettingsInput): Promise<ContactSettings>;
  update(id: string, input: ContactUpdateInput): Promise<Contact | null>;
  updateRelation(
    relationId: string,
    input: ContactRelationUpdate
  ): Promise<ContactRelation | null>;
}
