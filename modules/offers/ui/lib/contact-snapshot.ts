import type { ContactListItem } from "@engenty/contacts/ui";

export interface ContactSnapshot {
  recipient_address: string;
  recipient_email: string;
  recipient_name: string;
}

export function formatContactSnapshot(
  contact: ContactListItem
): ContactSnapshot {
  const addressParts: string[] = [];
  if (contact.address_street?.trim()) {
    addressParts.push(contact.address_street.trim());
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
  return {
    recipient_name: contact.display_name ?? "",
    recipient_address: addressParts.join("\n"),
    recipient_email: contact.email ?? "",
  };
}
