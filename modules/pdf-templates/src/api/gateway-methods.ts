import {
  pdfTemplateInputSchema,
  pdfTemplatePreviewRequestSchema,
  pdfTemplatePreviewResponseSchema,
  pdfTemplateSchema,
  pdfTemplateUpdateInputSchema,
} from "@engenty/pdf-templates/core";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import { getRepo, type RepoOrFactory } from "./repo.js";

export interface PdfTemplatesGatewayDeps {
  /**
   * Renders markup against a module's sample or record data without saving.
   *
   * Registered as an operation, not just an HTTP route, because it is the only
   * way an agent can find out whether the XML it wrote is valid before it
   * overwrites a template someone prints invoices from.
   */
  buildPreview: (
    input: z.infer<typeof pdfTemplatePreviewRequestSchema>,
    auth: PluginAuthContext
  ) => Promise<z.infer<typeof pdfTemplatePreviewResponseSchema>>;
}

export function registerPdfTemplatesGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation">,
  repoOrFactory: RepoOrFactory,
  deps: PdfTemplatesGatewayDeps
) {
  server.registerOperation({
    operationId: "pdf_templates_list",
    summary:
      "List PDF templates for a module (module_key: offers | invoices). Start here — pdf_templates_get needs an id.",
    moduleId: "pdf-templates",
    requiredCapabilities: ["module.pdf-templates.read"],
    riskLevel: "low",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: z.object({ module_key: z.string().min(1) }),
    outputSchema: z.array(pdfTemplateSchema),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = z
        .object({ module_key: z.string().min(1) })
        .parse(input ?? {});
      return repo.listTemplates(parsed.module_key);
    },
  });

  server.registerOperation({
    operationId: "pdf_templates_get",
    summary: "Get a PDF template by id or default module key",
    moduleId: "pdf-templates",
    requiredCapabilities: ["module.pdf-templates.read"],
    riskLevel: "low",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: z
      .object({
        id: z.string().min(1).optional(),
        module_key: z.string().min(1).optional(),
        use_default: z.boolean().optional(),
      })
      .superRefine((value, ctx) => {
        if (!(value.id || (value.module_key && value.use_default))) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide id or module_key with use_default=true",
            path: [],
          });
        }
      }),
    outputSchema: pdfTemplateSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as {
        id?: string;
        module_key?: string;
        use_default?: boolean;
      };
      if (parsed.id) {
        return repo.getTemplateById(parsed.id);
      }
      return repo.getDefaultTemplate(parsed.module_key ?? "");
    },
  });

  server.registerOperation({
    operationId: "pdf_templates_preview",
    summary:
      "Render markup against sample or record data WITHOUT saving. Returns rendered_xml, the template_data the markup can reference, and input_schema_json. Run this before every create/update.",
    moduleId: "pdf-templates",
    requiredCapabilities: ["module.pdf-templates.read"],
    riskLevel: "low",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: pdfTemplatePreviewRequestSchema,
    outputSchema: pdfTemplatePreviewResponseSchema,
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("Auth context required");
      }
      return deps.buildPreview(
        pdfTemplatePreviewRequestSchema.parse(input ?? {}),
        ctx.auth
      );
    },
  });

  server.registerOperation({
    operationId: "pdf_templates_create",
    summary:
      "Create a PDF template. document_template/stylesheet_template may be null to inherit the module default. Preview the markup first.",
    moduleId: "pdf-templates",
    requiredCapabilities: ["module.pdf-templates.write"],
    riskLevel: "high",
    idempotent: false,
    dryRunSupported: false,
    requiresApproval: true,
    inputSchema: pdfTemplateInputSchema,
    outputSchema: pdfTemplateSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.createTemplate(pdfTemplateInputSchema.parse(input ?? {}));
    },
  });

  server.registerOperation({
    operationId: "pdf_templates_update",
    summary:
      "Patch a PDF template. Only the fields in `patch` change; omit document_template/stylesheet_template to leave the markup alone.",
    moduleId: "pdf-templates",
    requiredCapabilities: ["module.pdf-templates.write"],
    riskLevel: "high",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      patch: pdfTemplateUpdateInputSchema,
    }),
    outputSchema: pdfTemplateSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = z
        .object({ id: z.string().min(1), patch: pdfTemplateUpdateInputSchema })
        .parse(input ?? {});
      const updated = await repo.updateTemplate(parsed.id, parsed.patch);
      if (!updated) {
        throw new Error(`PDF template not found: ${parsed.id}`);
      }
      return updated;
    },
  });

  server.registerOperation({
    operationId: "pdf_templates_delete",
    summary: "Delete a PDF template. Irreversible — confirm with the user.",
    moduleId: "pdf-templates",
    requiredCapabilities: ["module.pdf-templates.write"],
    riskLevel: "high",
    idempotent: false,
    dryRunSupported: false,
    requiresApproval: true,
    inputSchema: z.object({ id: z.string().min(1) }),
    outputSchema: z.object({ id: z.string(), ok: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = z.object({ id: z.string().min(1) }).parse(input ?? {});
      const ok = await repo.deleteTemplate(parsed.id);
      if (!ok) {
        throw new Error(`PDF template not found: ${parsed.id}`);
      }
      return { id: parsed.id, ok: true };
    },
  });
}
