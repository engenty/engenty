import type { InvoiceListItem } from "../api.js";

/**
 * Shape consumed by the shared `RecipientSettingsCard` (`@engenty/commercial-editor`).
 * Mirrors its `ClientDetails` interface (snake_case display fields).
 */
export interface RecipientClientDetails {
  address_city: string | null;
  address_country: string | null;
  address_street: string | null;
  address_zip: string | null;
  company_name?: string;
  contact_name: string | null;
  display_name?: string;
  email: string | null;
  vat_id: string | null;
}

type Snapshot = NonNullable<InvoiceListItem["recipientSnapshot"]>;

/** Treat empty strings and "—" placeholders (emitted by the snapshot resolver
 *  for unknown fields) as absent so they don't render as noise. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "—" ? trimmed : null;
}

/** Map the backend-resolved recipient snapshot to the recipient-card shape. */
export function recipientDetailsFromSnapshot(
  snapshot: Snapshot | undefined,
  displayNameOverride?: string
): RecipientClientDetails {
  if (!snapshot) {
    return {
      display_name: displayNameOverride,
      company_name: undefined,
      contact_name: null,
      address_street: null,
      address_zip: null,
      address_city: null,
      address_country: null,
      email: null,
      vat_id: null,
    };
  }
  return {
    display_name:
      displayNameOverride ?? clean(snapshot.displayName) ?? undefined,
    company_name: clean(snapshot.legalName) ?? undefined,
    contact_name:
      snapshot.kind === "individual" ? clean(snapshot.displayName) : null,
    address_street: clean(snapshot.address?.street),
    address_zip: clean(snapshot.address?.postalCode),
    address_city: clean(snapshot.address?.city),
    address_country: clean(snapshot.address?.country),
    email: clean(snapshot.email),
    vat_id: clean(snapshot.vatId),
  };
}

/** Best-effort display name for the header topline. */
export function invoiceRecipientName(
  invoice: InvoiceListItem,
  entityDisplayName?: string
): string | undefined {
  return entityDisplayName ?? invoice.recipientSnapshot?.displayName;
}
