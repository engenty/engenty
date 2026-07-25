import { createLogger } from "@engenty/telemetry";
import { Hono } from "hono";
import { z } from "zod";
import type { AppHostConfig } from "./config.js";
import { AppBuildFailure, type AppRuntime, assertAppId } from "./runtime.js";

const logger = createLogger({ name: "apps/app-host" });

const deployBodySchema = z.object({
  files: z.record(z.string(), z.string()),
});

const requestBodySchema = z.object({
  body: z.string().nullish(),
  headers: z.record(z.string(), z.string()).optional(),
  method: z.string().default("GET"),
  path: z.string().default("/"),
});

export function createAppHost(options: {
  config: AppHostConfig;
  runtime: AppRuntime;
}): Hono {
  const { config, runtime } = options;
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, service: "app-host" }));

  /**
   * Every other route is internal, server-to-server, and gated on a shared
   * secret. There is no browser path into this service: it publishes no port
   * and has no gateway target (PLAN-engenty-apps.md §2.3).
   */
  app.use("/internal/*", async (c, next) => {
    if (!config.internalToken) {
      // Only reachable outside production — loadAppHostConfig refuses to boot
      // a production process without a token.
      logger.warn(
        "ENGENTY_APP_HOST_TOKEN is unset — internal routes are unauthenticated"
      );
      return await next();
    }
    const presented = c.req.header("authorization");
    if (presented !== `Bearer ${config.internalToken}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return await next();
  });

  /**
   * Reject a malformed app id once, here, so a bad id is a 400 rather than
   * surfacing as a runtime failure from whichever handler happened to touch it.
   */
  app.use("/internal/apps/:appId/*", async (c, next) => {
    try {
      assertAppId(c.req.param("appId"));
    } catch (error) {
      return c.json(
        {
          error: "invalid_app_id",
          message: error instanceof Error ? error.message : String(error),
        },
        400
      );
    }
    return await next();
  });

  app.post("/internal/apps/:appId/deploy", async (c) => {
    const appId = c.req.param("appId");
    const parsed = deployBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    try {
      const result = await runtime.deploy({ appId, files: parsed.data.files });
      return c.json({ deployment: result, ok: true });
    } catch (error) {
      if (error instanceof AppBuildFailure) {
        // 422, not 500: the source is the problem, and the build log is the
        // payload engenty.coder iterates against.
        return c.json({ error: "build_failed", ...error.detail }, 422);
      }
      logger.error("deploy failed", {
        appId,
        message: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: "deploy_failed",
          message: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });

  app.post("/internal/apps/:appId/request", async (c) => {
    const appId = c.req.param("appId");
    const parsed = requestBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    try {
      const response = await runtime.request(appId, parsed.data);
      return c.json({ ok: true, response });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const aborted = error instanceof Error && error.name === "AbortError";
      logger.warn("guest request failed", { appId, message });
      return c.json(
        { error: aborted ? "guest_timeout" : "guest_request_failed", message },
        aborted ? 504 : 502
      );
    }
  });

  app.delete("/internal/apps/:appId", async (c) => {
    const appId = c.req.param("appId");
    try {
      const result = await runtime.destroy(appId);
      return c.json({ deployment: result, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("destroy failed", { appId, message });
      return c.json({ error: "destroy_failed", message }, 500);
    }
  });

  return app;
}
