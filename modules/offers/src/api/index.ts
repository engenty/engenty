import { renderPdfTemplate } from "@engenty/pdf-service";
import {
  buildPdfTemplateRenderData,
  getPdfTemplateServerProvider,
} from "@engenty/pdf-templates/core";
import {
  createPluginServerGatewayCaller,
  type PluginAuthContext,
  type PluginServerApi,
  type PluginServerGatewayCaller,
} from "@engenty/plugin-sdk";

async function ensureClientRoleOnEntity(
  hasOperation: PluginServerApi["hasOperation"],
  invokeOperation: PluginServerGatewayCaller["invokeOperation"],
  clientId: string | null | undefined,
  auth?: PluginAuthContext
): Promise<void> {
  const id = typeof clientId === "string" ? clientId.trim() : "";
  if (!(id && hasOperation("contacts_add_contact_role"))) {
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

import type { z } from "@hono/zod-openapi";
import type { createOfferRepoSupabase } from "../dal/supabase.js";
import {
  deleteOfferResponseSchema,
  notFoundSchema,
  offerBlocksReplaceSchema,
  offerBlocksResponseSchema,
  offerIdParamsSchema,
  offerInputSchema,
  offerNumberCheckQuerySchema,
  offerNumberCheckResponseSchema,
  offerNumberNextResponseSchema,
  offerSchema,
  offerSettingsInputSchema,
  offerSettingsSchema,
  offersListQuerySchema,
  offersPaginatedResponseSchema,
  offerTemplateResponseSchema,
  offerTemplateSetDefaultSchema,
  offerTemplatesResponseSchema,
  offerUpdateSchema,
  offerVersionsResponseSchema,
} from "../schema/zod.js";
import { registerOffersGatewayMethods } from "./gateway-methods.js";

type OfferRepo = ReturnType<typeof createOfferRepoSupabase>;
type RepoOrFactory = OfferRepo | ((auth: PluginAuthContext) => OfferRepo);

function getRepo(
  repoOrFactory: RepoOrFactory,
  auth?: PluginAuthContext
): OfferRepo {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required for server-first repo");
    }
    return repoOrFactory(auth);
  }
  return repoOrFactory;
}

