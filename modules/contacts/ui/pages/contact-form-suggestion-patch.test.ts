import { describe, expect, it } from "vitest";
import { emptyForm } from "./contact-form.js";
import { applySuggestionPatchToContactFormValues } from "./contact-form-suggestion-patch.js";

describe("applySuggestionPatchToContactFormValues", () => {
  it("applies field updates and role toggles", () => {
    const nextValues = applySuggestionPatchToContactFormValues(
      {
        ...emptyForm,
        display_name: "Acme",
        roles: ["supplier"],
      },
      {
        legal_name: "Acme GmbH",
        website_impress: "https://acme.test/impressum",
        add_role_partner: "true",
        remove_role_supplier: "1",
      }
    );

    expect(nextValues.legal_name).toBe("Acme GmbH");
    expect(nextValues.website_impress).toBe("https://acme.test/impressum");
    expect(nextValues.roles).toEqual(["partner"]);
  });

  it("ignores unknown patch keys", () => {
    const nextValues = applySuggestionPatchToContactFormValues(emptyForm, {
      unknown_field: "ignored",
    });

    expect(nextValues).toEqual(emptyForm);
  });
});
