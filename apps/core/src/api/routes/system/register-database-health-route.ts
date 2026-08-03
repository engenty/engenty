import { apiSuccessSchema } from "@engenty/api-contracts";
import { createLogger } from "@engenty/telemetry";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import type { CoreUsersDal } from "../../../dal/core-users.js";
import { jsonApiError } from "../api-response.js";
import { jsonApiSuccessOrDatabaseDown } from "../user-management/setup-database-errors.js";
import { ErrorSchema } from "../user-management/shared.js";

const logger = createLogger({ name: "system-database-health" });

const DatabaseHealthSchema = z.object({
  database_reachable: z.literal(true),
});

export function registerSystemDatabaseHealthRoute(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  getDal: () => CoreUsersDal;
}) {
  const route = createRoute({
    method: "get",
    path: "/api/system/database-health",
    tags: ["system"],
    summary: "Verify database connectivity (public, no auth)",
    responses: {
      200: {
        description: "Database reachable",
        content: {
          "application/json": {
            schema: apiSuccessSchema(DatabaseHealthSchema),
          },
        },
      },
      503: {
        description: "Database unreachable",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  (params.app as OpenAPIHono).openapi(route, async (c) => {
    let dal: CoreUsersDal;
    try {
      dal = params.getDal();
    } catch (error) {
      logger.warn("database_health_config_error", {
        err: error instanceof Error ? error.message : String(error),
      });
      // `as never`, the convention this codebase uses for zod-openapi
      // handlers: the shared jsonApi* helpers return a plain Response, while
      // `.openapi()` wants a response typed against the route's declared
      // schemas. Both bodies here DO match ErrorSchema / apiSuccessSchema.
      return jsonApiError(c, 500, {
        message:
          error instanceof Error ? error.message : "Configuration error.",
      }) as never;
    }

    return jsonApiSuccessOrDatabaseDown(c, params.config, async () => {
      await dal.getSetupStatus();
      return { database_reachable: true as const };
    }) as never;
  });
}
