import {
  normalizeImportPresets,
  serializeImportPresets,
  upsertImportPreset,
} from "@engenty/import";
import { describe, expect, it } from "vitest";

describe("import preset helpers", () => {
  it("normalizes object storage to preset list", () => {
    const presets = normalizeImportPresets({
      basic: [
        {
          fieldKey: "display_name",
          csvColumn: "Company",
          csvColumnIndex: 0,
          mappingSource: "manual",
        },
      ],
    });
    expect(presets).toHaveLength(1);
    expect(presets[0]?.name).toBe("basic");
  });

  it("upserts by preset name", () => {
    const next = upsertImportPreset([{ name: "one", mappings: [] }], "one", [
      {
        fieldKey: "email",
        csvColumn: "Email",
        csvColumnIndex: 1,
        mappingSource: "manual",
      },
    ]);
    expect(next).toHaveLength(1);
    expect(next[0]?.mappings[0]?.fieldKey).toBe("email");
  });

  it("preserves matchByConfig in presets", () => {
    const next = upsertImportPreset(
      [],
      "gSales",
      [
        {
          fieldKey: "display_name",
          csvColumn: "Name",
          csvColumnIndex: 0,
          mappingSource: "manual",
        },
      ],
      { type: "column", columnIndex: 1 }
    );
    expect(next).toHaveLength(1);
    expect(next[0]?.matchByConfig).toEqual({
      type: "column",
      columnIndex: 1,
    });
  });

  it("serializes presets for tenant settings", () => {
    const value = serializeImportPresets([{ name: "x", mappings: [] }]);
    expect(value).toEqual({ x: { mappings: [], matchByConfig: undefined } });
  });
});
