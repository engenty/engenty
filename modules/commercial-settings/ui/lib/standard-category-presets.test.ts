import { describe, expect, it } from "vitest";
import {
  mergeStandardCategoriesForRegion,
  STANDARD_CATEGORY_PRESETS,
} from "./standard-category-presets.js";

describe("standard-category-presets", () => {
  it("has AT presets with expected categories", () => {
    const at = STANDARD_CATEGORY_PRESETS.AT;
    expect(at.length).toBeGreaterThanOrEqual(15);
    const codes = at.map((c) => c.code);
    expect(codes).toContain("reise");
    expect(codes).toContain("bewirtung");
    expect(codes).toContain("buero");
    expect(codes).toContain("kfz");
    expect(codes).toContain("sonstige");
  });

  it("AT Bewirtung has 50% deduction rate", () => {
    const bewirtung = STANDARD_CATEGORY_PRESETS.AT.find(
      (c) => c.code === "bewirtung"
    );
    expect(bewirtung).toBeDefined();
    expect(bewirtung!.default_deduction_rate).toBe(0.5);
    expect(bewirtung!.is_tax_deductible).toBe(true);
  });

  it("DE Bewirtung has 70% deduction rate", () => {
    const bewirtung = STANDARD_CATEGORY_PRESETS.DE.find(
      (c) => c.code === "bewirtung"
    );
    expect(bewirtung).toBeDefined();
    expect(bewirtung!.default_deduction_rate).toBe(0.7);
  });

  it("merges presets without duplicates", () => {
    const existing = [
      {
        code: "reise",
        name: "Custom Travel",
        is_tax_deductible: true,
        default_deduction_rate: 1,
        llm_hint: null,
        color: null,
        parent_code: null,
        sort_order: 0,
      },
    ];
    const merged = mergeStandardCategoriesForRegion(existing, "AT");
    // Should keep existing "reise" and add all others
    expect(merged[0].name).toBe("Custom Travel");
    // Total should be existing 1 + (AT presets - 1 overlap)
    const atPresetCount = STANDARD_CATEGORY_PRESETS.AT.length;
    expect(merged.length).toBe(atPresetCount);
  });

  it("returns original when no presets for region", () => {
    const existing = [
      {
        code: "test",
        name: "Test",
        is_tax_deductible: false,
        default_deduction_rate: 0,
        llm_hint: null,
        color: null,
        parent_code: null,
        sort_order: 0,
      },
    ];
    const merged = mergeStandardCategoriesForRegion(existing, "XX");
    expect(merged).toEqual(existing);
  });

  it("all presets have llm_hint for AI classification", () => {
    for (const [region, presets] of Object.entries(STANDARD_CATEGORY_PRESETS)) {
      for (const preset of presets) {
        expect(
          preset.llm_hint,
          `${region}/${preset.code} should have llm_hint`
        ).toBeTruthy();
      }
    }
  });
});
