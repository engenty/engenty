import { requestApiJson } from "@engenty/api-client";
import type {
  ColumnMapping,
  ImportFieldDefinition,
  MatchByConfig,
} from "@engenty/import";
import { createTenantImportPresetClient } from "@engenty/import";
import type { TeamMemberListItem } from "../api.js";

const IMPORT_PRESETS_KEY = "module.team.import.presets";

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestApiJson<T>(path, init);
}

const teamImportPresetClient = createTenantImportPresetClient({
  apiRequest,
  presetsKey: IMPORT_PRESETS_KEY,
});

export async function getTeamImportPresets() {
  return teamImportPresetClient.getPresets();
}

export async function saveTeamImportPreset(
  name: string,
  mappings: ColumnMapping[],
  matchByConfig?: MatchByConfig
) {
  return teamImportPresetClient.savePreset(name, mappings, matchByConfig);
}

export async function suggestTeamImportMappings(input: {
  csvHeaders: string[];
  fieldDefinitions: ImportFieldDefinition[];
  sampleRows: string[][];
}): Promise<ColumnMapping[]> {
  return teamImportPresetClient.suggestMappings({
    ...input,
    aiMapPath: "/api/team/import/ai-map",
  });
}

export async function findTeamMemberByImportId(
  importId: string
): Promise<TeamMemberListItem | null> {
  try {
    return await apiRequest<TeamMemberListItem>(
      `/api/team/by-import-id?import_id=${encodeURIComponent(importId)}`
    );
  } catch {
    return null;
  }
}

export async function findTeamMemberByEmail(
  email: string
): Promise<TeamMemberListItem | null> {
  try {
    return await apiRequest<TeamMemberListItem>(
      `/api/team/by-email?email=${encodeURIComponent(email)}`
    );
  } catch {
    return null;
  }
}
