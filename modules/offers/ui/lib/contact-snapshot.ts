import type { ContactListItem } from "@engenty/contacts/ui";

export interface ContactSnapshot {
  recipient_address: string;
  recipient_email: string;
  recipient_name: string;
}

/** Minimal contact shape shared by list queries and settings entity options. */
export interface ContactAddressFields {
  address_city?: string | null;
  address_country?: string | null;
  address_info?: string | null;
  address_street?: string | null;
  address_zip?: string | null;
  display_name?: string | null;
  email?: string | null;
}

function buildRecipientAddress(contact: ContactAddressFields): string {
  const addressParts: string[] = [];
  const street = [contact.address_street, contact.address_info]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n");
  if (street) {
    addressParts.push(street);
  }
  const location = [
    contact.address_zip,
    contact.address_city,
    contact.address_country,
  ]
    .filter(Boolean)
    .join(", ");
  if (location) {
    addressParts.push(location);
  }
  return addressParts.join("\n");
}

export function formatContactSnapshot(
  contact: ContactListItem
): ContactSnapshot {
  return {
    recipient_name: contact.display_name ?? "",
    recipient_address: buildRecipientAddress(contact),
    recipient_email: contact.email ?? "",
  };
}

/** Snapshot fields from a list/entity row (same address rules as settings). */
export function formatEntityRecipientSnapshot(
  contact: ContactAddressFields
): ContactSnapshot {
  return {
    recipient_name: contact.display_name?.trim() ?? "",
    recipient_address: buildRecipientAddress(contact),
    recipient_email: contact.email?.trim() ?? "",
  };
}
