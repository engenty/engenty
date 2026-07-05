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
});
