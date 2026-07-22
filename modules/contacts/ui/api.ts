/**
 * Contacts UI API - re-exports from split modules.
 */
export type {
  ContactCreateInput,
  ContactListItem,
  ContactRelation,
  ContactRelationCreateInput,
  ContactRelationListItem,
  ContactRelationUpdateInput,
  ContactRole,
  ContactsPaginatedResponse,
  ContactsQueryParams,
  ContactsSearchParams,
  ContactsSearchResponse,
  ContactUpdateInput,
} from "./api/contacts.js";
export {
  addContactRole,
  createContact,
  createContactRelation,
  deleteContact,
  deleteContactRelation,
  findContactByImportId,
  findContactByReferenceId,
  getContact,
  getContactRelations,
  getContacts,
  removeContactRole,
  searchContacts,
  updateContact,
  updateContactRelation,
} from "./api/contacts.js";
export {
  cleanupContactsImportCsv,
  getContactsImportPresets,
  saveContactsImportPreset,
  suggestContactsImportMappings,
} from "./api/import.js";
export type {
  ContactsRole,
  ContactsRoleMenuConfig,
  ContactsRoleMenuItem,
  FixedContactsRole,
} from "./api/role-menu-settings.js";
export {
  defaultRoleMenu,
  FIXED_CONTACT_ROLES,
  getContactsRoleMenuConfig,
  getRolePluralLabel,
  getRoleTitleLabel,
  isFixedRole,
  normalizeRoleSlug,
  setContactsRoleMenuConfig,
} from "./api/role-menu-settings.js";
export type { ContactSettings } from "./api/settings.js";
export {
  getContactSettings,
  getNextReferenceId,
  setContactSettings,
} from "./api/settings.js";