export function registerOffersApi(
  server: Pick<
    PluginServerApi,
    | "callGatewayMethod"
    | "getTenantDb"
    | "hasOperation"
    | "registerHttpRoute"
    | "registerOperation"
  >,
  repoOrFactory: RepoOrFactory
) {
  // Agent-callable module operations (offers_list/get/create/…). The HTTP
  // routes below serve the UI only and never enter the tools catalog.
  registerOffersGatewayMethods(server, repoOrFactory, getRepo);

  const { invokeOperation } = createPluginServerGatewayCaller(
    server as PluginServerApi
  );

  server.registerHttpRoute({
    method: "get",
    path: "/api/offers",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List offers",
    tags: ["offers"],
    request: { query: offersListQuerySchema },
    responses: {
      200: {
        description: "Offers paginated list",
        schema: offersPaginatedResponseSchema,
      },
    },
    handler: (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      const parsed = offersListQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        sortBy: url.searchParams.get("sortBy") ?? undefined,
        sortOrder: url.searchParams.get("sortOrder") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        client_id: url.searchParams.get("client_id") ?? undefined,
      });
      return repo.listPaginated(parsed);
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/offers/:id/pdf",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Generate offer PDF",
    tags: ["offers", "pdf"],
    request: { params: offerIdParamsSchema },
    responseMode: "binary",
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof offerIdParamsSchema>;
      const offer = await repo.getById(params.id);
      if (!offer) {
        return new Response(JSON.stringify({ error: "Offer not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }

      const template = (await invokeOperation(
        "pdf_templates_get",
        offer.template_id
          ? { id: offer.template_id }
          : { module_key: "offers", use_default: true },
        { auth: ctx.auth }
      )) as {
        document_template: string | null;
        name: string;
        settings_json: Record<string, unknown>;
        stylesheet_template: string | null;
      } | null;

      const provider = getPdfTemplateServerProvider("offers");
      if (!(provider?.resolvePreviewData && ctx.auth)) {
        throw new Error("Offers PDF template provider unavailable");
      }

      // No tenant template yet, or NULL markup (tenant never edited it) →
      // render with the provider's built-in default so PDF export works out
      // of the box and provider improvements reach untouched templates.
      const settingsJson = (template?.settings_json ??
        provider.settingsDefaults) as Parameters<
        typeof buildPdfTemplateRenderData
      >[0];
      const documentTemplateXml =
        template?.document_template ?? provider.defaultDocumentTemplate;
      const stylesheetTemplate =
        template?.stylesheet_template ?? provider.defaultStylesheetTemplate;

      const data = await provider.resolvePreviewData({
        auth: ctx.auth,
        recordId: params.id,
      });
      const buffer = await renderPdfTemplate({
        data: buildPdfTemplateRenderData(settingsJson, data),
        documentTemplateXml,
        styling: stylesheetTemplate,
      });
      const filename =
        offer.offer_number?.trim() || offer.title?.trim() || "offer-preview";
      return new Response(buffer as BodyInit, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="${filename.replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf"`,
        },
      });
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/offers/number/check",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Check offer number availability",
    tags: ["offers"],
    request: { query: offerNumberCheckQuerySchema },
    responses: {
      200: {
        description: "Availability",
        schema: offerNumberCheckResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      const query = offerNumberCheckQuerySchema.parse({
        value: url.searchParams.get("value") ?? undefined,
        excludeId: url.searchParams.get("excludeId") ?? undefined,
      });
      const existing = await repo.getByNumber(query.value);
      const available = !existing || existing.id === query.excludeId;
      return { available };
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/offers/number/next",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get next generated offer number",
    tags: ["offers"],
    responses: {
      200: {
        description: "Next offer number",
        schema: offerNumberNextResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const offer_number = await repo.getNextOfferNumber();
      return { offer_number };
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/offers/templates",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List offer templates",
    tags: ["offers", "templates"],
    responses: {
      200: {
        description: "Offer templates",
        schema: offerTemplatesResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const data = await repo.listTemplates();
      return { data };
    },
  });

  server.registerHttpRoute({
    method: "put",
    path: "/api/offers/templates/default",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Set default offer template",
    tags: ["offers", "templates"],
    request: { body: offerTemplateSetDefaultSchema },
    responses: {
      200: {
        description: "Default offer template",
        schema: offerTemplateResponseSchema,
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const body = ctx.body as z.infer<typeof offerTemplateSetDefaultSchema>;
      const data = await repo.setDefaultTemplate(body.templateId);
      if (!data) {
        return new Response(JSON.stringify({ error: "Template not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return { data };
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/offers/settings",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get offer settings",
    tags: ["offers", "settings"],
    responses: {
      200: { description: "Offer settings", schema: offerSettingsSchema },
    },
    handler: (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.getSettings();
    },
  });

  server.registerHttpRoute({
    method: "put",
    path: "/api/offers/settings",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Update offer settings",
    tags: ["offers", "settings"],
    request: { body: offerSettingsInputSchema },
    responses: {
      200: { description: "Offer settings", schema: offerSettingsSchema },
    },
    handler: (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const body = ctx.body as z.infer<typeof offerSettingsInputSchema>;
      return repo.setSettings(body);
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/offers/:id",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get offer by ID",
    tags: ["offers"],
    request: { params: offerIdParamsSchema },
    responses: {
      200: { description: "Offer", schema: offerSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof offerIdParamsSchema>;
      const offer = await repo.getById(params.id);
      if (!offer) {
        return new Response(JSON.stringify({ error: "Offer not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return offer;
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/offers",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Create offer",
    tags: ["offers"],
    request: { body: offerInputSchema },
    responses: {
      201: { description: "Created offer", schema: offerSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const body = ctx.body as z.infer<typeof offerInputSchema>;
      const created = await repo.create(body);
      await ensureClientRoleOnEntity(
        server.hasOperation,
        invokeOperation,
        body.client_id,
        ctx.auth
      );
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/offers/:id",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Update offer",
    tags: ["offers"],
    request: {
      params: offerIdParamsSchema,
      body: offerUpdateSchema,
    },
    responses: {
      200: { description: "Updated offer", schema: offerSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof offerIdParamsSchema>;
      const patch = ctx.body as z.infer<typeof offerUpdateSchema>;
      const updated = await repo.update(params.id, patch);
      if (!updated) {
        return new Response(JSON.stringify({ error: "Offer not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      if (patch.client_id !== undefined) {
        await ensureClientRoleOnEntity(
          server.hasOperation,
          invokeOperation,
          patch.client_id,
          ctx.auth
        );
      }
      return updated;
    },
  });

  server.registerHttpRoute({
    method: "delete",
    path: "/api/offers/:id",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.write"],
      riskLevel: "critical",
      requiresApproval: true,
    },
    summary: "Delete offer",
    tags: ["offers"],
    request: { params: offerIdParamsSchema },
    responses: {
      200: { description: "Deleted", schema: deleteOfferResponseSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof offerIdParamsSchema>;
      const ok = await repo.delete(params.id);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Offer not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return { ok: true as const, id: params.id };
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/offers/:id/blocks",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List offer blocks",
    tags: ["offers", "blocks"],
    request: { params: offerIdParamsSchema },
    responses: {
      200: { description: "Offer blocks", schema: offerBlocksResponseSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof offerIdParamsSchema>;
      const data = await repo.listBlocks(params.id);
      return { data };
    },
  });

  server.registerHttpRoute({
    method: "put",
    path: "/api/offers/:id/blocks",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Replace offer blocks",
    tags: ["offers", "blocks"],
    request: {
      params: offerIdParamsSchema,
      body: offerBlocksReplaceSchema,
    },
    responses: {
      200: { description: "Offer blocks", schema: offerBlocksResponseSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof offerIdParamsSchema>;
      const body = ctx.body as z.infer<typeof offerBlocksReplaceSchema>;
      const data = await repo.replaceBlocks(params.id, body.blocks);
      return { data };
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/offers/:id/versions",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List offer versions",
    tags: ["offers", "versions"],
    request: { params: offerIdParamsSchema },
    responses: {
      200: {
        description: "Offer versions",
        schema: offerVersionsResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof offerIdParamsSchema>;
      const data = await repo.listVersions(params.id);
      return { data };
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/offers/:id/versions",
    operation: {
      moduleId: "offers",
      requiredCapabilities: ["module.offers.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Create a new offer version (duplicate as draft)",
    tags: ["offers", "versions"],
    request: { params: offerIdParamsSchema },
    responses: {
      201: { description: "Created offer version", schema: offerSchema },
      404: { description: "Offer not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof offerIdParamsSchema>;
      const created = await repo.duplicateAsNewVersion(params.id);
      if (!created) {
        return new Response(JSON.stringify({ error: "Offer not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return created;
    },
  });
}
