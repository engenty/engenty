import type { OpenAPIHono } from "@hono/zod-openapi";
import { jsonApiError } from "./api-response.js";

export const CORE_AI_REMOVED_FROM_CORE_MESSAGE =
  "Core AI runtime was retired (schema-split 2026-05-21). Rebuild on apps/ai — gateway /ai and VITE_ENGENTY_AI_BASE_URL. UI packages unchanged; wire to apps/ai when ready.";

export const CORE_DASHBOARD_AI_REMOVED_MESSAGE =
  "Dashboard widget AI generation was retired from apps/core (2026-05-21). Rebuild on apps/ai.";

function registerRemovedPrefix(app: OpenAPIHono, prefix: string) {
  app.all(`${prefix}/*`, (c) =>
    jsonApiError(c, 404, { message: CORE_AI_REMOVED_FROM_CORE_MESSAGE })
  );
  app.all(prefix, (c) =>
    jsonApiError(c, 404, { message: CORE_AI_REMOVED_FROM_CORE_MESSAGE })
  );
}

/** Fail-fast stubs for legacy core /api/admin/ai and /api/ai surfaces (ai-ui unchanged). */
export function registerCoreAiRemovedRoutes(app: OpenAPIHono) {
  registerRemovedPrefix(app, "/api/admin/ai");
  registerRemovedPrefix(app, "/api/ai");
}
