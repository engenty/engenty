import {
  normalizeImportPresets,
  serializeImportPresets,
  upsertImportPreset,
} from "./import-presets.js";
import type {
  ColumnMapping,
  ImportFieldDefinition,
  ImportPreset,
  MatchByConfig,
} from "./types.js";

export interface ImportAiMapMappingResponse {
  confidence?: number;
  csvColumnIndex?: number;
  fieldKey: string;
  isTemplate?: boolean;
  template?: string;
}

export function mapImportAiMapResponse(
  mappings: ImportAiMapMappingResponse[],
  csvHeaders: string[]
): ColumnMapping[] {
  return mappings
    .filter((mapping) => {
      if (mapping.isTemplate && mapping.template?.trim()) {
        return true;
      }
      const idx = mapping.csvColumnIndex;
      return (
        typeof idx === "number" &&
        Number.isInteger(idx) &&
        idx >= 0 &&
        idx < csvHeaders.length
      );
    })
    .map((mapping): ColumnMapping => {
      if (mapping.isTemplate && mapping.template?.trim()) {
        return {
          fieldKey: mapping.fieldKey,
          csvColumn: null,
          csvColumnIndex: null,
          isTemplate: true,
          template: mapping.template.trim(),
          confidence: mapping.confidence,
          mappingSource: "ai",
        };
      }
      const idx = mapping.csvColumnIndex!;
      return {
        fieldKey: mapping.fieldKey,
        csvColumnIndex: idx,
        csvColumn: csvHeaders[idx] ?? null,
        confidence: mapping.confidence,
        mappingSource: "ai",
      };
    });
}

export interface TenantImportPresetClientOptions {
  apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  presetsKey: string;
}

export function createTenantImportPresetClient(
  options: TenantImportPresetClientOptions
) {
  const { apiRequest, presetsKey } = options;
  const settingsPath = `/api/tenant-settings/${encodeURIComponent(presetsKey)}`;

  async function getPresets(): Promise<ImportPreset[]> {
    try {
      const setting = await apiRequest<{
        name: string;
        type: "json";
        value: unknown;
      }>(settingsPath);
      return normalizeImportPresets(setting.value);
    } catch {
      return [];
    }
  }

  async function savePreset(
    name: string,
    mappings: ColumnMapping[],
    matchByConfig?: MatchByConfig
  ): Promise<void> {
    const existing = await getPresets();
    const next = upsertImportPreset(existing, name, mappings, matchByConfig);

    await apiRequest<{ name: string }>(settingsPath, {
      method: "PATCH",
      body: JSON.stringify({
        type: "json",
        value_jsonb: serializeImportPresets(next),
      }),
    });
  }

  async function suggestMappings(input: {
    aiMapPath: string;
    csvHeaders: string[];
    fieldDefinitions: ImportFieldDefinition[];
    sampleRows: string[][];
  }): Promise<ColumnMapping[]> {
    const result = await apiRequest<{ mappings: ImportAiMapMappingResponse[] }>(
      input.aiMapPath,
      {
        method: "POST",
        body: JSON.stringify({
          csvHeaders: input.csvHeaders,
          fieldDefinitions: input.fieldDefinitions,
          sampleRows: input.sampleRows,
        }),
      }
    );

    return mapImportAiMapResponse(result.mappings, input.csvHeaders);
  }

  return {
    getPresets,
    savePreset,
    suggestMappings,
  };
}
