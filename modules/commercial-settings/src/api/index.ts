import type { PluginServerApi } from "@engenty/plugin-sdk";
import type { z } from "@hono/zod-openapi";
import {
  commercialSettingsInputSchema,
  commercialSettingsSchema,
} from "../schema/zod.js";
import { registerCommercialSettingsGatewayMethods } from "./gateway-methods.js";
import { getRepo, type RepoOrFactory } from "./repo.js";

export function registerCommercialSettingsApi(
  server: Pick<PluginServerApi, "registerHttpRoute" | "registerOperation">,
  repoOrFactory: RepoOrFactory
) {
  server.registerHttpRoute({
    method: "get",
    path: "/api/commercial-settings",
    operation: {
      requiredCapabilities: ["module.commercial-settings.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get commercial settings",
    tags: ["commercial-settings", "settings"],
    responses: {
      200: {
        description: "Commercial settings",
        schema: commercialSettingsSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.get();
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/commercial-settings",
    operation: {
      requiredCapabilities: ["module.commercial-settings.write"],
      riskLevel: "low",
    },
    summary: "Update commercial settings",
    tags: ["commercial-settings", "settings"],
    request: {
      body: commercialSettingsInputSchema,
    },
    responses: {
      200: {
        description: "Updated commercial settings",
        schema: commercialSettingsSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const input = ctx.body as z.infer<typeof commercialSettingsInputSchema>;
      return repo.set(input);
    },
  });

  registerCommercialSettingsGatewayMethods(server, repoOrFactory);
}
