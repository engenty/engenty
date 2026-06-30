import type { ActionDefinition, AgentDefinition } from "@engenty/ai-core";
import { webSearchTool } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { companyProfileSettingsSchema } from "../src/schema/zod.js";
import { buildCompanyWebsitePagesTool } from "./tools/company-website-pages.js";
import { buildLoadCompanyProfileTool } from "./tools/load-company-profile.js";
import { buildSetCompanyLogoTool } from "./tools/set-company-logo.js";
import { buildUpdateCompanyProfileTool } from "./tools/update-company-profile.js";

export const COMPANY_PROFILE_MANAGER_AGENT_ID = "company-profile.manager";

const EDITABLE_FIELDS = Object.keys(companyProfileSettingsSchema.shape)
  .sort()
  .join(", ");

function buildCompanyProfileResearchInstructions(pathname: string): string {
  return `You are researching the company profile for the current workspace.

Current page: ${pathname}
Editable fields (snake_case): ${EDITABLE_FIELDS}

Workflow:
1. Always call loadCompanyProfile first to inspect the currently stored values.
2. If the current profile already has a website, only call companyWebsitePages when it is a real public website. Skip localhost, .localhost, staging placeholders, and any internal-only host.
3. Use web_search for complementary public research such as the official website, imprint/contact page, company registration number, VAT ID, phone, email, address, tagline, and management details.
4. Prefer official company-controlled sources first: website home page, imprint/impressum, contact page, about page, LinkedIn company page, and public company registry pages surfaced through search results.
5. Summarize validated field suggestions in chat with evidence and source_url when possible. Remind the user that suggestions only fill the draft until they save.

Rules:
- Only suggest fields with clear evidence and include source_url when possible.
- Use snake_case field names from the editable field list.
- Prefer website/contact/legal/public registry evidence over third-party directories.
- Do not suggest bank fields unless an official public source explicitly provides them.
- If multiple plausible values exist for a field, list the options clearly.
- Never treat localhost, '.localhost', private IPs, or dev-server placeholder pages as valid evidence.
- Do not claim data was saved. The user still needs to review and save the form.`;
}

export const companyProfileDynamicInstructions = `You help operators review and maintain company profile settings for the current workspace.

Editable fields (snake_case): ${EDITABLE_FIELDS}

Workflow:
1. Always call loadCompanyProfile first to inspect the currently stored values.
2. If the current profile has a real public website, call companyWebsitePages to collect official website, contact, and imprint snippets.
3. Use web_search for complementary public evidence such as official websites, imprint/contact pages, registry pages, and public profiles.
4. When the user asks you to fill in, change, or correct fields, call updateCompanyProfile with only the fields that change (it merges — omit a field to leave it untouched, pass null to clear it).
5. To set or replace the logo, call setCompanyLogo with a public image URL; pass null to remove it.

Rules:
- Only write fields with clear evidence, and prefer confirming non-trivial or legal/banking changes with the user before saving.
- Use snake_case field names from the editable field list.
- updateCompanyProfile and setCompanyLogo persist immediately — after a successful call, tell the user exactly which fields were saved. Do not claim a save happened unless the tool returned success.`;

export async function buildCompanyProfileResearchPrompt(
  context: Record<string, unknown> | null | undefined
): Promise<string> {
  const pathname =
    typeof context?.pathname === "string"
      ? context.pathname
      : "/mdl/company-profile/settings";

  return buildCompanyProfileResearchInstructions(pathname);
}

async function buildCompanyProfileManagerSystemPrompt(params: {
  action?: ActionDefinition | null;
  context: Record<string, unknown>;
}): Promise<string> {
  const base = await buildCompanyProfileResearchPrompt(params.context);
  if (params.action) {
    return `${base}\n\nActive action: ${params.action.id} (${params.action.name})`;
  }
  return base;
}

export function createCompanyProfileManagerAgentDefinition(options: {
  invokeCompanyProfileOperation: PluginServerGatewayCaller["invokeOperation"];
}): AgentDefinition {
  const { invokeCompanyProfileOperation } = options;
  return {
    build_system_prompt: ({ action, context }) =>
      buildCompanyProfileManagerSystemPrompt({ action, context }),
    build_tools: (ctx) => ({
      loadCompanyProfile: buildLoadCompanyProfileTool(
        invokeCompanyProfileOperation
      ),
      updateCompanyProfile: buildUpdateCompanyProfileTool(
        invokeCompanyProfileOperation
      ),
      setCompanyLogo: buildSetCompanyLogoTool(invokeCompanyProfileOperation),
      companyWebsitePages: buildCompanyWebsitePagesTool(),
      web_search: webSearchTool,
    }),
    description: "Runs bounded company profile research and suggestion flows.",
    id: COMPANY_PROFILE_MANAGER_AGENT_ID,
    instruction_keys: [],
    module_id: "company-profile",
    name: "Company Profile Specialist",
  };
}
