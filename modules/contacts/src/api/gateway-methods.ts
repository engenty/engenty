import {
  createPluginServerGatewayCaller,
  createRecordLinker,
  type PluginServerApi,
  type RecordLinkAuth,
  withRecordLink,
  withRecordLinks,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { ContactInput } from "../schema/types.js";
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
  // Contacts are tenant-shared: the link lands in the space the call runs in.
  const link = createRecordLinker(api);
  const contactLink = (
    auth: RecordLinkAuth | undefined,
    contact: { id: string }
  ) => link(auth, "contacts", [contact.id]);

  api.registerOperation({
    operationId: "contacts_create",
    moduleId: "contacts",
    spacePolicy: { kind: "tenant_shared" },
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
      } as ContactInput;
      const created = await repo.create(createInput);
      if (roles?.length) {
        for (const role of roles) {
          await repo.addContactRole(created.id, role);
        }
        return withRecordLink(
          (await repo.getById(created.id)) ?? created,
          (contact) => contactLink(ctx.auth, contact)
        );
      }
      return withRecordLink(created, (contact) =>
        contactLink(ctx.auth, contact)
      );
    },
  });

  api.registerOperation({
    operationId: "contacts_list",
    moduleId: "contacts",
    spacePolicy: { kind: "tenant_shared" },
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
        data: await withRecordLinks(
          includeLinkedInvoiceCounts
            ? await attachLinkedInvoiceCounts(
                crossModuleOps,
                result.data,
                ctx.auth
              )
            : result.data,
          (contact) => contactLink(ctx.auth, contact)
        ),
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
    spacePolicy: { kind: "tenant_shared" },
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
      return withRecordLink(
        linkedInvoicesCount === undefined
          ? contact
          : { ...contact, linked_invoices_count: linkedInvoicesCount },
        (row) => contactLink(ctx.auth, row)
      );
    },
  });

  api.registerOperation({
    operationId: "contacts_update",
    moduleId: "contacts",
    spacePolicy: { kind: "tenant_shared" },
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
      const updated = await repo.update(parsed.id, parsed.patch);
      return updated
        ? withRecordLink(updated, (contact) => contactLink(ctx.auth, contact))
        : updated;
    },
  });

  api.registerOperation({
    operationId: "contacts_delete",
    moduleId: "contacts",
    spacePolicy: { kind: "tenant_shared" },
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

  /**
   * ONE operation for a whole spreadsheet (PLAN-space-data.md D5).
   *
   * The collection view (`Contacts/contacts.csv`) reads as a file, but saving
   * one can mean hundreds of record writes — so it is never a file save. It is
   * this: a single gated operation whose approval card names a COUNT, applied
   * atomically enough to report what happened. Routing each row through
   * `contacts_create` instead would raise one approval card per row, which is
   * the version of this nobody would ever approve.
   */
  api.registerOperation({
    operationId: "contacts_bulk_import",
    moduleId: "contacts",
    spacePolicy: { kind: "tenant_shared" },
    summary:
      "Create or update many contacts at once (rows with an id update, rows without create)",
    requiredCapabilities: ["module.contacts.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      rows: z.array(z.record(z.string(), z.unknown())).max(1000),
    }),
    outputSchema: z.object({
      created: z.number().int().nonnegative(),
      failed: z.array(
        z.object({ reason: z.string(), row: z.number().int().nonnegative() })
      ),
      updated: z.number().int().nonnegative(),
    }),
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = input as { rows: Record<string, unknown>[] };
      const failed: Array<{ reason: string; row: number }> = [];
      let created = 0;
      let updated = 0;
      for (const [index, row] of parsed.rows.entries()) {
        const { id, ...fields } = row;
        try {
          if (typeof id === "string" && id.length > 0) {
            // A row that names a record UPDATES it. Rows are validated one at
            // a time so a single bad line reports its own position instead of
            // failing the whole import — the reason `failed` carries an index.
            await repo.update(id, contactUpdateSchema.parse(fields));
            updated += 1;
            continue;
          }
          await repo.create({
            ...contactCreateDefaults,
            ...contactCreateInputSchema.parse({
              ...fields,
              created_by: ctx.auth?.principalId ?? "system",
            }),
          } as ContactInput);
          created += 1;
        } catch (error) {
          failed.push({
            reason: error instanceof Error ? error.message : String(error),
            row: index,
          });
        }
      }
      return { created, failed, updated };
    },
  });

  api.registerOperation({
    operationId: "contacts_add_contact_role",
    moduleId: "contacts",
    spacePolicy: { kind: "tenant_shared" },
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
    spacePolicy: { kind: "tenant_shared" },
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
    spacePolicy: { kind: "tenant_shared" },
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
    spacePolicy: { kind: "tenant_shared" },
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
