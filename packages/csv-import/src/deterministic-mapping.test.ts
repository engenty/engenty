import { describe, expect, it } from "vitest";
import { applyDeterministicMapping } from "./deterministic-mapping.js";

const SAMPLE_FIELDS = [
  {
    key: "company_name",
    label: "Company Name",
    type: "text" as const,
    required: true,
    description: "",
  },
  {
    key: "contact_name",
    label: "Contact Name",
    type: "text" as const,
    required: true,
    description: "",
  },
  {
    key: "email",
    label: "Email",
    type: "email" as const,
    required: true,
    description: "",
  },
  {
    key: "phone",
    label: "Phone",
    type: "phone" as const,
    required: false,
    description: "",
  },
  {
    key: "address_zip",
    label: "ZIP",
    type: "text" as const,
    required: false,
    description: "",
  },
  {
    key: "address_city",
    label: "City",
    type: "text" as const,
    required: false,
    description: "",
  },
  {
    key: "address_country",
    label: "Country",
    type: "text" as const,
    required: false,
    description: "",
  },
];

describe("applyDeterministicMapping", () => {
  it("maps common column names to required fields", () => {
    const headers = ["Company Name", "Contact Name", "Email", "Phone"];
    const mappings = applyDeterministicMapping(headers, SAMPLE_FIELDS);
    expect(mappings.length).toBeGreaterThanOrEqual(3);
    expect(mappings.find((m) => m.fieldKey === "company_name")?.csvColumn).toBe(
      "Company Name"
    );
    expect(mappings.find((m) => m.fieldKey === "phone")?.csvColumn).toBe(
      "Phone"
    );
  });

  it("maps German-style headers (PLZ, Stadt, Land)", () => {
    const headers = ["Firma", "E-Mail", "PLZ", "Stadt", "Land"];
    const mappings = applyDeterministicMapping(headers, SAMPLE_FIELDS);
    expect(mappings.find((m) => m.fieldKey === "company_name")?.csvColumn).toBe(
      "Firma"
    );
    expect(mappings.find((m) => m.fieldKey === "address_zip")?.csvColumn).toBe(
      "PLZ"
    );
    expect(mappings.find((m) => m.fieldKey === "address_city")?.csvColumn).toBe(
      "Stadt"
    );
    expect(
      mappings.find((m) => m.fieldKey === "address_country")?.csvColumn
    ).toBe("Land");
  });

  it("maps German contact sheet headers (Vorname, Nachname, Unternehmen, Adresse)", () => {
    const fields = [
      {
        key: "first_name",
        label: "First name",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "last_name",
        label: "Last name",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "display_name",
        label: "Display name",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "address_street",
        label: "Street Address",
        type: "text" as const,
        required: false,
        description: "",
      },
    ];
    const headers = [
      "Vorname",
      "Nachname",
      "Unternehmen",
      "Kontakt",
      "Adresse",
    ];
    const mappings = applyDeterministicMapping(headers, fields);
    expect(mappings.find((m) => m.fieldKey === "first_name")?.csvColumn).toBe(
      "Vorname"
    );
    expect(mappings.find((m) => m.fieldKey === "last_name")?.csvColumn).toBe(
      "Nachname"
    );
    expect(mappings.find((m) => m.fieldKey === "display_name")?.csvColumn).toBe(
      "Unternehmen"
    );
    expect(
      mappings.find((m) => m.fieldKey === "address_street")?.csvColumn
    ).toBe("Adresse");
  });

  it("returns empty when headers do not match", () => {
    const headers = ["x", "y", "z"];
    const mappings = applyDeterministicMapping(headers, SAMPLE_FIELDS);
    expect(mappings).toHaveLength(0);
  });

  it("maps exact snake_case headers", () => {
    const headers = ["company_name", "contact_name", "email"];
    const mappings = applyDeterministicMapping(headers, SAMPLE_FIELDS);
    expect(
      mappings.find((m) => m.fieldKey === "company_name")?.csvColumnIndex
    ).toBe(0);
    expect(mappings.find((m) => m.fieldKey === "email")?.csvColumnIndex).toBe(
      2
    );
  });

  it("maps team taxonomy headers (Rolle, Standort)", () => {
    const fields = [
      {
        key: "role_term",
        label: "Role",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "location_term",
        label: "Location term",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "full_name",
        label: "Full name",
        type: "text" as const,
        required: true,
        description: "",
      },
    ];
    const headers = ["Name", "Rolle", "Standort"];
    const mappings = applyDeterministicMapping(headers, fields);
    expect(mappings.find((m) => m.fieldKey === "role_term")?.csvColumn).toBe(
      "Rolle"
    );
    expect(
      mappings.find((m) => m.fieldKey === "location_term")?.csvColumn
    ).toBe("Standort");
    expect(mappings.find((m) => m.fieldKey === "full_name")?.csvColumn).toBe(
      "Name"
    );
  });

  it("maps structured name columns to distinct fields without duplicating First Name", () => {
    const fields = [
      {
        key: "name_prefix",
        label: "Title (prefix)",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "first_name",
        label: "First name",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "middle_name",
        label: "Middle name",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "last_name",
        label: "Last name",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "name_suffix",
        label: "Title (suffix)",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "phonetic_name",
        label: "Phonetic name",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "birth_name",
        label: "Birth name",
        type: "text" as const,
        required: false,
        description: "",
      },
      {
        key: "full_name",
        label: "Full name",
        type: "text" as const,
        required: false,
        description: "",
      },
    ];
    const headers = [
      "First Name",
      "Middle Name",
      "Last Name",
      "Title",
      "Suffix",
      "Phonetic Name",
      "Birth Name",
      "Full Name",
    ];
    const mappings = applyDeterministicMapping(headers, fields);

    expect(mappings.find((m) => m.fieldKey === "first_name")?.csvColumn).toBe(
      "First Name"
    );
    expect(mappings.find((m) => m.fieldKey === "middle_name")?.csvColumn).toBe(
      "Middle Name"
    );
    expect(mappings.find((m) => m.fieldKey === "last_name")?.csvColumn).toBe(
      "Last Name"
    );
    expect(mappings.find((m) => m.fieldKey === "full_name")?.csvColumn).toBe(
      "Full Name"
    );

    const mappedColumns = new Set(mappings.map((m) => m.csvColumnIndex));
    expect(mappedColumns.size).toBe(mappings.length);
    expect(mappings.filter((m) => m.csvColumn === "First Name").length).toBe(1);
  });
});
