import type {
  ColumnMapping,
  ImportFieldDefinition,
  MatchByConfig,
} from "@engenty/import";
import { createTenantImportPresetClient } from "@engenty/import";
import { apiRequest } from "./request.js";

const IMPORT_PRESETS_KEY = "module.contacts.import.presets";

const contactsImportPresetClient = createTenantImportPresetClient({
  apiRequest,
  presetsKey: IMPORT_PRESETS_KEY,
});

export async function getContactsImportPresets() {
  return contactsImportPresetClient.getPresets();
}

export async function saveContactsImportPreset(
  name: string,
  mappings: ColumnMapping[],
  matchByConfig?: MatchByConfig
) {
  return contactsImportPresetClient.savePreset(name, mappings, matchByConfig);
}

export async function suggestContactsImportMappings(input: {
  csvHeaders: string[];
  fieldDefinitions: ImportFieldDefinition[];
  sampleRows: string[][];
}): Promise<ColumnMapping[]> {
  return contactsImportPresetClient.suggestMappings({
    ...input,
    aiMapPath: "/api/contacts/import/ai-map",
  });
}
