import { normalizeCommercialBlock } from "@engenty/commercial-editor/blocks";
import {
  createPluginServerGatewayCaller,
  type PluginAuthContext,
  type PluginServerApi,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { createInvoiceRepo } from "../dal/index.js";
import type {
  InvoiceBlockInput,
  InvoiceRecipientSnapshot,
} from "../schema/types.js";
import {
  invoiceBlockInputSchema,
  invoiceBlockSchema,
  invoiceClientIdParamsSchema,
  invoiceCountByClientIdsInputSchema,
  invoiceCountByClientIdsOutputSchema,
  invoiceIdOrNumberParamsSchema,
  invoiceIdParamsSchema,
  invoiceInputSchema,
  invoiceSchema,
  invoiceSettingsInputSchema,
  invoiceSettingsSchema,
  invoiceStatusTransitionSchema,
  invoiceUpdateSchema,
} from "../schema/zod.js";
import { resolveRecipientFromClientId } from "./recipient.js";

/**
 * Funnels agent-written blocks through the shared canonical normalizer before
 * they hit the DB, exactly as `offers_replace_blocks` does. Without this, a
 * line item written as `quantity`/`unit_price` stores fine but renders as 0 in
 * the commercial editor and in phase subtotals (both read
 * `amount`/`cost_per_item`), and a `type: "phase"` block is dropped entirely by
 * `groupBlocksForEditor` — which only knows headline + `is_phase: true`.
 */
export function normalizeInvoiceBlocks(
  blocks: InvoiceBlockInput[]
): InvoiceBlockInput[] {
  return blocks.map((block) => {
    const normalized = normalizeCommercialBlock({
      content: block.content_json ?? {},
      type: block.type,
    });
    return {
      ...block,
      type: normalized.type as InvoiceBlockInput["type"],
      content_json: normalized.content,
    };
  });
}

async function ensureClientRoleOnEntity(
  ops: ReturnType<typeof createPluginServerGatewayCaller>,
  clientId: string | null | undefined,
  auth?: PluginAuthContext
): Promise<void> {
  const id = typeof clientId === "string" ? clientId.trim() : "";
  if (!(id && ops.hasOperation("contacts_add_contact_role"))) {
    return;
  }
  try {
    await ops.invokeOperation(
      "contacts_add_contact_role",
      { contactId: id, role: "client" },
      { auth }
    );
  } catch {
    // contacts plugin may not be loaded
  }
}

type InvoiceRepo = ReturnType<typeof createInvoiceRepo>;
type InvoiceRepoOrFactory =
  | InvoiceRepo
  | ((auth: PluginAuthContext) => InvoiceRepo);
type GetRepoFn = (
  repoOrFactory: InvoiceRepoOrFactory,
  auth?: PluginAuthContext
) => InvoiceRepo;

export function registerInvoicesGatewayMethods(
  api: PluginServerApi,
  repoOrFactory: InvoiceRepoOrFactory,
  getRepo: GetRepoFn
) {
  const ops = createPluginServerGatewayCaller(api);
  api.registerOperation({
    operationId: "invoices_create",
    summary: "Create invoice",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: invoiceInputSchema,
    outputSchema: invoiceSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as z.infer<typeof invoiceInputSchema>;
      const recipientData = parsed.clientId
        ? await resolveRecipientFromClientId(ops, parsed.clientId, ctx.auth)
        : { clientId: undefined, recipientSnapshot: undefined };
      const created = await repo.create({
        ...parsed,
        ...recipientData,
      });
      if (recipientData.clientId) {
        await ensureClientRoleOnEntity(ops, recipientData.clientId, ctx.auth);
      }
      return created;
    },
  });

  api.registerOperation({
    operationId: "invoices_list",
    summary: "List invoices",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.array(invoiceSchema),
    handler: async (_input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.list();
    },
  });

  api.registerOperation({
    operationId: "invoices_get",
    summary: "Get invoice by ID or number",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: invoiceIdOrNumberParamsSchema,
    outputSchema: invoiceSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as z.infer<typeof invoiceIdOrNumberParamsSchema>;
      return repo.get(parsed.idOrNumber);
    },
  });

  api.registerOperation({
    operationId: "invoices_update",
    summary: "Update invoice",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      patch: invoiceUpdateSchema,
    }),
    outputSchema: invoiceSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as {
        id: string;
        patch: z.infer<typeof invoiceUpdateSchema>;
      };
      const patch = parsed.patch;
      const recipientPatch:
        | Record<string, never>
        | { clientId: null; recipientSnapshot: null }
        | { clientId: string; recipientSnapshot?: InvoiceRecipientSnapshot } =
        patch.clientId === undefined
          ? {}
          : patch.clientId === null
            ? { clientId: null, recipientSnapshot: null }
            : await resolveRecipientFromClientId(ops, patch.clientId, ctx.auth);
      const updated = await repo.update(parsed.id, {
        ...patch,
        ...recipientPatch,
      });
      if (
        patch.clientId &&
        recipientPatch &&
        "clientId" in recipientPatch &&
        recipientPatch.clientId
      ) {
        await ensureClientRoleOnEntity(ops, recipientPatch.clientId, ctx.auth);
      }
      return updated;
    },
  });

  api.registerOperation({
    operationId: "invoices_delete",
    summary: "Delete invoice",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.write"],
    riskLevel: "critical",
    requiresApproval: true,
    inputSchema: invoiceIdParamsSchema,
    outputSchema: z.object({ deleted: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as z.infer<typeof invoiceIdParamsSchema>;
      const deleted = await repo.delete(parsed.id);
      return { deleted };
    },
  });

  api.registerOperation({
    operationId: "invoices_list_by_client",
    summary: "List invoices by client ID",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: invoiceClientIdParamsSchema,
    outputSchema: z.array(invoiceSchema),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as z.infer<typeof invoiceClientIdParamsSchema>;
      return repo.listByClient(parsed.clientId);
    },
  });

  api.registerOperation({
    operationId: "invoices_count_by_client_ids",
    summary: "Count non-deleted invoices per client ID (batched)",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: invoiceCountByClientIdsInputSchema,
    outputSchema: invoiceCountByClientIdsOutputSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = invoiceCountByClientIdsInputSchema.parse(input);
      return repo.countByClientIds(parsed.clientIds);
    },
  });

  // --- Blocks ---------------------------------------------------------------

  api.registerOperation({
    operationId: "invoices_get_blocks",
    summary: "Get invoice blocks",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: invoiceIdParamsSchema,
    outputSchema: z.array(invoiceBlockSchema),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as z.infer<typeof invoiceIdParamsSchema>;
      return repo.listBlocks(parsed.id);
    },
  });

  api.registerOperation({
    operationId: "invoices_replace_blocks",
    summary: "Replace invoice blocks",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      blocks: z
        .array(invoiceBlockInputSchema)
        .describe(
          'Full ordered block list. content_json by type — line_item: {"title": string, "amount": number (quantity), "unit": string ("h", "Tage", "fixed", …), "cost_per_item": number (net unit price), "tax": number (percent), "content"?: string (description line)}; phase: {"title": string} (stored as a headline block with is_phase: true; groups all following blocks until the next phase); headline/subheading: {"title": string}; text: {"content": string}. The aliases quantity/unit_price/tax_rate and text are accepted and normalized to the canonical keys.'
        ),
    }),
    outputSchema: z.array(invoiceBlockSchema),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as {
        id: string;
        blocks: InvoiceBlockInput[];
      };
      return repo.replaceBlocks(
        parsed.id,
        normalizeInvoiceBlocks(parsed.blocks)
      );
    },
  });

  // --- Settings -------------------------------------------------------------

  api.registerOperation({
    operationId: "invoices_get_settings",
    summary: "Get invoice settings",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: z.object({}).passthrough(),
    outputSchema: invoiceSettingsSchema,
    handler: async (_input, ctx) =>
      getRepo(repoOrFactory, ctx.auth).getSettings(),
  });

  api.registerOperation({
    operationId: "invoices_set_settings",
    summary: "Update invoice settings",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: invoiceSettingsInputSchema,
    outputSchema: invoiceSettingsSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.setSettings(
        input as z.infer<typeof invoiceSettingsInputSchema>
      );
    },
  });

  api.registerOperation({
    operationId: "invoices_get_next_number",
    summary: "Get next invoice number",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({ number: z.string() }),
    handler: async (_input, ctx) => ({
      number: await getRepo(repoOrFactory, ctx.auth).getNextNumber(),
    }),
  });

  // --- Lifecycle ------------------------------------------------------------

  api.registerOperation({
    operationId: "invoices_issue",
    summary: "Issue (finalize) an invoice — owner approval gate",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: invoiceIdParamsSchema,
    outputSchema: invoiceSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as z.infer<typeof invoiceIdParamsSchema>;
      return repo.issue(parsed.id);
    },
  });

  api.registerOperation({
    operationId: "invoices_set_status",
    summary: "Set invoice status (sent / paid)",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      status: invoiceStatusTransitionSchema.shape.status,
    }),
    outputSchema: invoiceSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as {
        id: string;
        status: z.infer<typeof invoiceStatusTransitionSchema>["status"];
      };
      return repo.setStatus(parsed.id, parsed.status);
    },
  });

  api.registerOperation({
    operationId: "invoices_cancel",
    summary: "Cancel an invoice via a linked Storno",
    moduleId: "invoices",
    requiredCapabilities: ["module.invoices.write"],
    riskLevel: "critical",
    requiresApproval: true,
    inputSchema: invoiceIdParamsSchema,
    outputSchema: z.object({
      original: invoiceSchema,
      storno: invoiceSchema,
    }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as z.infer<typeof invoiceIdParamsSchema>;
      return repo.cancel(parsed.id);
    },
  });
}
