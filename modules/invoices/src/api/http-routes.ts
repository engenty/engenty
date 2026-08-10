import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { createInvoiceRepo } from "../dal/index.js";
import type {
  InvoicePdfStorage,
  InvoicePdfStorageOrFactory,
} from "../dal/pdf-storage.js";
import { InvoiceFinalizedError } from "../lib/invoice-commercial.js";
import { generateInvoicePdf } from "../pdf/generate.js";
import type {
  InvoiceBlockInput,
  InvoiceRecipientSnapshot,
} from "../schema/types.js";
import {
  deleteInvoiceResponseSchema,
  invoiceBlocksReplaceSchema,
  invoiceBlocksResponseSchema,
  invoiceClientIdParamsSchema,
  invoiceIdOrNumberParamsSchema,
  invoiceIdParamsSchema,
  invoiceInputSchema,
  invoiceNumberCheckQuerySchema,
  invoiceNumberCheckResponseSchema,
  invoiceNumberNextResponseSchema,
  invoiceSchema,
  invoiceSettingsInputSchema,
  invoiceSettingsSchema,
  invoiceStatusTransitionSchema,
  invoiceUpdateSchema,
  notFoundSchema,
} from "../schema/zod.js";
import { resolveRecipientFromClientId } from "./recipient.js";

