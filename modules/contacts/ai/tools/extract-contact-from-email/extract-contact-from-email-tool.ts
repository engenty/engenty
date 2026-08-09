import { extractEmailContactInfo } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { type Tool, tool } from "ai";
import { z } from "zod";

const extractContactFromEmailToolInputSchema = z.object({
  email_body: z.string().min(1),
  from_email: z.string().email().optional(),
  from_name: z.string().min(1).optional(),
});

function buildDisplayName(params: {
  company?: string;
  fromEmail?: string;
  fromName?: string;
  name?: string;
}): string {
  return (
    params.name ??
    params.company ??
    params.fromName ??
    params.fromEmail ??
    "Unknown contact"
  );
}

async function searchMatches(
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"],
  search: string | undefined
) {
  if (!search || search.trim().length === 0) {
    return [];
  }
  const result = (await invokeContactsOperation("contacts_list", {
    page: 1,
    pageSize: 5,
    search: search.trim(),
  })) as { data?: unknown[] };
  return result.data ?? [];
}

export function buildExtractContactFromEmailTool(
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"]
): Tool {
  return tool({
    description:
      "Extract a person and company from an email body, search for existing matches, and prepare a linking proposal.",
    inputSchema: extractContactFromEmailToolInputSchema,
    execute: async ({ email_body, from_email, from_name }) => {
      const extraction = await extractEmailContactInfo({
        bodyText: email_body,
      });
      if (extraction.is_automated_or_newsletter) {
        return {
          is_automated_or_newsletter: true,
          message:
            "This looks like an automated message or newsletter, so no contact proposal was produced.",
        };
      }

      const companyName = extraction.contact_info.company?.trim();
      const personName =
        extraction.contact_info.name?.trim() || from_name?.trim() || undefined;

      const personProposal = {
        contact_name: personName ?? "",
        display_name: buildDisplayName({
          fromEmail: from_email,
          fromName: from_name,
          name: personName,
        }),
        email: from_email ?? null,
        phone: extraction.contact_info.phone ?? null,
        type: "person" as const,
      };

      const companyProposal = companyName
        ? {
            display_name: companyName,
            legal_name: companyName,
            type: "organisation" as const,
            website_contact: extraction.contact_info.website ?? null,
          }
        : null;

      const [personMatches, companyMatches, emailMatches] = await Promise.all([
        searchMatches(invokeContactsOperation, personName),
        searchMatches(invokeContactsOperation, companyName),
        searchMatches(invokeContactsOperation, from_email),
      ]);

      return {
        company: companyProposal,
        existing_company_matches: companyMatches,
        existing_person_matches: [...emailMatches, ...personMatches],
        footer_snippet: extraction.footer_snippet,
        person: personProposal,
        proposed_relation: companyProposal
          ? {
              relation_type: "works_at" as const,
              role: extraction.contact_info.role ?? null,
            }
          : null,
      };
    },
  });
}
