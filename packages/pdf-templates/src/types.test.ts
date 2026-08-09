import { describe, expect, it } from "vitest";
import { createDefaultPdfTemplateSettings } from "./defaults.js";
import {
  pdfTemplateInputSchema,
  pdfTemplateUpdateInputSchema,
} from "./types.js";

describe("pdfTemplateUpdateInputSchema", () => {
  it("leaves absent markup fields undefined instead of defaulting to null", () => {
    // Regression: with .default(null) on the input schema, zod applies the
    // default even through .partial(), so a name-only PATCH would silently
    // reset custom markup to NULL (= provider default).
    const parsed = pdfTemplateUpdateInputSchema.parse({ name: "Renamed" });
    expect("document_template" in parsed).toBe(false);
    expect("stylesheet_template" in parsed).toBe(false);
  });

  it("accepts explicit null to reset markup to the provider default", () => {
    const parsed = pdfTemplateUpdateInputSchema.parse({
      document_template: null,
    });
    expect(parsed.document_template).toBeNull();
  });
});

describe("pdfTemplateInputSchema", () => {
  it("accepts null markup on create", () => {
    const parsed = pdfTemplateInputSchema.parse({
      module_key: "offers",
      name: "Default",
      document_template: null,
      stylesheet_template: null,
      settings_json: createDefaultPdfTemplateSettings(),
    });
    expect(parsed.document_template).toBeNull();
  });
});

describe("pdfTemplateUpdateInputSchema", () => {
  it("does not invent fields the caller left out", () => {
    // `.partial()` does NOT strip zod defaults. A name-only patch used to parse
    // to `{name, is_default: false, schema_version: 1}`, and updateTemplate's
    // `!== undefined` guards then wrote both — so renaming a template silently
    // cleared its default flag.
    expect(pdfTemplateUpdateInputSchema.parse({ name: "Renamed" })).toEqual({
      name: "Renamed",
    });
  });

  it("still accepts the fields when they are given", () => {
    expect(
      pdfTemplateUpdateInputSchema.parse({
        is_default: true,
        schema_version: 2,
      })
    ).toEqual({ is_default: true, schema_version: 2 });
  });
});
