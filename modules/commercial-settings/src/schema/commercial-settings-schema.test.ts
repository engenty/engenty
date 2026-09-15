import { describe, expect, it } from "vitest";
import { commercialSettingsSchema } from "./zod.js";

describe("commercialSettingsSchema tax_rates", () => {
  it("rejects duplicate name abbreviations case-insensitively", () => {
    const r = commercialSettingsSchema.safeParse({
      tax_rates: [
        { name: "MwSt", label: "A", value: 19 },
        { name: "mwst", label: "B", value: 7 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than one is_default", () => {
    const r = commercialSettingsSchema.safeParse({
      tax_rates: [
        { name: "a", label: "A", value: 10, is_default: true },
        { name: "b", label: "B", value: 20, is_default: true },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("accepts valid tax_rates", () => {
    const r = commercialSettingsSchema.safeParse({
      tax_rates: [
        { name: "MwSt", label: "Normal", value: 19, is_default: true },
        { name: "MwSt_erm", label: "Ermäßigt", value: 7 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts expense categories with EKR class and account", () => {
    const r = commercialSettingsSchema.safeParse({
      expense_categories: [
        {
          account_class: "7",
          account_number: "7340",
          code: "reise",
          default_deduction_rate: 1,
          is_tax_deductible: true,
          name: "Reisekosten",
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-digit Kontoklasse", () => {
    const r = commercialSettingsSchema.safeParse({
      expense_categories: [
        {
          account_class: "70",
          code: "reise",
          default_deduction_rate: 1,
          is_tax_deductible: true,
          name: "Reisekosten",
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});
