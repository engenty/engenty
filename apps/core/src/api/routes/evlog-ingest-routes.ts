import type { OpenAPIHono } from "@hono/zod-openapi";
import { createBootApiLogger, initEvlog } from "../../observability/evlog.js";

const VALID_LEVELS = ["info", "error", "warn", "debug"] as const;

/**
 * Register the client log ingest endpoint. Accepts structured events from the
 * frontend and logs them server-side. Origin validation is left to CORS config.
 */
export function registerEvlogIngestRoutes(params: { app: OpenAPIHono }) {
  const { app } = params;

  app.post("/api/evlog/ingest", async (c) => {
    const origin = c.req.header("origin");
    const host = c.req.header("host");
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        const requestHost = new URL(`http://${host}`).host;
        if (originHost !== requestHost) {
          return c.json({ error: "Invalid origin" }, 403);
        }
      } catch {
        return c.json({ error: "Invalid origin" }, 403);
      }
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("timestamp" in body) ||
      !("level" in body) ||
      !VALID_LEVELS.includes((body as { level: string }).level)
    ) {
      return c.json(
        {
          error: "Invalid payload",
          detail: "timestamp and level (info|error|warn|debug) required",
        },
        400
      );
    }

    initEvlog();
    const { level, timestamp, ...rest } = body as {
      level: (typeof VALID_LEVELS)[number];
      timestamp: string;
      [k: string]: unknown;
    };
    const sanitized = { ...rest, service: "engenty-ui", source: "client" };
    const logger = createBootApiLogger();
    switch (level) {
      case "error":
        logger.error(
          typeof sanitized.message === "string"
            ? sanitized.message
            : JSON.stringify(sanitized)
        );
        break;
      case "warn":
        logger.warn(
          typeof sanitized.message === "string"
            ? sanitized.message
            : JSON.stringify(sanitized)
        );
        break;
      case "debug":
        logger.debug(
          typeof sanitized.message === "string"
            ? sanitized.message
            : JSON.stringify(sanitized)
        );
        break;
      default:
        logger.info(
          typeof sanitized.message === "string"
            ? sanitized.message
            : JSON.stringify(sanitized)
        );
    }

    return new Response(null, { status: 204 });
  });
}