function finalizedResponse(error: unknown): Response | null {
  if (error instanceof InvoiceFinalizedError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 409,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

function jsonNotFound(): Response {
  return new Response(JSON.stringify({ error: "Invoice not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

type InvoiceRepo = ReturnType<typeof createInvoiceRepo>;
type InvoiceRepoOrFactory =
  | InvoiceRepo
  | ((auth: PluginAuthContext) => InvoiceRepo);
type GetRepoFn = (
  repoOrFactory: InvoiceRepoOrFactory,
  auth?: PluginAuthContext
) => InvoiceRepo;

async function ensureClientRoleOnEntity(
  hasOperation: PluginServerApi["hasOperation"],
  invokeOperation: PluginHttpRouteContext["callGatewayMethod"],
  clientId: string | null | undefined,
  auth?: PluginAuthContext
): Promise<void> {
  const id = typeof clientId === "string" ? clientId.trim() : "";
  if (!(id && invokeOperation && hasOperation("contacts_add_contact_role"))) {
    return;
  }
  try {
    await invokeOperation(
      "contacts_add_contact_role",
      { contactId: id, role: "client" },
      { auth }
    );
  } catch {
    // contacts plugin may not be loaded
  }
}

function getPdfStorage(
  storageOrFactory: InvoicePdfStorageOrFactory,
  auth?: PluginAuthContext
): InvoicePdfStorage {
  if (typeof storageOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required for server-first PDF storage");
    }
    return storageOrFactory({ tenantId: auth.tenantId, scopeId: auth.scopeId });
  }
  return storageOrFactory;
}

export function registerInvoicesHttpRoutes(
  api: PluginServerApi,
  repoOrFactory: InvoiceRepoOrFactory,
  getRepo: GetRepoFn,
  pdfStorageOrFactory: InvoicePdfStorageOrFactory
) {
  // Static routes registered first so they are not shadowed by /:idOrNumber.
  api.registerHttpRoute({
    method: "get",
    path: "/api/invoices/settings",
    operation: {
      requiredCapabilities: ["module.invoices.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get invoice settings",
    tags: ["invoices", "settings"],
    responses: {
      200: { description: "Invoice settings", schema: invoiceSettingsSchema },
    },
    handler: async (ctx) => getRepo(repoOrFactory, ctx.auth).getSettings(),
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/invoices/settings",
    operation: {
      requiredCapabilities: ["module.invoices.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Update invoice settings",
    tags: ["invoices", "settings"],
    request: { body: invoiceSettingsInputSchema },
    responses: {
      200: { description: "Invoice settings", schema: invoiceSettingsSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const body = ctx.body as z.infer<typeof invoiceSettingsInputSchema>;
      return repo.setSettings(body);
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/invoices/number/check",
    operation: {
      requiredCapabilities: ["module.invoices.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Check invoice number availability",
    tags: ["invoices"],
    request: { query: invoiceNumberCheckQuerySchema },
    responses: {
      200: {
        description: "Availability",
        schema: invoiceNumberCheckResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const query = ctx.query as z.infer<typeof invoiceNumberCheckQuerySchema>;
      const exists = await repo.numberExists(query.value, query.excludeId);
      return { available: !exists };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/invoices/number/next",
    operation: {
      requiredCapabilities: ["module.invoices.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get next invoice number",
    tags: ["invoices"],
    responses: {
      200: {
        description: "Next number",
        schema: invoiceNumberNextResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return { number: await repo.getNextNumber() };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/invoices",
    operation: {
      requiredCapabilities: ["module.invoices.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Create invoice",
    tags: ["invoices"],
    request: {
      body: invoiceInputSchema,
    },
    responses: {
      201: {
        description: "Created invoice",
        schema: invoiceSchema,
      },
    },
    handler: async (ctx) => {
      const { callGatewayMethod: invokeOperation } = ctx;
      const repo = getRepo(repoOrFactory, ctx.auth);
      const input = ctx.body as z.infer<typeof invoiceInputSchema>;
      let recipientData: {
        clientId?: string;
        recipientSnapshot?: InvoiceRecipientSnapshot;
      };
      try {
        recipientData = input.clientId
          ? await resolveRecipientFromClientId(
              {
                hasOperation: api.hasOperation,
                invokeOperation,
              },
              input.clientId,
              ctx.auth
            )
          : { clientId: undefined, recipientSnapshot: undefined };
      } catch (error) {
        return new Response(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Invalid recipient client",
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        );
      }

      const created = await repo.create({
        ...input,
        ...recipientData,
      });
      if (recipientData.clientId) {
        await ensureClientRoleOnEntity(
          api.hasOperation,
          invokeOperation,
          recipientData.clientId,
          ctx.auth
        );
      }
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/invoices",
    operation: {
      requiredCapabilities: ["module.invoices.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List invoices",
    tags: ["invoices"],
    responses: {
      200: {
        description: "Invoices list",
        schema: z.array(invoiceSchema),
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.list();
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/invoices/:idOrNumber",
    operation: {
      requiredCapabilities: ["module.invoices.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get invoice by ID or number",
    tags: ["invoices"],
    request: {
      params: invoiceIdOrNumberParamsSchema,
    },
    responses: {
      200: {
        description: "Invoice",
        schema: invoiceSchema,
      },
      404: {
        description: "Not found",
        schema: notFoundSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<
        typeof invoiceIdOrNumberParamsSchema
      >;
      const invoice = await repo.get(params.idOrNumber);
      if (!invoice) {
        return new Response(JSON.stringify({ error: "Invoice not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return invoice;
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/invoices/:id",
    operation: {
      requiredCapabilities: ["module.invoices.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Update invoice",
    tags: ["invoices"],
    request: {
      params: invoiceIdParamsSchema,
      body: invoiceUpdateSchema,
    },
    responses: {
      200: {
        description: "Updated invoice",
        schema: invoiceSchema,
      },
      404: {
        description: "Not found",
        schema: notFoundSchema,
      },
    },
    handler: async (ctx) => {
      const { callGatewayMethod: invokeOperation } = ctx;
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof invoiceIdParamsSchema>;
      const patch = ctx.body as z.infer<typeof invoiceUpdateSchema>;
      let recipientPatch:
        | Record<string, never>
        | { clientId: null; recipientSnapshot: null }
        | { clientId: string; recipientSnapshot?: InvoiceRecipientSnapshot };
      try {
        recipientPatch =
          patch.clientId === undefined
            ? {}
            : patch.clientId === null
              ? { clientId: null, recipientSnapshot: null }
              : await resolveRecipientFromClientId(
                  {
                    hasOperation: api.hasOperation,
                    invokeOperation,
                  },
                  patch.clientId,
                  ctx.auth
                );
      } catch (error) {
        return new Response(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Invalid recipient client",
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        );
      }

      const updated = await repo.update(params.id, {
        ...patch,
        ...recipientPatch,
      });
      if (!updated) {
        return new Response(JSON.stringify({ error: "Invoice not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      if (
        patch.clientId &&
        recipientPatch &&
        "clientId" in recipientPatch &&
        recipientPatch.clientId
      ) {
        await ensureClientRoleOnEntity(
          api.hasOperation,
          invokeOperation,
          recipientPatch.clientId,
          ctx.auth
        );
      }
      return updated;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/invoices/:id",
    operation: {
      requiredCapabilities: ["module.invoices.write"],
      riskLevel: "critical",
      requiresApproval: true,
    },
    summary: "Delete invoice",
    tags: ["invoices"],
    request: {
      params: invoiceIdParamsSchema,
    },
    responses: {
      200: {
        description: "Delete result",
        schema: deleteInvoiceResponseSchema,
      },
      404: {
        description: "Not found",
        schema: notFoundSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof invoiceIdParamsSchema>;
      const ok = await repo.delete(params.id);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Invoice not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return { ok: true as const, id: params.id };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/invoices/by-client/:clientId",
    operation: {
      requiredCapabilities: ["module.invoices.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List invoices by client ID",
    tags: ["invoices"],
    request: {
      params: invoiceClientIdParamsSchema,
    },
    responses: {
      200: {
        description: "Invoices list",
        schema: z.array(invoiceSchema),
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof invoiceClientIdParamsSchema>;
      return repo.listByClient(params.clientId);
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/invoices/:id/pdf",
    responseMode: "binary",
    operation: {
      requiredCapabilities: ["module.invoices.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get invoice PDF",
    tags: ["invoices"],
    request: {
      params: invoiceIdParamsSchema,
    },
    responses: {
      200: {
        description: "Invoice PDF file",
        schema: z.any(),
      },
      404: {
        description: "Invoice not found",
        schema: notFoundSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const storage = getPdfStorage(pdfStorageOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof invoiceIdParamsSchema>;
      const invoice = await repo.get(params.id);
      if (!invoice) {
        return new Response(JSON.stringify({ error: "Invoice not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      let buffer = await storage.getPdf(invoice.id);
      if (!buffer) {
        const blocks = await repo.listBlocks(invoice.id).catch(() => []);
        const { callGatewayMethod: invokeOperation } = ctx;
        const template = invokeOperation
          ? ((await invokeOperation(
              "pdf_templates_get",
              { module_key: "invoices", use_default: true },
              { auth: ctx.auth }
            ).catch(() => null)) as Parameters<typeof generateInvoicePdf>[2])
          : null;
        buffer = await generateInvoicePdf(invoice, blocks, template);
        await storage.savePdf(invoice.id, invoice.number, buffer);
      }
      const filename = `${invoice.number.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    },
  });

  // --- Blocks ---------------------------------------------------------------

  api.registerHttpRoute({
    method: "get",
    path: "/api/invoices/:id/blocks",
    operation: {
      requiredCapabilities: ["module.invoices.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get invoice blocks",
    tags: ["invoices", "blocks"],
    request: { params: invoiceIdParamsSchema },
    responses: {
      200: {
        description: "Invoice blocks",
        schema: invoiceBlocksResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof invoiceIdParamsSchema>;
      return { data: await repo.listBlocks(params.id) };
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/invoices/:id/blocks",
    operation: {
      requiredCapabilities: ["module.invoices.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Replace invoice blocks",
    tags: ["invoices", "blocks"],
    request: {
      params: invoiceIdParamsSchema,
      body: invoiceBlocksReplaceSchema,
    },
    responses: {
      200: {
        description: "Invoice blocks",
        schema: invoiceBlocksResponseSchema,
      },
      404: { description: "Not found", schema: notFoundSchema },
      409: { description: "Invoice finalized", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof invoiceIdParamsSchema>;
      const body = ctx.body as z.infer<typeof invoiceBlocksReplaceSchema>;
      try {
        const data = await repo.replaceBlocks(
          params.id,
          body.blocks as InvoiceBlockInput[]
        );
        return { data };
      } catch (error) {
        const finalized = finalizedResponse(error);
        if (finalized) {
          return finalized;
        }
        throw error;
      }
    },
  });

  // --- Lifecycle ------------------------------------------------------------

  api.registerHttpRoute({
    method: "post",
    path: "/api/invoices/:id/issue",
    operation: {
      requiredCapabilities: ["module.invoices.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Issue (finalize) an invoice",
    tags: ["invoices"],
    request: { params: invoiceIdParamsSchema },
    responses: {
      200: { description: "Issued invoice", schema: invoiceSchema },
      404: { description: "Not found", schema: notFoundSchema },
      409: { description: "Invalid transition", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof invoiceIdParamsSchema>;
      try {
        const issued = await repo.issue(params.id);
        return issued ?? jsonNotFound();
      } catch (error) {
        return finalizedResponse(error) ?? jsonNotFound();
      }
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/invoices/:id/status",
    operation: {
      requiredCapabilities: ["module.invoices.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Set invoice status (sent / paid)",
    tags: ["invoices"],
    request: {
      params: invoiceIdParamsSchema,
      body: invoiceStatusTransitionSchema,
    },
    responses: {
      200: { description: "Updated invoice", schema: invoiceSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof invoiceIdParamsSchema>;
      const body = ctx.body as z.infer<typeof invoiceStatusTransitionSchema>;
      const updated = await repo.setStatus(params.id, body.status);
      return updated ?? jsonNotFound();
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/invoices/:id/cancel",
    operation: {
      requiredCapabilities: ["module.invoices.write"],
      riskLevel: "critical",
      requiresApproval: true,
    },
    summary: "Cancel an invoice via a linked Storno",
    tags: ["invoices"],
    request: { params: invoiceIdParamsSchema },
    responses: {
      200: { description: "Cancelled original + Storno", schema: z.any() },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof invoiceIdParamsSchema>;
      const result = await repo.cancel(params.id);
      return result;
    },
  });
}
