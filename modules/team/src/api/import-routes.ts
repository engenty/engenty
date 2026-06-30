import { registerImportAiMapRoute } from "@engenty/import/server";
import type { PluginServerApi } from "@engenty/plugin-sdk";

const TEAM_IMPORT_AI_EXTRA_RULES = [
  "- Map structured name columns to their matching fields: first_name (Vorname, First Name), middle_name (Middle Name, Mittelname), last_name (Nachname, Last Name), name_prefix, name_suffix, phonetic_name, birth_name. Never map every name field to the same CSV column.",
  '- Map full_name only to a single combined name column, or use ONE template when parts must be merged: {{"First Name"}} {{"Last Name"}}. Do not also map first_name/last_name to the same columns when using a full_name template.',
  "- One CSV column can map to MULTIPLE target fields only when intentional (e.g. Company → display_name and legal_name). Never duplicate-map person name columns across all name fields.",
];

export function registerTeamImportRoutes(api: PluginServerApi) {
  registerImportAiMapRoute(api, {
    path: "/api/team/import/ai-map",
    requiredCapabilities: ["module.team.read"],
    tags: ["team", "import"],
    extraPromptRules: TEAM_IMPORT_AI_EXTRA_RULES,
  });
}
