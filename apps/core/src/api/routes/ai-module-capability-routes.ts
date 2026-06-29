import { listModuleDynamicCapabilitySeeds } from "@engenty/ai-core";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { resolveRouteAuth } from "./authz.js";

export function registerAiModuleCapabilityRoutes(
  app: OpenAPIHono,
  config: Record<string, unknown>
) {
  app.get("/api/tools/module-capabilities", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }

    return jsonApiSuccess(c, {
      capabilities: listModuleDynamicCapabilitySeeds(),
    });
  });
}
