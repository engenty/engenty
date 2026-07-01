/**
 * Schema barrel: types and zod schemas for contacts.
 * Single source of truth for backend, UI, and AI.
 */

export type {
  ContactRelationCreateInput,
  ContactRelationListItem as ContactRelationListItemRecord,
  ContactRelationRecord,
  ContactRelationUpdateInput,
} from "./contact-relations.js";
export {
  contactRelationCreateInputSchema,
  contactRelationIdParamsSchema,
  contactRelationListItemSchema,
  contactRelationRecordSchema,
  contactRelationsListQuerySchema,
  contactRelationTypeSchema,
  contactRelationUpdateSchema,
  getPrimaryContactIdForRelation,
  isCurrentContactRelation,
  normalizeContactRelationParticipants,
  validateContactRelationParticipants,
} from "./contact-relations.js";
export type {
  Contact,
  ContactInput,
  ContactListItem,
  ContactRelation,
  ContactRelationInput,
  ContactRelationListItem,
  ContactRelationUpdate,
  ContactRole,
  ContactSearchMatch,
  ContactSearchSourceScores,
  ContactSearchStrategy,
  ContactSettings,
  ContactSettingsInput,
  ContactsQueryParams,
  ContactsSearchParams,
  ContactsSearchResponse,
  ContactsSortColumn,
  ContactType,
  ContactUpdateInput as ContactUpdateInputStrict,
} from "./types.js";
export type {
  ContactCreateInput,
  ContactRecord,
  ContactsListQueryParams,
  ContactsPaginatedResponse,
  ContactsSearchQueryParams,
  ContactUpdateInput,
} from "./zod.js";
export {
  addContactRoleBodySchema,
  contactCreateInputSchema,
  contactIdParamsSchema,
  contactIdRoleParamsSchema,
  contactInputSchema,
  contactKindSchema,
  contactRecordSchema,
  contactRoleSchema,
  contactSearchMatchSchema,
  contactSearchSourceScoresSchema,
  contactSearchStrategySchema,
  contactSettingsInputSchema,
  contactSettingsSchema,
  contactsByImportIdQuerySchema,
  contactsByReferenceIdQuerySchema,
  contactsListQuerySchema,
  contactsPaginatedResponseSchema,
  contactsSearchQuerySchema,
  contactsSearchResponseSchema,
  contactUpdateSchema,
  deleteContactResponseSchema,
  notFoundSchema,
} from "./zod.js";
