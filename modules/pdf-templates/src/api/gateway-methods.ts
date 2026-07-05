import { pdfTemplateSchema } from "@engenty/pdf-templates/core";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import { getRepo, type RepoOrFactory } from "./repo.js";

export function registerPdfTemplatesGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation">,
  repoOrFactory: RepoOrFactory
) {
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
}
