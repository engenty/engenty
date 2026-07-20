import { requestApiJson } from "@engenty/api-client";
import type {
  ColumnMapping,
  ImportFieldDefinition,
  MatchByConfig,
} from "@engenty/import";
import { createTenantImportPresetClient } from "@engenty/import";

const IMPORT_PRESETS_KEY = "module.secrets.import.presets";

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestApiJson<T>(path, init);
}

const secretsImportPresetClient = createTenantImportPresetClient({
  apiRequest,
  presetsKey: IMPORT_PRESETS_KEY,
});

export async function getSecretsImportPresets() {
  return secretsImportPresetClient.getPresets();
}

export async function saveSecretsImportPreset(
  name: string,
  mappings: ColumnMapping[],
  matchByConfig?: MatchByConfig
) {
  return secretsImportPresetClient.savePreset(name, mappings, matchByConfig);
}

export async function suggestSecretsImportMappings(input: {
  csvHeaders: string[];
  fieldDefinitions: ImportFieldDefinition[];
  sampleRows: string[][];
}): Promise<ColumnMapping[]> {
  return secretsImportPresetClient.suggestMappings({
    ...input,
    aiMapPath: "/api/secrets/import/ai-map",
  });
}
