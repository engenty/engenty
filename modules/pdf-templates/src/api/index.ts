import { fileStorageTenantObjectKey } from "@engenty/file-storage";
import {
  preparePdfTemplatePreview,
  renderPdfTemplate,
} from "@engenty/pdf-service";
import {
  buildPdfTemplateRenderData,
  getPdfTemplateServerProvider,
  pdfTemplateInputSchema,
  pdfTemplatePreviewRequestSchema,
  pdfTemplatePreviewResponseSchema,
  pdfTemplateSchema,
  pdfTemplateUpdateInputSchema,
} from "@engenty/pdf-templates/core";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import {
  pdfTemplateAssetUploadResponseSchema,
  pdfTemplateIdParamsSchema,
  pdfTemplateListQuerySchema,
} from "../schema/zod.js";
import { registerPdfTemplatesGatewayMethods } from "./gateway-methods.js";
import { getRepo, type RepoOrFactory } from "./repo.js";

type PdfTemplatesServerApi = Pick<
  PluginServerApi,
  "getStorageService" | "registerHttpRoute" | "registerOperation"
>;

async function buildProviderPreviewData(
  body: z.infer<typeof pdfTemplatePreviewRequestSchema>,
  auth: PluginAuthContext
) {
  const provider = getPdfTemplateServerProvider(body.module_key);
  if (!provider) {
    throw new Error(`Unknown PDF template module "${body.module_key}"`);
  }

  const moduleData =
    body.preview_source.kind === "sample"
      ? await provider.buildSampleData()
      : await provider.resolvePreviewData?.({
          auth,
          recordId: body.preview_source.record_id,
        });

  if (!moduleData) {
    throw new Error("No preview data available for this source.");
  }

  return {
    provider,
    renderData: buildPdfTemplateRenderData(body.settings_json, moduleData),
  };
}

const FILES_BUCKET = "files";

