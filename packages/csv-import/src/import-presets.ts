import type { ColumnMapping, ImportPreset, MatchByConfig } from "./types.js";

interface PresetPayload {
  mappings: ColumnMapping[];
  matchByConfig?: MatchByConfig;
}

function normalizePresetPayload(entry: unknown): PresetPayload | null {
  if (Array.isArray(entry)) {
    return { mappings: entry as ColumnMapping[] };
  }
  if (
    entry &&
    typeof entry === "object" &&
    Array.isArray((entry as PresetPayload).mappings)
  ) {
    const p = entry as PresetPayload;
    return {
      mappings: p.mappings,
      matchByConfig: p.matchByConfig,
    };
  }
  return null;
}

function normalizeMatchByConfig(c: unknown): MatchByConfig | undefined {
  if (!c || typeof c !== "object") {
    return;
  }
  const o = c as Record<string, unknown>;
  const t = o.type as string;
  if (t === "column") {
    const idx = o.columnIndex;
    if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0) {
      return;
    }
    return { type: "column", columnIndex: idx };
  }
  if (t === "template" && typeof o.template === "string") {
    return { type: "template", template: o.template };
  }
  if (t === "none") {
    return { type: "none" };
  }
  return;
}

export function normalizeImportPresets(value: unknown): ImportPreset[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([name, payload]): ImportPreset | null => {
      const normalized = normalizePresetPayload(payload);
      if (!normalized) {
        return null;
      }
      return {
        name,
        mappings: normalized.mappings.map((mapping) => ({
          csvColumn: mapping.csvColumn ?? null,
          csvColumnIndex: mapping.csvColumnIndex ?? null,
          fieldKey: mapping.fieldKey,
          mappingSource: mapping.mappingSource ?? "manual",
          confidence: mapping.confidence,
          isTemplate: mapping.isTemplate,
          template: mapping.template,
        })),
        matchByConfig: normalizeMatchByConfig(normalized.matchByConfig),
      };
    })
    .filter((p): p is ImportPreset => p !== null);
}

export function upsertImportPreset(
  presets: ImportPreset[],
  name: string,
  mappings: ColumnMapping[],
  matchByConfig?: MatchByConfig
): ImportPreset[] {
  const next = new Map(
    presets.map((p) => [
      p.name,
      { mappings: p.mappings, matchByConfig: p.matchByConfig },
    ])
  );
  next.set(name, { mappings, matchByConfig });
  return Array.from(next.entries()).map(
    ([presetName, { mappings: m, matchByConfig: mc }]) => ({
      name: presetName,
      mappings: m,
      matchByConfig: mc,
    })
  );
}

export function serializeImportPresets(
  presets: ImportPreset[]
): Record<
  string,
  { mappings: ColumnMapping[]; matchByConfig?: MatchByConfig }
> {
  return Object.fromEntries(
    presets.map((preset) => [
      preset.name,
      { mappings: preset.mappings, matchByConfig: preset.matchByConfig },
    ])
  );
}
