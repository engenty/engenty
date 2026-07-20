import { registerImportAiMapRoute } from "@engenty/import/server";
import type { PluginServerApi } from "@engenty/plugin-sdk";

const SECRETS_IMPORT_AI_EXTRA_RULES = [
  "- Prefer mapping kind/type columns to `kind` (username_password, api_key, credit_card, note).",
  "- Map owner/scope columns to `owner_scope` (user, tenant, client, project).",
  "- For client/project ownership, map a name column to `owner_name`, `client_name`, or `project_name` when no UUID owner_id exists.",
  "- Map credential columns to the payload fields that match the secret type (username/password, value, number/expiry/cvv, content).",
];

export function registerSecretsImportRoutes(api: PluginServerApi) {
  registerImportAiMapRoute(api, {
    path: "/api/secrets/import/ai-map",
    requiredCapabilities: ["module.secrets.read"],
    tags: ["secrets", "import"],
    extraPromptRules: SECRETS_IMPORT_AI_EXTRA_RULES,
  });
}
