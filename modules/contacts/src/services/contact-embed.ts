import type { Contact } from "../schema/types.js";

// Per-document embedding is owned by the central retrieval service via the
// `contacts.contact` source (see `dal/contacts-retrieval-source.ts`), on the
// platform `embedding` role. This module only owns the canonical
// document-text builder, which is shared by the source's buildDocument and
// any future backfill / inspection tooling.

function addLine(lines: string[], label: string, value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    lines.push(`${label}: ${value.trim()}`);
  }
}

export function buildContactSearchDocument(params: {
  contact: Contact;
  relationTexts?: string[];
}): string {
  const { contact, relationTexts = [] } = params;
  const lines: string[] = [];
  addLine(lines, "Contact type", contact.type);
  addLine(lines, "Display name", contact.display_name);
  if (contact.type === "person") {
    addLine(lines, "Name prefix", contact.name_prefix);
    addLine(lines, "First name", contact.first_name);
    addLine(lines, "Middle name", contact.middle_name);
    addLine(lines, "Last name", contact.last_name);
    addLine(lines, "Name suffix", contact.name_suffix);
    addLine(lines, "Phonetic name", contact.phonetic_name);
    addLine(lines, "Birth name", contact.birth_name);
  }
  addLine(lines, "Legal name", contact.legal_name);
  addLine(lines, "Contact name", contact.contact_name);
  addLine(lines, "Email", contact.email);
  addLine(lines, "Billing email", contact.billing_email);
  addLine(lines, "Phone", contact.phone);
  addLine(lines, "Roles", contact.roles.join(", "));
  addLine(lines, "Reference ID", contact.reference_id);
  addLine(lines, "VAT ID", contact.vat_id);
  addLine(lines, "Tax ID", contact.tax_id);
  addLine(lines, "Registration number", contact.registration_number);
  addLine(lines, "Court of registration", contact.court_of_registration);
  addLine(lines, "Legal form", contact.legal_form);
  addLine(
    lines,
    "Address",
    [
      contact.address_street,
      contact.address_zip,
      contact.address_city,
      contact.address_country,
      contact.address_info,
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(", ")
  );
  addLine(lines, "Website", contact.website_contact);
  addLine(lines, "Impressum", contact.website_impress);
  addLine(lines, "Notes", contact.notes);
  for (const relationText of relationTexts) {
    addLine(lines, "Relation", relationText);
  }
  return lines.join("\n").trim();
}
