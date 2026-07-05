import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import { commercialSettingsSchema } from "../schema/zod.js";
import { getRepo, type RepoOrFactory } from "./repo.js";

export function registerCommercialSettingsGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation">,
  repoOrFactory: RepoOrFactory
) {
  server.registerOperation({
    operationId: "commercial_settings_get",
    summary: "Get commercial defaults",
    moduleId: "commercial-settings",
    requiredCapabilities: ["module.commercial-settings.read"],
    riskLevel: "low",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: z.object({}).optional(),
    outputSchema: commercialSettingsSchema,
    handler: async (_input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.get();
    },
  });
}
