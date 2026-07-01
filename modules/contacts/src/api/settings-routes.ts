import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import {
  contactSettingsInputSchema,
  contactSettingsSchema,
} from "../schema/zod.js";
import type { ContactRepoOrFactory, GetRepoFn } from "./helpers.js";

export function registerSettingsRoutes(
  api: PluginServerApi,
  repoOrFactory: ContactRepoOrFactory,
  getRepoFn: GetRepoFn
) {
  api.registerHttpRoute({
    method: "get",
    path: "/api/contacts/next-reference-id",
    operation: {
      requiredCapabilities: ["module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Generate next reference ID",
    tags: ["contacts"],
    responses: {
      200: {
        description: "Next reference ID",
        schema: z.object({ reference_id: z.string() }),
      },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const settings = await repo.getSettings();
      const prefix = (settings.id_prefix || "C-").replace(
        "{year}",
        new Date().getFullYear().toString()
      );
      const offset = settings.id_offset ?? 1000;
      const postfix = settings.id_postfix ?? "";
      const { data: entities } = await repo.listPaginated({
        pageSize: 1000,
        sortBy: "created_at",
        sortOrder: "desc",
      });
      let maxNumber = offset - 1;
      for (const e of entities) {
        if (e.reference_id) {
          const matches = e.reference_id.match(/\d+/g);
          if (matches) {
            for (const m of matches) {
              const n = Number.parseInt(m, 10);
              if (n >= offset && n > maxNumber) {
                maxNumber = n;
              }
            }
          }
        }
      }
      const reference_id = `${prefix}${maxNumber + 1}${postfix}`;
      return { reference_id };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/contacts/settings",
    operation: {
      requiredCapabilities: ["module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get contacts settings",
    tags: ["contacts", "settings"],
    responses: {
      200: {
        description: "Contacts settings",
        schema: contactSettingsSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      return repo.getSettings();
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/contacts/settings",
    operation: {
      requiredCapabilities: ["module.contacts.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Update contacts settings",
    tags: ["contacts", "settings"],
    request: { body: contactSettingsInputSchema },
    responses: {
      200: {
        description: "Updated settings",
        schema: contactSettingsSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const input = ctx.body as z.infer<typeof contactSettingsInputSchema>;
      return repo.setSettings(input);
    },
  });
}
