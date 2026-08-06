import { describe, expect, it } from "vitest";
import { normalizeCommercialUnits } from "./normalize-commercial-units.js";

const deBuiltIns = [
  { name: "text" as const, label: "Text", singular: "Text" },
  { name: "fixed" as const, label: "Pauschal", singular: "Pauschal" },
  { name: "h" as const, label: "Stunden", singular: "Stunde" },
  { name: "d" as const, label: "Tage", singular: "Tag" },
];

describe("normalizeCommercialUnits", () => {
  it("uses locale-aware built-in labels when settings units are empty", () => {
    const units = normalizeCommercialUnits([], deBuiltIns);
    expect(units.find((u) => u.value === "h")).toMatchObject({
      label: "Stunden",
      singular: "Stunde",
      is_default: true,
    });
    expect(units.find((u) => u.value === "fixed")?.label).toBe("Pauschal");
  });

  it("ignores stored English labels for built-in keys", () => {
    const units = normalizeCommercialUnits(
      [
        { name: "h", label: "Hours", singular: "Hour" },
        { name: "pkg", label: "Pakete", singular: "Paket" },
      ],
      deBuiltIns
    );
    expect(units.find((u) => u.value === "h")?.label).toBe("Stunden");
    expect(units.find((u) => u.value === "pkg")).toMatchObject({
      label: "Pakete",
      singular: "Paket",
      is_default: false,
    });
  });
});
