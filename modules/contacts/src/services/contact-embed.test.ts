import { describe, expect, it } from "vitest";
import type { Contact } from "../schema/types.js";
import { buildContactSearchDocument } from "./contact-embed.js";

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact-1",
    tenant_id: "tenant-1",
    scope_id: "default",
    type: "organisation",
    display_name: "Muster Kanzlei",
    legal_name: "Muster Kanzlei GmbH",
    contact_name: "",
    email: "office@example.test",
    billing_email: null,
    phone: null,
    address_street: "Hauptstrasse 1",
    address_zip: "1010",
    address_city: "Wien",
    address_country: "AT",
    address_info: null,
    vat_id: null,
    tax_id: null,
    registration_number: null,
    court_of_registration: null,
    legal_form: "GmbH",
    website_contact: null,
    website_impress: null,
    logo_url: null,
    reference_id: null,
    import_id: null,
    last_imported_at: null,
    notes: "Anwälte für Vertragsrecht",
    created_by: null,
    roles: ["lawyer"],
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("buildContactSearchDocument", () => {
  it("builds one canonical document from structured contact fields", () => {
    const document = buildContactSearchDocument({
      contact: contact(),
      relationTexts: ["works_at Partner Vertragsrecht"],
    });

    expect(document).toContain("Display name: Muster Kanzlei");
    expect(document).toContain("Roles: lawyer");
    expect(document).toContain("Address: Hauptstrasse 1, 1010, Wien, AT");
    expect(document).toContain("Relation: works_at Partner Vertragsrecht");
  });
});
