import type {
  PluginHttpRouteContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import type { z } from "@hono/zod-openapi";
import type { contactInputSchema } from "../schema/zod.js";
import {
  contactCreateInputSchema,
  contactIdParamsSchema,
  contactRecordSchema,
  contactsByImportIdQuerySchema,
  contactsByReferenceIdQuerySchema,
  contactsListQuerySchema,
  contactsPaginatedResponseSchema,
  contactsSearchQuerySchema,
  contactsSearchResponseSchema,
  contactUpdateSchema,
  deleteContactResponseSchema,
  notFoundSchema,
} from "../schema/zod.js";
import type {
  ContactRepoOrFactory,
  GatewayMethodCaller,
  GetRepoFn,
} from "./helpers.js";
import { attachLinkedInvoiceCounts, countLinkedInvoices } from "./helpers.js";

function createRouteGatewayCaller(
  server: Pick<PluginServerApi, "hasOperation">,
  invokeOperation: PluginHttpRouteContext["callGatewayMethod"]
): GatewayMethodCaller {
  return {
    hasOperation: server.hasOperation,
    invokeOperation: async (methodName, input, options) => {
      if (!invokeOperation) {
        throw new Error("Gateway calls are not available for this route");
      }
      return invokeOperation(methodName, input, options);
    },
  };
}

export function registerContactsRoutes(
  api: PluginServerApi,
  repoOrFactory: ContactRepoOrFactory,
  getRepoFn: GetRepoFn,
  contactCreateDefaults: Record<string, unknown>
) {
  api.registerHttpRoute({
    method: "post",
    path: "/api/contacts",
    operation: {
      requiredCapabilities: ["module.contacts.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Create contact",
    tags: ["contacts"],
    request: { body: contactCreateInputSchema },
    responses: {
      201: {
        description: "Created contact",
        schema: contactRecordSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const body = ctx.body as z.infer<typeof contactCreateInputSchema>;
      const { roles, ...rest } = body;
      const createInput = {
        ...contactCreateDefaults,
        ...rest,
        legal_name: rest.legal_name ?? null,
        contact_name: rest.contact_name ?? "",
      } as z.infer<typeof contactInputSchema>;
      const created = await repo.create(createInput);
      if (roles?.length) {
        for (const role of roles) {
          await repo.addContactRole(created.id, role);
        }
        const withRoles = await repo.getById(created.id);
        return new Response(JSON.stringify(withRoles ?? created), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  // `/api/contacts/search-index/status` and
  // `/api/contacts/search-embeddings/backfill` were retired together with the
  // legacy embedding DAL; the unified admin surface lives at
  // `/api/search-index/providers/contacts.contact/{status,backfill}`. Apps/manage
  // already targets the unified surface.

  api.registerHttpRoute({
    method: "get",
    path: "/api/contacts/search",
    operation: {
      requiredCapabilities: ["module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Search contacts",
    tags: ["contacts"],
    request: { query: contactsSearchQuerySchema },
    responses: {
      200: {
        description: "Contacts search results with match evidence",
        schema: contactsSearchResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      const parsedQuery = contactsSearchQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        role: url.searchParams.get("role") ?? undefined,
        type: url.searchParams.get("type") ?? undefined,
        sortBy: url.searchParams.get("sortBy") ?? undefined,
        sortOrder: url.searchParams.get("sortOrder") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        strategy: url.searchParams.get("strategy") ?? undefined,
        include_linked_invoice_counts:
          url.searchParams.get("include_linked_invoice_counts") ?? undefined,
      });
      const {
        include_linked_invoice_counts: includeLinkedInvoiceCounts,
        ...searchParams
      } = parsedQuery;
      const result = await repo.search(searchParams);
      if (!includeLinkedInvoiceCounts) {
        return result;
      }
      const { callGatewayMethod: invokeOperation } = ctx;
      const gateway = createRouteGatewayCaller(api, invokeOperation);
      const contacts = await attachLinkedInvoiceCounts(
        gateway,
        result.data.map((match) => match.contact),
        ctx.auth
      );
      return {
        ...result,
        data: result.data.map((match, index) => ({
          ...match,
          contact: contacts[index] ?? match.contact,
        })),
      };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/contacts",
    operation: {
      requiredCapabilities: ["module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List contacts",
    tags: ["contacts"],
    request: { query: contactsListQuerySchema },
    responses: {
      200: {
        description: "Contacts paginated list",
        schema: contactsPaginatedResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      const parsedQuery = contactsListQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        role: url.searchParams.get("role") ?? undefined,
        type: url.searchParams.get("type") ?? undefined,
        sortBy: url.searchParams.get("sortBy") ?? undefined,
        sortOrder: url.searchParams.get("sortOrder") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        include_linked_invoice_counts:
          url.searchParams.get("include_linked_invoice_counts") ?? undefined,
      });
      const {
        include_linked_invoice_counts: includeLinkedInvoiceCounts,
        ...listParams
      } = parsedQuery;
      const result = await repo.listPaginated(listParams);
      const { callGatewayMethod: invokeOperation } = ctx;
      return {
        ...result,
        data: includeLinkedInvoiceCounts
          ? await attachLinkedInvoiceCounts(
              createRouteGatewayCaller(api, invokeOperation),
              result.data,
              ctx.auth
            )
          : result.data,
      };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/contacts/by-import-id",
    operation: {
      requiredCapabilities: ["module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get contact by import ID",
    tags: ["contacts"],
    request: { query: contactsByImportIdQuerySchema },
    responses: {
      200: { description: "Contact", schema: contactRecordSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      const parsed = contactsByImportIdQuerySchema.parse({
        import_id: url.searchParams.get("import_id") ?? undefined,
      });
      const contact = await repo.getByImportId(parsed.import_id);
      if (!contact) {
        return new Response(JSON.stringify({ error: "Contact not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return contact;
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/contacts/by-reference-id",
    operation: {
      requiredCapabilities: ["module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get contact by reference ID",
    tags: ["contacts"],
    request: { query: contactsByReferenceIdQuerySchema },
    responses: {
      200: { description: "Contact", schema: contactRecordSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      const parsed = contactsByReferenceIdQuerySchema.parse({
        reference_id: url.searchParams.get("reference_id") ?? undefined,
      });
      const contact = await repo.getByReferenceId(parsed.reference_id);
      if (!contact) {
        return new Response(JSON.stringify({ error: "Contact not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return contact;
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/contacts/:id",
    operation: {
      requiredCapabilities: ["module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get contact by ID",
    tags: ["contacts"],
    request: { params: contactIdParamsSchema },
    responses: {
      200: { description: "Contact", schema: contactRecordSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof contactIdParamsSchema>;
      const contact = await repo.getById(params.id);
      if (!contact) {
        return new Response(JSON.stringify({ error: "Contact not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const { callGatewayMethod: invokeOperation } = ctx;
      const linkedInvoicesCount = await countLinkedInvoices(
        createRouteGatewayCaller(api, invokeOperation),
        contact.id,
        ctx.auth
      );
      return linkedInvoicesCount === undefined
        ? contact
        : { ...contact, linked_invoices_count: linkedInvoicesCount };
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/contacts/:id",
    operation: {
      requiredCapabilities: ["module.contacts.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Patch contact",
    tags: ["contacts"],
    request: {
      params: contactIdParamsSchema,
      body: contactUpdateSchema,
    },
    responses: {
      200: { description: "Updated contact", schema: contactRecordSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof contactIdParamsSchema>;
      const patch = ctx.body as z.infer<typeof contactUpdateSchema>;
      const updated = await repo.update(params.id, patch);
      if (!updated) {
        return new Response(JSON.stringify({ error: "Contact not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return updated;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/contacts/:id",
    operation: {
      requiredCapabilities: ["module.contacts.write"],
      riskLevel: "critical",
      requiresApproval: true,
    },
    summary: "Delete contact",
    tags: ["contacts"],
    request: { params: contactIdParamsSchema },
    responses: {
      200: {
        description: "Delete result",
        schema: deleteContactResponseSchema,
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof contactIdParamsSchema>;
      const ok = await repo.delete(params.id);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Contact not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return { ok: true as const, id: params.id };
    },
  });
}
