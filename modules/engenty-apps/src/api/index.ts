import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import {
  appIdParamsSchema,
  appVersionSchema,
  notFoundSchema,
} from "../schema/zod.js";
import {
  type AppsGatewayOptions,
  getRepo,
  type RepoOrFactory,
  registerAppsGatewayMethods,
} from "./gateway-methods.js";

const UUID_PARAM =
  "{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}";

export const APP_BY_ID_PATH = `/api/apps/:id${UUID_PARAM}`;

export function registerAppsApi(
  api: PluginServerApi,
  repoOrFactory: RepoOrFactory,
  gatewayOptions?: AppsGatewayOptions
): void {
  const readApps = () => ({
    idempotent: true,
    moduleId: "engenty-apps",
    requiredCapabilities: ["module.engenty-apps.read"],
    requiresApproval: false,
    riskLevel: "low" as const,
  });

  /**
   * The one HTTP surface this module needs beyond the catalog: apps/ai fetches
   * a version's built frontend to inline into the artifact frame. It is a read
   * of source the tenant already owns, so it rides the ordinary read
   * capability — but it is a route rather than an operation because the
   * response is an HTML document, not a catalog result.
   */
  api.registerHttpRoute({
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as { id: string };
      const app = await repo.getApp(params.id);
      if (!app) {
        return new Response(JSON.stringify({ error: "app_not_found" }), {
          headers: { "content-type": "application/json" },
          status: 404,
        });
      }
      const url = new URL(ctx.request.url);
      const requested = url.searchParams.get("version");
      const version = requested
        ? await repo.getVersionByNumber(params.id, Number(requested))
        : app.active_version_id
          ? await repo.getVersion(app.active_version_id)
          : null;
      if (!version) {
        return new Response(
          JSON.stringify({ error: "app_version_not_found" }),
          {
            headers: { "content-type": "application/json" },
            status: 404,
          }
        );
      }
      // Bundle-mode Apps serve what the build produced; single-file Apps serve
      // the document their entry names. Preferring the built column is what
      // lets both live behind one route with no flag to keep in sync.
      const entry = version.manifest.entry?.frontend ?? "index.html";
      const html = version.frontend_html ?? version.files[entry];
      if (typeof html !== "string") {
        return new Response(JSON.stringify({ error: "app_entry_missing" }), {
          headers: { "content-type": "application/json" },
          status: 404,
        });
      }
      return {
        app_id: app.id,
        html,
        manifest: version.manifest,
        version: version.version,
      };
    },
    method: "get",
    operation: readApps(),
    path: `${APP_BY_ID_PATH}/frontend`,
    request: { params: appIdParamsSchema },
    responses: {
      200: { description: "App frontend document" },
      404: { description: "Not found", schema: notFoundSchema },
    },
    summary: "Get an app version's frontend document",
    tags: ["apps"],
  });

  api.registerHttpRoute({
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as { id: string };
      const versions = await repo.listVersions(params.id);
      return { versions };
    },
    method: "get",
    operation: readApps(),
    path: `${APP_BY_ID_PATH}/versions`,
    request: { params: appIdParamsSchema },
    responses: {
      200: {
        description: "App versions",
        schema: z.object({ versions: z.array(appVersionSchema) }),
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    summary: "List an app's versions",
    tags: ["apps"],
  });

  registerAppsGatewayMethods(api, repoOrFactory, gatewayOptions);
}
