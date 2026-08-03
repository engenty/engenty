import type { OpenAPIHono } from "@hono/zod-openapi";
import { createBootApiLogger, initEvlog } from "../../observability/evlog.js";

const VALID_LEVELS = ["info", "error", "warn", "debug"] as const;

type EvlogLevel = (typeof VALID_LEVELS)[number];

/** Narrows an arbitrary client-supplied level to one we will actually log. */
function isValidLevel(value: unknown): value is EvlogLevel {
  return VALID_LEVELS.includes(value as EvlogLevel);
}

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
      !isValidLevel((body as { level: unknown }).level)
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
      level: EvlogLevel;
      timestamp: string;
      [k: string]: unknown;
    };
    // Annotated because spreading `rest` drops its index signature, leaving
    // `{ service, source }` — which is why `sanitized.message` did not
    // typecheck even though the client always sends one.
    const sanitized: Record<string, unknown> = {
      ...rest,
      service: "engenty-ui",
      source: "client",
    };
    const line =
      typeof sanitized.message === "string"
        ? sanitized.message
        : JSON.stringify(sanitized);
    const logger = createBootApiLogger();
    switch (level) {
      case "error":
        logger.error(line);
        break;
      case "warn":
        logger.warn(line);
        break;
      case "debug":
        logger.debug(line);
        break;
      default:
        logger.info(line);
    }

    return new Response(null, { status: 204 });
  });
}
