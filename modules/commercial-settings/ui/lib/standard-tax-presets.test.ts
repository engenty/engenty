import { describe, expect, it } from "vitest";
import type { TaxRate } from "../api.js";
import { mergeStandardTaxRatesForRegion } from "./standard-tax-presets.js";

describe("mergeStandardTaxRatesForRegion", () => {
  it("returns unchanged when region has no presets", () => {
    const current: TaxRate[] = [{ name: "a", label: "A", value: 7 }];
    expect(mergeStandardTaxRatesForRegion(current, "US")).toEqual(current);
  });

  it("appends missing preset values and skips duplicates by value", () => {
    const current: TaxRate[] = [{ name: "x", label: "X", value: 19 }];
    const merged = mergeStandardTaxRatesForRegion(current, "DE");
    expect(merged.filter((r) => r.value === 19)).toHaveLength(1);
    expect(merged.some((r) => r.value === 7)).toBe(true);
    expect(merged.some((r) => r.name === "MwSt_erm")).toBe(true);
  });

  it("keeps existing default when presets are merged", () => {
    const current: TaxRate[] = [
      { name: "x", label: "X", value: 19, is_default: true },
    ];
    const merged = mergeStandardTaxRatesForRegion(current, "DE");
    expect(merged.filter((r) => r.is_default)).toHaveLength(1);
    expect(merged.find((r) => r.is_default)?.value).toBe(19);
  });

  it("sets first positive rate as default when none was marked", () => {
    const current: TaxRate[] = [{ name: "a", label: "A", value: 5 }];
    const merged = mergeStandardTaxRatesForRegion(current, "DE");
    expect(merged.filter((r) => r.is_default)).toHaveLength(1);
    expect(merged.find((r) => r.is_default)?.value).toBe(5);
  });
});
