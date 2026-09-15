import { describe, expect, it } from "vitest";
import { STANDARD_CATEGORY_PRESETS } from "./region-packs.js";
import { mergeStandardCategoriesForRegion } from "./standard-category-presets.js";

describe("standard-category-presets", () => {
  it("has AT presets with EKR class 7 accounts", () => {
    const at = STANDARD_CATEGORY_PRESETS.AT;
    expect(at.length).toBeGreaterThanOrEqual(15);
    const codes = at.map((c) => c.code);
    expect(codes).toContain("reise");
    expect(codes).toContain("bewirtung");
    expect(codes).toContain("buero");
    expect(codes).toContain("kfz");
    expect(codes).toContain("sonstige");
    const reise = at.find((c) => c.code === "reise");
    expect(reise?.account_class).toBe("7");
    expect(reise?.account_number).toBe("7340");
  });

  it("does not use class 4 (Erlöse) for AT expenses", () => {
    for (const preset of STANDARD_CATEGORY_PRESETS.AT) {
      expect(preset.account_class).toBe("7");
      expect(preset.account_number?.startsWith("4")).toBe(false);
    }
  });

  it("AT Bewirtung has 50% deduction rate", () => {
    const bewirtung = STANDARD_CATEGORY_PRESETS.AT.find(
      (c) => c.code === "bewirtung"
    );
    expect(bewirtung).toBeDefined();
    expect(bewirtung!.default_deduction_rate).toBe(0.5);
    expect(bewirtung!.is_tax_deductible).toBe(true);
    expect(bewirtung!.account_number).toBe("7650");
  });

  it("DE Bewirtung has 70% deduction rate and SKR 03 class 4", () => {
    const bewirtung = STANDARD_CATEGORY_PRESETS.DE.find(
      (c) => c.code === "bewirtung"
    );
    expect(bewirtung).toBeDefined();
    expect(bewirtung!.default_deduction_rate).toBe(0.7);
    expect(bewirtung!.account_class).toBe("4");
    expect(bewirtung!.account_number).toBe("4650");
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
    expect(merged[0].name).toBe("Custom Travel");
    const atPresetCount = STANDARD_CATEGORY_PRESETS.AT.length;
    expect(merged.length).toBe(atPresetCount);
  });

  it("backfills missing EKR accounts on existing codes", () => {
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
    const reise = merged.find((c) => c.code === "reise");
    expect(reise?.name).toBe("Custom Travel");
    expect(reise?.account_class).toBe("7");
    expect(reise?.account_number).toBe("7340");
  });

  it("does not overwrite an existing account number", () => {
    const existing = [
      {
        account_class: "7",
        account_number: "7341",
        code: "reise",
        name: "Inlandsreisen",
        is_tax_deductible: true,
        default_deduction_rate: 1,
        llm_hint: null,
        color: null,
        parent_code: null,
        sort_order: 0,
      },
    ];
    const merged = mergeStandardCategoriesForRegion(existing, "AT");
    expect(merged[0].account_number).toBe("7341");
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
        expect(
          preset.account_class,
          `${region}/${preset.code} should have account_class`
        ).toMatch(/^[0-9]$/);
        expect(
          preset.account_number,
          `${region}/${preset.code} should have account_number`
        ).toBeTruthy();
      }
    }
  });
});