export function registerPdfTemplatesApi(
  api: PdfTemplatesServerApi,
  repoOrFactory: RepoOrFactory
) {
  api.registerHttpRoute({
    method: "get",
    path: "/api/pdf-templates/templates",
    operation: {
      moduleId: "pdf-templates",
      requiredCapabilities: ["module.pdf-templates.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List PDF templates",
    tags: ["pdf-templates"],
    request: { query: pdfTemplateListQuerySchema },
    responses: {
      200: {
        description: "PDF templates",
        schema: z.object({ data: z.array(pdfTemplateSchema) }),
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      const query = pdfTemplateListQuerySchema.parse({
        module_key: url.searchParams.get("module_key") ?? undefined,
      });
      return { data: await repo.listTemplates(query.module_key) };
    },
  });

  registerPdfTemplatesGatewayMethods(api, repoOrFactory);

  api.registerHttpRoute({
    method: "post",
    path: "/api/pdf-templates/templates",
    operation: {
      moduleId: "pdf-templates",
      requiredCapabilities: ["module.pdf-templates.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Create PDF template",
    tags: ["pdf-templates"],
    request: { body: pdfTemplateInputSchema },
    responses: {
      200: {
        description: "Created PDF template",
        schema: pdfTemplateSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const body = ctx.body as z.infer<typeof pdfTemplateInputSchema>;
      return repo.createTemplate(body);
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/pdf-templates/templates/:id",
    operation: {
      moduleId: "pdf-templates",
      requiredCapabilities: ["module.pdf-templates.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Update PDF template",
    tags: ["pdf-templates"],
    request: {
      params: pdfTemplateIdParamsSchema,
      body: pdfTemplateUpdateInputSchema,
    },
    responses: {
      200: {
        description: "Updated PDF template",
        schema: pdfTemplateSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof pdfTemplateIdParamsSchema>;
      const patch = ctx.body as z.infer<typeof pdfTemplateUpdateInputSchema>;
      const updated = await repo.updateTemplate(params.id, patch);
      if (!updated) {
        return new Response(JSON.stringify({ error: "Template not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return updated;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/pdf-templates/templates/:id",
    operation: {
      moduleId: "pdf-templates",
      requiredCapabilities: ["module.pdf-templates.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Delete PDF template",
    tags: ["pdf-templates"],
    request: {
      params: pdfTemplateIdParamsSchema,
    },
    responses: {
      200: {
        description: "Deleted",
        schema: z.object({ ok: z.boolean(), id: z.string() }),
      },
      404: {
        description: "Template not found",
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof pdfTemplateIdParamsSchema>;
      const ok = await repo.deleteTemplate(params.id);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Template not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return { ok: true, id: params.id };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/pdf-templates/preview/data",
    operation: {
      moduleId: "pdf-templates",
      requiredCapabilities: ["module.pdf-templates.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Preview PDF template data and rendered XML",
    tags: ["pdf-templates", "preview"],
    request: { body: pdfTemplatePreviewRequestSchema },
    responses: {
      200: {
        description: "Preview data",
        schema: pdfTemplatePreviewResponseSchema,
      },
    },
    handler: async (ctx) => {
      if (!ctx.auth) {
        throw new Error("Auth context required");
      }
      const body = ctx.body as z.infer<typeof pdfTemplatePreviewRequestSchema>;
      const { provider, renderData } = await buildProviderPreviewData(
        body,
        ctx.auth
      );
      const preview = await preparePdfTemplatePreview({
        data: renderData,
        documentTemplateXml: body.document_template,
        styling: body.stylesheet_template,
      });

      return {
        template_data: renderData,
        rendered_xml: preview.renderedXml,
        input_schema_json: z.toJSONSchema(provider.inputSchema) as Record<
          string,
          unknown
        >,
      };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/pdf-templates/preview/pdf",
    operation: {
      moduleId: "pdf-templates",
      requiredCapabilities: ["module.pdf-templates.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Preview PDF template as PDF",
    tags: ["pdf-templates", "preview"],
    request: { body: pdfTemplatePreviewRequestSchema },
    responseMode: "binary",
    handler: async (ctx) => {
      if (!ctx.auth) {
        throw new Error("Auth context required");
      }
      const body = ctx.body as z.infer<typeof pdfTemplatePreviewRequestSchema>;
      const { renderData } = await buildProviderPreviewData(body, ctx.auth);
      const buffer = await renderPdfTemplate({
        data: renderData,
        documentTemplateXml: body.document_template,
        styling: body.stylesheet_template,
      });
      return new Response(buffer as BodyInit, {
        headers: { "content-type": "application/pdf" },
      });
    },
  });

  const storage = api.getStorageService?.(FILES_BUCKET);
  if (storage) {
    api.registerHttpRoute({
      method: "post",
      path: "/api/pdf-templates/assets/upload",
      operation: {
        moduleId: "pdf-templates",
        requiredCapabilities: ["module.pdf-templates.write"],
        riskLevel: "medium",
        requiresApproval: true,
      },
      summary: "Upload PDF template asset",
      tags: ["pdf-templates", "assets"],
      responses: {
        201: {
          description: "Uploaded asset",
          schema: pdfTemplateAssetUploadResponseSchema,
        },
      },
      handler: async (ctx) => {
        const formData = await ctx.request.formData();
        const file = formData.get("file");
        if (!(file instanceof Blob)) {
          return new Response(JSON.stringify({ error: "No file provided" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const ext =
          "name" in file ? String(file.name).split(".").pop() || "png" : "png";
        const tenantId = ctx.auth?.tenantId ?? "unknown";
        const key = fileStorageTenantObjectKey(
          tenantId,
          "pdf-templates",
          "assets",
          `${Date.now()}_asset.${ext}`
        );
        await storage.upload(key, file, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });
        const assetUrl = await storage.getUrl(key);
        return new Response(JSON.stringify({ asset_url: assetUrl }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    });
  }
}
