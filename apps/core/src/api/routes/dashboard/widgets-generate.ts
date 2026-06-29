import { jsonApiError } from "../api-response.js";
import { requireAuth } from "../authz.js";
import { CORE_DASHBOARD_AI_REMOVED_MESSAGE } from "../core-ai-removed-routes.js";
import type { RegisterDashboardParams } from "./shared.js";

/** Retired — dashboard widget AI lived under archived apps/core/ai (see core-ai-retirement.md). */
export function registerDashboardWidgetsGenerate(
  params: RegisterDashboardParams
): void {
  const { app, config } = params;

  app.post("/api/dashboard/widgets/generate", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    return jsonApiError(c, 503, { message: CORE_DASHBOARD_AI_REMOVED_MESSAGE });
  });
}
