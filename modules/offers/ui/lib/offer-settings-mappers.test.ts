import { describe, expect, it } from "vitest";
import { mapDisplaySettingPatch } from "./offer-settings-mappers.js";

describe("mapDisplaySettingPatch", () => {
  it("maps phase index toggle", () => {
    expect(mapDisplaySettingPatch("showPhaseIndex", true)).toEqual({
      show_phase_index: true,
    });
  });

  it("maps phase index pattern", () => {
    expect(mapDisplaySettingPatch("phaseIndexPattern", "I.")).toEqual({
      phase_index_pattern: "I.",
    });
  });

  it("maps tax visibility and default tax rate", () => {
    expect(mapDisplaySettingPatch("showTaxPerItem", false)).toEqual({
      show_tax_per_item: false,
    });
    expect(mapDisplaySettingPatch("defaultTaxRate", "20")).toEqual({
      default_tax_rate: 20,
    });
  });

  it("maps phase subtotal toggle", () => {
    expect(mapDisplaySettingPatch("showPhaseTotals", true)).toEqual({
      show_phase_totals: true,
    });
  });
});
