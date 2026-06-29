import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { UserSettingsRepoSupabase } from "../dal/index.js";
import {
  userSettingGetResponseSchema,
  userSettingSetRequestSchema,
  userSettingsBatchSetRequestSchema,
  userSettingsListQuerySchema,
  userSettingsListResponseSchema,
} from "../schema/zod.js";

type RepoOrFactory =
  | UserSettingsRepoSupabase
  | ((auth: PluginAuthContext) => UserSettingsRepoSupabase);

function getRepo(repoOrFactory: RepoOrFactory, auth?: PluginAuthContext) {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required");
    }
    return repoOrFactory(auth);
  }
  return repoOrFactory;
}

export function registerUserSettingsApi(
  server: Pick<PluginServerApi, "registerHttpRoute">,
  repoOrFactory: RepoOrFactory
) {
  server.registerHttpRoute({
    method: "get",
    path: "/api/user-settings",
    operation: {
      operationId: "user_settings_list",
      requiredCapabilities: ["user-settings.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List the current user's settings (optionally by name prefix)",
    tags: ["user-settings"],
    request: {
      query: userSettingsListQuerySchema,
    },
    responses: {
      200: {
        description: "All settings for the user (optionally prefix-filtered)",
        schema: userSettingsListResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const query = (ctx.query ?? {}) as z.infer<
        typeof userSettingsListQuerySchema
      >;
      const settings = await repo.list(query.prefix);
      return Response.json({ settings }, { status: 200 });
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/user-settings",
    operation: {
      operationId: "user_settings_set_many",
      requiredCapabilities: ["user-settings.write"],
      riskLevel: "low",
    },
    summary: "Upsert many user settings in one request",
    tags: ["user-settings"],
    request: {
      body: userSettingsBatchSetRequestSchema,
    },
    responses: {
      200: {
        description: "Updated settings",
        schema: userSettingsListResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const body = ctx.body as z.infer<
        typeof userSettingsBatchSetRequestSchema
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

  server.registerHttpRoute({
    method: "get",
    path: "/api/user-settings/:name",
    operation: {
      operationId: "user_settings_get",
      requiredCapabilities: ["user-settings.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get a user setting by name",
    tags: ["user-settings"],
    request: {
      params: z.object({ name: z.string().min(1) }),
    },
    responses: {
      200: {
        description: "User setting (value null when not found)",
        schema: userSettingGetResponseSchema,
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

  server.registerHttpRoute({
    method: "patch",
    path: "/api/user-settings/:name",
    operation: {
      operationId: "user_settings_set",
      requiredCapabilities: ["user-settings.write"],
      riskLevel: "low",
    },
    summary: "Set a user setting by name",
    tags: ["user-settings"],
    request: {
      params: z.object({ name: z.string().min(1) }),
      body: userSettingSetRequestSchema,
    },
    responses: {
      200: {
        description: "Updated user setting",
        schema: userSettingGetResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const name = (ctx.params as { name: string })?.name;
      const body = ctx.body as z.infer<typeof userSettingSetRequestSchema>;
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

  server.registerHttpRoute({
    method: "delete",
    path: "/api/user-settings/:name",
    operation: {
      operationId: "user_settings_delete",
      requiredCapabilities: ["user-settings.write"],
      riskLevel: "low",
    },
    summary: "Delete a user setting by name",
    tags: ["user-settings"],
    request: {
      params: z.object({ name: z.string().min(1) }),
    },
    responses: {
      200: {
        description: "Deleted user setting",
        schema: z.object({ success: z.boolean() }),
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
      await repo.delete(name);
      return Response.json({ success: true }, { status: 200 });
    },
  });
}
