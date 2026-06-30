import { describe, expect, it } from "vitest";
import {
  normalizeImportPresets,
  serializeImportPresets,
  upsertImportPreset,
} from "./import-presets.js";

describe("normalizeImportPresets", () => {
  it("returns empty array for invalid value", () => {
    expect(normalizeImportPresets(null)).toEqual([]);
    expect(normalizeImportPresets("x")).toEqual([]);
  });

  it("normalizes legacy array-only preset payload", () => {
    const result = normalizeImportPresets({
      Default: [
        {
          fieldKey: "full_name",
          csvColumn: "Name",
          csvColumnIndex: 0,
          mappingSource: "manual",
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Default");
    expect(result[0]?.mappings[0]?.fieldKey).toBe("full_name");
  });

  it("normalizes preset with matchByConfig", () => {
    const result = normalizeImportPresets({
      HR: {
        mappings: [
          {
            fieldKey: "import_id",
            csvColumn: "ID",
            csvColumnIndex: 0,
            mappingSource: "manual",
          },
        ],
        matchByConfig: { type: "column", columnIndex: 0 },
      },
    });
    expect(result[0]?.matchByConfig).toEqual({
      type: "column",
      columnIndex: 0,
    });
  });
});

describe("upsertImportPreset", () => {
  it("replaces preset with same name", () => {
    const existing = [
      {
        name: "A",
        mappings: [
          {
            fieldKey: "email",
            csvColumn: "Email",
            csvColumnIndex: 1,
            mappingSource: "manual" as const,
          },
        ],
      },
    ];
    const next = upsertImportPreset(existing, "A", [
      {
        fieldKey: "full_name",
        csvColumn: "Name",
        csvColumnIndex: 0,
        mappingSource: "manual",
      },
    ]);
    expect(next).toHaveLength(1);
    expect(next[0]?.mappings[0]?.fieldKey).toBe("full_name");
  });
});

describe("serializeImportPresets", () => {
  it("round-trips through normalize", () => {
    const presets = [
      {
        name: "Test",
        mappings: [
          {
            fieldKey: "email",
            csvColumn: "Email",
            csvColumnIndex: 0,
            mappingSource: "manual" as const,
          },
        ],
        matchByConfig: { type: "none" as const },
      },
    ];
    const serialized = serializeImportPresets(presets);
    const normalized = normalizeImportPresets(serialized);
    expect(normalized[0]?.name).toBe("Test");
    expect(normalized[0]?.matchByConfig).toEqual({ type: "none" });
  });
});
