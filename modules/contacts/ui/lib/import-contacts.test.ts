import { describe, expect, it } from "vitest";
import {
  mapImportRowToContactCreateInput,
  mapImportRowToContactUpdatePatch,
  parseImportContactType,
  parseImportContactTypeForPatch,
} from "./import-contacts.js";

describe("parseImportContactType", () => {
  it("defaults to organisation", () => {
    expect(parseImportContactType(undefined)).toBe("organisation");
    expect(parseImportContactType("")).toBe("organisation");
    expect(parseImportContactType("unknown")).toBe("organisation");
  });

  it("recognizes person synonyms", () => {
    expect(parseImportContactType("person")).toBe("person");
    expect(parseImportContactType("Individual")).toBe("person");
    expect(parseImportContactType("CONTACT")).toBe("person");
  });
});

describe("parseImportContactTypeForPatch", () => {
  it("returns undefined when empty or invalid", () => {
    expect(parseImportContactTypeForPatch(undefined)).toBeUndefined();
    expect(parseImportContactTypeForPatch("")).toBeUndefined();
    expect(parseImportContactTypeForPatch("nope")).toBeUndefined();
  });

  it("returns organisation for explicit org synonyms", () => {
    expect(parseImportContactTypeForPatch("company")).toBe("organisation");
    expect(parseImportContactTypeForPatch("Organization")).toBe("organisation");
  });
});

describe("mapImportRowToContactCreateInput", () => {
  it("maps row values to entity input", () => {
    const input = mapImportRowToContactCreateInput({
      display_name: "Acme GmbH",
      contact_name: "Jane Doe",
      email: "jane@acme.com",
      phone: "",
    });
    expect(input.type).toBe("organisation");
    expect(input.display_name).toBe("Acme GmbH");
    expect(input.contact_name).toBe("Jane Doe");
    expect(input.email).toBe("jane@acme.com");
    expect(input.phone).toBeNull();
    expect(input.roles).toEqual(["client"]);
  });

  it("maps type and extra API fields", () => {
    const input = mapImportRowToContactCreateInput({
      type: "person",
      display_name: "Jane Doe",
      court_of_registration: "HG Wien",
      legal_form: "",
      website_impress: "https://example.com/impressum",
      logo_url: "https://example.com/logo.png",
      address_info: "Stiege 2",
    });
    expect(input.type).toBe("person");
    expect(input.court_of_registration).toBe("HG Wien");
    expect(input.legal_form).toBeNull();
    expect(input.website_impress).toBe("https://example.com/impressum");
    expect(input.logo_url).toBe("https://example.com/logo.png");
    expect(input.address_info).toBe("Stiege 2");
  });
});

describe("mapImportRowToContactUpdatePatch", () => {
  it("only includes fields with values; never overwrites with empty", () => {
    const patch = mapImportRowToContactUpdatePatch(
      {
        display_name: "Acme GmbH",
        email: "updated@acme.com",
        phone: "",
        legal_name: "",
      },
      "ext-123",
      "2025-03-05T12:00:00Z"
    );
    expect(patch.last_imported_at).toBe("2025-03-05T12:00:00Z");
    expect(patch.import_id).toBe("ext-123");
    expect(patch.display_name).toBe("Acme GmbH");
    expect(patch.email).toBe("updated@acme.com");
    expect("phone" in patch).toBe(false);
    expect("legal_name" in patch).toBe(false);
  });

  it("patches type and court_of_registration when present", () => {
    const patch = mapImportRowToContactUpdatePatch(
      {
        type: "person",
        court_of_registration: "Firmenbuch XYZ",
      },
      null,
      "2025-03-05T12:00:00Z"
    );
    expect(patch.type).toBe("person");
    expect(patch.court_of_registration).toBe("Firmenbuch XYZ");
  });
});
