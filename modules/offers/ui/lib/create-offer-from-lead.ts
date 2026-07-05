import { getCommercialSettings } from "@engenty/commercial-settings/ui";
import {
  createOffer,
  getNextOfferNumber,
  getOfferSettings,
  getOfferTemplates,
  type OfferListItem,
} from "../api.js";
import { getContactsPluginApi } from "../plugins.js";
import { formatContactSnapshot } from "./contact-snapshot.js";
import { buildOfferCreatePayload } from "./create-offer-payload.js";

export interface CreateOfferFromLeadInput {
  /** Contact id to link as the offer client (resolves the recipient snapshot). */
  clientId: string | null;
  /** Seeds the offer introduction (e.g. lead briefing / ideation). */
  introduction?: string | null;
  /** Source lead id, stored on the created offer for the handoff linkage. */
  leadId: string;
  title: string;
}

/**
 * Imperative offer-creation entry point for the lead→offer handoff. Mirrors the
 * offers list create flow but fetches its inputs directly (no React Query), so
 * it can run from another module's UI via the offers plugin API.
 */
export async function createOfferFromLead(
  input: CreateOfferFromLeadInput
): Promise<OfferListItem> {
  const [settings, templates, commercialSettings, nextNumber] =
    await Promise.all([
      getOfferSettings(),
      getOfferTemplates(),
      getCommercialSettings().catch(() => null),
      getNextOfferNumber(),
    ]);

  let recipient = {
    recipient_name: null as string | null,
    recipient_address: null as string | null,
    recipient_email: null as string | null,
  };

  const contactsApi = getContactsPluginApi();
  if (input.clientId && contactsApi) {
    try {
      const contact = await contactsApi.getContact(input.clientId);
      const snapshot = formatContactSnapshot(contact);
      recipient = {
        recipient_name: snapshot.recipient_name || null,
        recipient_address: snapshot.recipient_address || null,
        recipient_email: snapshot.recipient_email || null,
      };
    } catch {
      // Keep empty recipient fields if the snapshot lookup fails.
    }
  }

  const payload = buildOfferCreatePayload({
    clientId: input.clientId,
    commercialSettings,
    introduction: input.introduction ?? null,
    leadId: input.leadId,
    offerNumber: nextNumber.offer_number,
    recipient,
    settings,
    templates,
    title: input.title,
  });

  return await createOffer(payload);
}
