export const CONTACTS_MANAGER_AGENT_ID = "contacts.manager";
/** Canonical enrich-contact action id (slash `/contacts.enhance-contact` resolves here). */
export const CONTACTS_ENHANCE_ACTION_ID = "contacts.enhance-contact";
/** Slash command sent as the first copilot user message for Enhance Contact. */
export const CONTACTS_ENHANCE_CONTACT_SLASH = "/contacts.enhance-contact";

export interface ContactCopilotEntity {
  address_city?: string | null;
  address_country?: string | null;
  birth_name?: string | null;
  display_name?: string | null;
  display_name_override?: string | null;
  first_name?: string | null;
  id: string;
  last_name?: string | null;
  legal_form?: string | null;
  legal_name?: string | null;
  middle_name?: string | null;
  name_prefix?: string | null;
  name_suffix?: string | null;
  phonetic_name?: string | null;
  registration_number?: string | null;
  tax_id?: string | null;
  type?: string | null;
  vat_id?: string | null;
  website_contact?: string | null;
  website_impress?: string | null;
}

export function buildContactSnapshotForAgentUi(entity: ContactCopilotEntity) {
  return {
    address_city: entity.address_city ?? null,
    address_country: entity.address_country ?? null,
    birth_name: entity.birth_name ?? null,
    display_name: entity.display_name ?? null,
    display_name_override: entity.display_name_override ?? null,
    first_name: entity.first_name ?? null,
    id: entity.id,
    last_name: entity.last_name ?? null,
    middle_name: entity.middle_name ?? null,
    name_prefix: entity.name_prefix ?? null,
    name_suffix: entity.name_suffix ?? null,
    phonetic_name: entity.phonetic_name ?? null,
    legal_form: entity.legal_form ?? null,
    legal_name: entity.legal_name ?? null,
    registration_number: entity.registration_number ?? null,
    tax_id: entity.tax_id ?? null,
    type: entity.type ?? null,
    vat_id: entity.vat_id ?? null,
    website_contact: entity.website_contact ?? null,
    website_impress: entity.website_impress ?? null,
  };
}

/** Copilot shell routing scope — preloads live in Agent UI state slices. */
function buildContactRoutingScope(entity: ContactCopilotEntity) {
  return {
    currentModule: "contacts",
    entityId: entity.id,
    entity_title:
      entity.display_name?.trim() || entity.legal_name?.trim() || "Contact",
  };
}

/**
 * Orchestrator `context` for `POST …/actions/contacts.enhance-contact/run`.
 * Action runs still receive contact_snapshot on the envelope (not copilot scope).
 */
export function buildEnhanceContactActionRunContext(
  entity: ContactCopilotEntity
): Record<string, unknown> {
  return {
    ...buildContactRoutingScope(entity),
    contact_snapshot: buildContactSnapshotForAgentUi(entity),
  };
}

export function buildContactDetailCopilotContext(entity: ContactCopilotEntity) {
  return {
    moduleId: "contacts",
    routeKey: "chat",
    scope: buildContactRoutingScope(entity),
  };
}
