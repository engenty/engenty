import {
  registerImportAiMapRoute,
  registerImportCleanupRoute,
} from "@engenty/import/server";
import type { PluginServerApi } from "@engenty/plugin-sdk";

const CONTACTS_IMPORT_AI_EXTRA_RULES = [
  '- One CSV column can map to MULTIPLE target fields: use the same csvColumnIndex in several mappings. E.g. map "Company" to both display_name and legal_name with two mappings, both csvColumnIndex pointing to the Company column.',
  "- For persons, map structured name columns (name_prefix, first_name, middle_name, last_name, name_suffix, phonetic_name, birth_name) when the CSV has them; a single combined name column can map to display_name only (split on import).",
  '- For contact_name: if CSV has separate first/middle/last name columns, use ONE template mapping. Template syntax: {{"HeaderName"}} for a column by header, or {{[0]}} for column index. Example: {{"First Name"}} {{"Last Name"}} or {{[1]}} {{[2]}}. Escape quotes in the template string for JSON.',
];

export function registerImportRoutes(api: PluginServerApi) {
  registerImportAiMapRoute(api, {
    path: "/api/contacts/import/ai-map",
    requiredCapabilities: ["module.contacts.read"],
    tags: ["contacts", "import"],
    extraPromptRules: CONTACTS_IMPORT_AI_EXTRA_RULES,
  });
  registerImportCleanupRoute(api, {
    path: "/api/contacts/import/cleanup",
    requiredCapabilities: ["module.contacts.read"],
    tags: ["contacts", "import"],
    domainHint: "contacts",
  });
}
