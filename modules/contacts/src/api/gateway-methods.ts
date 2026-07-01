import {
  createPluginServerGatewayCaller,
  type PluginServerApi,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { contactInputSchema } from "../schema/zod.js";
import {
  contactCreateInputSchema,
  contactIdParamsSchema,
  contactRecordSchema,
  contactSettingsInputSchema,
  contactSettingsSchema,
  contactsListQuerySchema,
  contactsPaginatedResponseSchema,
  contactUpdateSchema,
} from "../schema/zod.js";
import type { ContactRepoOrFactory, GetRepoFn } from "./helpers.js";
import { attachLinkedInvoiceCounts, countLinkedInvoices } from "./helpers.js";

export function registerContactsGatewayMethods(
  api: PluginServerApi,
  repoOrFactory: ContactRepoOrFactory,
  getRepoFn: GetRepoFn,
  contactCreateDefaults: Record<string, unknown>
) {
  const crossModuleOps = createPluginServerGatewayCaller(api);
  api.registerOperation({
    operationId: "contacts_create",
    moduleId: "contacts",
    summary: "Create contact",
    requiredCapabilities: ["module.contacts.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: contactCreateInputSchema,
    outputSchema: contactRecordSchema,
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = contactCreateInputSchema.parse(input);
      const { roles, ...rest } = parsed;
      const createInput = {
        ...contactCreateDefaults,
        ...rest,
        created_by: parsed.created_by ?? ctx.auth?.principalId ?? "system",
      } as z.infer<typeof contactInputSchema>;
      const created = await repo.create(createInput);
      if (roles?.length) {
        for (const role of roles) {
          await repo.addContactRole(created.id, role);
        }
        return repo.getById(created.id) ?? created;
      }
      return created;
    },
  });

  api.registerOperation({
    operationId: "contacts_list",
    moduleId: "contacts",
    summary: "List contacts",
    requiredCapabilities: ["module.contacts.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: contactsListQuerySchema.partial(),
    outputSchema: contactsPaginatedResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = contactsListQuerySchema.parse(input ?? {});
      const {
        include_linked_invoice_counts: includeLinkedInvoiceCounts,
        ...listParams
      } = parsed;
      const result = await repo.listPaginated(listParams);
      return {
        ...result,
        data: includeLinkedInvoiceCounts
          ? await attachLinkedInvoiceCounts(
              crossModuleOps,
              result.data,
              ctx.auth
            )
          : result.data,
      };
    },
  });

  // Search, status, and backfill are owned by the
  // `contacts.contact` SearchIndexProvider — registered in `plugin.ts` via
  // `engenty.server.registerSearchIndexProvider`. Agents reach them as the
  // synthesized `contacts_contact_search` op (catalog runner +
  // `engenty_tool_execute`); operators reach status/backfill through
  // `/api/search-index/providers/contacts.contact/*` in `apps/manage`.

  api.registerOperation({
    operationId: "contacts_get",
    moduleId: "contacts",
    summary: "Get contact by ID",
    requiredCapabilities: ["module.contacts.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: contactIdParamsSchema,
    outputSchema: contactRecordSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = input as z.infer<typeof contactIdParamsSchema>;
      const contact = await repo.getById(parsed.id);
      if (!contact) {
        return null;
      }
      const linkedInvoicesCount = await countLinkedInvoices(
        crossModuleOps,
        contact.id,
        ctx.auth
      );
      return linkedInvoicesCount === undefined
        ? contact
        : { ...contact, linked_invoices_count: linkedInvoicesCount };
    },
  });

  api.registerOperation({
    operationId: "contacts_update",
    moduleId: "contacts",
    summary: "Update contact",
    requiredCapabilities: ["module.contacts.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      patch: contactUpdateSchema,
    }),
    outputSchema: contactRecordSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = input as {
        id: string;
        patch: z.infer<typeof contactUpdateSchema>;
      };
      return repo.update(parsed.id, parsed.patch);
    },
  });

  api.registerOperation({
    operationId: "contacts_delete",
    moduleId: "contacts",
    summary: "Delete contact",
    requiredCapabilities: ["module.contacts.write"],
    riskLevel: "critical",
    requiresApproval: true,
    inputSchema: contactIdParamsSchema,
    outputSchema: z.object({ deleted: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = input as z.infer<typeof contactIdParamsSchema>;
      const deleted = await repo.delete(parsed.id);
      return { deleted };
    },
  });

  api.registerOperation({
    operationId: "contacts_add_contact_role",
    moduleId: "contacts",
    summary:
      "Add role to contact (e.g. when assigning as client on offer/project/invoice)",
    requiredCapabilities: ["module.contacts.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      contactId: z.string().min(1),
      role: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9][a-z0-9_-]*$/),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = input as {
        contactId: string;
        role: string;
      };
      const ok = await repo.addContactRole(parsed.contactId, parsed.role);
      return { ok };
    },
  });

  api.registerOperation({
    operationId: "contacts_settings_get",
    moduleId: "contacts",
    summary: "Get contacts settings",
    requiredCapabilities: ["module.contacts.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: z.object({}).passthrough(),
    outputSchema: contactSettingsSchema,
    handler: async (_input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      return repo.getSettings();
    },
  });

  const linkedInGetProfileInputSchema = z.object({
    linkedin_url: z.string().url().optional(),
  });
  const linkedInProfileSchema = z.object({
    display_name: z.string().optional(),
    legal_name: z.string().optional(),
    headline: z.string().optional(),
    profile_url: z.string().url().optional(),
    profile_picture_url: z.string().url().optional(),
  });
  const linkedInGetProfileErrorSchema = z.object({
    error: z.string(),
  });

  api.registerOperation({
    operationId: "contacts_linkedin_get_profile",
    moduleId: "contacts",
    summary: "Fetch LinkedIn profile data (requires OAuth connection)",
    requiredCapabilities: ["module.contacts.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: linkedInGetProfileInputSchema,
    outputSchema: z.union([
      linkedInProfileSchema,
      linkedInGetProfileErrorSchema,
    ]),
    handler: async (_input, _ctx) => ({
      error:
        "LinkedIn not connected. Connect your account in Contacts Settings.",
    }),
  });

  api.registerOperation({
    operationId: "contacts_settings_update",
    moduleId: "contacts",
    summary: "Update contacts settings",
    requiredCapabilities: ["module.contacts.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: contactSettingsInputSchema,
    outputSchema: contactSettingsSchema,
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = input as z.infer<typeof contactSettingsInputSchema>;
      return repo.setSettings(parsed);
    },
  });
}
