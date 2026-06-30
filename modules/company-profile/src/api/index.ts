import { fileStorageTenantObjectKey } from "@engenty/file-storage";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import {
  companyProfileSettingsInputSchema,
  companyProfileSettingsSchema,
} from "../schema/zod.js";
import { registerCompanyProfileGatewayMethods } from "./gateway-methods.js";
import { getRepo, type RepoOrFactory } from "./repo.js";

export function registerCompanyProfileApi(
  server: Pick<
    PluginServerApi,
    "getStorageService" | "registerHttpRoute" | "registerOperation"
  >,
  repoOrFactory: RepoOrFactory
) {
  server.registerHttpRoute({
    method: "get",
    path: "/api/company-profile/settings",
    operation: {
      requiredCapabilities: ["module.company-profile.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get company profile settings",
    tags: ["company-profile", "settings"],
    responses: {
      200: {
        description: "Company profile settings",
        schema: companyProfileSettingsSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.get();
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/company-profile/settings",
    operation: {
      requiredCapabilities: ["module.company-profile.write"],
      riskLevel: "low",
    },
    summary: "Update company profile settings",
    tags: ["company-profile", "settings"],
    request: {
      body: companyProfileSettingsInputSchema,
    },
    responses: {
      200: {
        description: "Updated company profile settings",
        schema: companyProfileSettingsSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const input = ctx.body as z.infer<
        typeof companyProfileSettingsInputSchema
      >;
      return repo.set(input);
    },
  });

  const storage = server.getStorageService?.("files");
  if (storage) {
    server.registerHttpRoute({
      method: "post",
      path: "/api/company-profile/logo-upload",
      operation: {
        requiredCapabilities: ["module.company-profile.write"],
        riskLevel: "low",
      },
      summary: "Upload company logo",
      tags: ["company-profile", "settings"],
      responses: {
        201: {
          description: "Logo uploaded",
          schema: z.object({ logo_url: z.string() }),
        },
      },
      handler: async (ctx) => {
        const formData = await ctx.request.formData();
        const file = formData.get("file") as File | null;
        if (!(file && file instanceof Blob)) {
          return new Response(JSON.stringify({ error: "No file provided" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
        if (!allowed.includes(file.type)) {
          return new Response(
            JSON.stringify({
              error: "Invalid file type. Allowed: PNG, JPEG, GIF, WebP",
            }),
            { status: 400, headers: { "content-type": "application/json" } }
          );
        }
        const ext = file.name.split(".").pop() || "png";
        const tenantId = ctx.auth?.tenantId ?? "unknown";
        const key = fileStorageTenantObjectKey(
          tenantId,
          "company-profile",
          "logos",
          `${Date.now()}_logo.${ext}`
        );
        try {
          await storage.upload(key, file, {
            contentType: file.type,
            upsert: true,
          });
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Upload failed",
            }),
            { status: 500, headers: { "content-type": "application/json" } }
          );
        }
        const logoUrl = await storage.getUrl(key);
        return new Response(JSON.stringify({ logo_url: logoUrl }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    });
  }

  registerCompanyProfileGatewayMethods(server, repoOrFactory, storage);
}
