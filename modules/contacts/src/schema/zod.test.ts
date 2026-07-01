import { describe, expect, it } from "vitest";
import { contactRelationUpdateSchema } from "./contact-relations.js";
import {
  contactCreateInputSchema,
  contactsListQuerySchema,
  contactsSearchQuerySchema,
} from "./zod.js";

describe("contactCreateInputSchema", () => {
  it("accepts create payloads with optional slug roles", () => {
    const withRoles = contactCreateInputSchema.safeParse({
      display_name: "Acme Corp",
      type: "organisation",
      roles: ["client", "partner"],
    });
    const withoutRoles = contactCreateInputSchema.safeParse({
      display_name: "John Doe",
      type: "person",
    });

    expect(withRoles.success).toBe(true);
    if (withRoles.success) {
      expect(withRoles.data.roles).toEqual(["client", "partner"]);
    }
    expect(withoutRoles.success).toBe(true);
    if (withoutRoles.success) {
      expect(withoutRoles.data.roles).toBeUndefined();
    }
  });

  it("rejects non-slug role values", () => {
    const result = contactCreateInputSchema.safeParse({
      display_name: "Acme",
      type: "organisation",
      roles: ["Invalid Role!"],
    });
    expect(result.success).toBe(false);
  });

  it("normalizes VAT ID and rejects invalid format", () => {
    const ok = contactCreateInputSchema.safeParse({
      display_name: "Acme",
      type: "organisation",
      vat_id: "ATU 82193323",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.vat_id).toBe("ATU82193323");
    }

    const bad = contactCreateInputSchema.safeParse({
      display_name: "Acme",
      type: "organisation",
      vat_id: "INVALID123",
    });
    expect(bad.success).toBe(false);
  });

  it("accepts contact_name as null (LLM/test-data often emits null)", () => {
    const result = contactCreateInputSchema.safeParse({
      display_name: "Acme",
      type: "organisation",
      contact_name: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contact_name).toBeNull();
    }
  });
});

describe("contact relation schemas", () => {
  it("rejects a relation update with an inverted date range", () => {
    const result = contactRelationUpdateSchema.safeParse({
      valid_from: "2026-04-10",
      valid_to: "2026-04-09",
    });

    expect(result.success).toBe(false);
  });
});

describe("contacts list query schema", () => {
  it("defaults include_linked_invoice_counts and coerces false", () => {
    expect(
      contactsListQuerySchema.parse({}).include_linked_invoice_counts
    ).toBe(true);
    expect(
      contactsListQuerySchema.parse({ include_linked_invoice_counts: false })
        .include_linked_invoice_counts
    ).toBe(false);
    expect(
      contactsListQuerySchema.parse({ include_linked_invoice_counts: "false" })
        .include_linked_invoice_counts
    ).toBe(false);
  });
});

describe("contacts search query schema", () => {
  it("parses search strategy and keeps count defaults", () => {
    const result = contactsSearchQuerySchema.parse({
      search: "Anwälte",
      strategy: "hybrid",
    });

    expect(result.strategy).toBe("hybrid");
    expect(result.include_linked_invoice_counts).toBe(true);
  });
});
