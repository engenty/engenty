import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { TenantSettingsRepoSupabase } from "../dal/index.js";
import {
  tenantSettingGetResponseSchema,
  tenantSettingSetRequestSchema,
  tenantSettingsBatchSetRequestSchema,
  tenantSettingsListQuerySchema,
  tenantSettingsListResponseSchema,
} from "../schema/zod.js";

type RepoOrFactory =
  | TenantSettingsRepoSupabase
  | ((auth: PluginAuthContext) => TenantSettingsRepoSupabase);

function getRepo(repoOrFactory: RepoOrFactory, auth?: PluginAuthContext) {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required");
    }
    return repoOrFactory(auth);
  }
  return repoOrFactory;
}

export function registerTenantSettingsApi(
  api: Pick<PluginServerApi, "registerHttpRoute">,
  repoOrFactory: RepoOrFactory
) {
  api.registerHttpRoute({
    method: "get",
    path: "/api/tenant-settings",
    operation: {
      requiredCapabilities: ["tenant-settings.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List tenant settings (optionally by name prefix)",
    tags: ["tenant-settings"],
    request: {
      query: tenantSettingsListQuerySchema,
    },
    responses: {
      200: {
        description: "All settings for the tenant scope (optionally filtered)",
        schema: tenantSettingsListResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const query = (ctx.query ?? {}) as z.infer<
        typeof tenantSettingsListQuerySchema
      >;
      const settings = await repo.list(query.prefix);
      return Response.json({ settings }, { status: 200 });
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/tenant-settings",
    operation: {
      requiredCapabilities: ["tenant-settings.write"],
      riskLevel: "low",
    },
    summary: "Upsert many tenant settings in one request",
    tags: ["tenant-settings"],
    request: {
      body: tenantSettingsBatchSetRequestSchema,
    },
    responses: {
      200: {
        description: "Updated settings",
        schema: tenantSettingsListResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const body = ctx.body as z.infer<
        typeof tenantSettingsBatchSetRequestSchema
      >;
      const settings = await repo.setMany(
        body.settings.map((item) => ({
          name: item.name,
          type: item.type,
          value_string: item.value_string,
          value_jsonb: item.value_jsonb,
          value_numeric: item.value_numeric,
          value_boolean: item.value_boolean,
        }))
      );
      return Response.json({ settings }, { status: 200 });
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/tenant-settings/:name",
    operation: {
      requiredCapabilities: ["tenant-settings.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get a tenant setting by name",
    tags: ["tenant-settings"],
    request: {
      params: z.object({ name: z.string().min(1) }),
    },
    responses: {
      200: {
        description: "Tenant setting (value null when not found)",
        schema: tenantSettingGetResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const name = (ctx.params as { name: string })?.name;
      if (!name) {
        return new Response(JSON.stringify({ error: "Missing name" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      const result = await repo.get(name);
      if (!result) {
        return Response.json(
          { name, type: "string" as const, value: null },
          { status: 200 }
        );
      }
      return result;
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/tenant-settings/:name",
    operation: {
      requiredCapabilities: ["tenant-settings.write"],
      riskLevel: "low",
    },
    summary: "Set a tenant setting by name",
    tags: ["tenant-settings"],
    request: {
      params: z.object({ name: z.string().min(1) }),
      body: tenantSettingSetRequestSchema,
    },
    responses: {
      200: {
        description: "Updated tenant setting",
        schema: tenantSettingGetResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const name = (ctx.params as { name: string })?.name;
      const body = ctx.body as z.infer<typeof tenantSettingSetRequestSchema>;
      if (!name) {
        return new Response(JSON.stringify({ error: "Missing name" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      const result = await repo.set({
        name,
        type: body.type,
        value_string: body.value_string,
        value_jsonb: body.value_jsonb,
        value_numeric: body.value_numeric,
        value_boolean: body.value_boolean,
      });
      return result;
    },
  });
}
