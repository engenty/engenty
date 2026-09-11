import { createLogger } from "@engenty/telemetry";
import { Hono } from "hono";
import { z } from "zod";
import type { AppStore } from "./app-store.js";
import type { AppHostConfig } from "./config.js";
import { AppBuildFailure, type AppRuntime, assertAppId } from "./runtime.js";

const logger = createLogger({ name: "apps/app-host" });

/** Where the App lives on the spaces tree — see app-store.ts. */
const placementSchema = z.object({
  slug: z.string(),
  space_id: z.string().nullable(),
  tenant_id: z.string(),
});

const deployBodySchema = z.object({
  app: placementSchema,
  files: z.record(z.string(), z.string()),
});

const sourceWriteBodySchema = z.object({
  app: placementSchema,
  delete: z.array(z.string()).max(1000).optional(),
  files: z.record(z.string(), z.string()).optional(),
  message: z.string().min(1).max(500),
});

const destroyBodySchema = z.object({ app: placementSchema });

const requestBodySchema = z.object({
  body: z.string().nullish(),
  headers: z.record(z.string(), z.string()).optional(),
  method: z.string().default("GET"),
  path: z.string().default("/"),
});

function toPlacement(input: z.infer<typeof placementSchema>) {
  return {
    slug: input.slug,
    spaceId: input.space_id,
    tenantId: input.tenant_id,
  };
}

export function createAppHost(options: {
  config: AppHostConfig;
  runtime: AppRuntime;
  store: AppStore;
}): Hono {
  const { config, runtime, store } = options;
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, service: "app-host" }));

  /**
   * Every other route is internal, server-to-server, and gated on a shared
   * secret. There is no browser path into this service: it publishes no port
   * and has no gateway target, because it runs tenant-authored code.
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
      return c.json(
        { error: "invalid_body", issues: parsed.error.issues },
        400
      );
    }
    try {
      const result = await runtime.deploy({
        app: toPlacement(parsed.data.app),
        appId,
        files: parsed.data.files,
      });
      return c.json({ deployment: result, ok: true });
    } catch (error) {
      if (error instanceof AppBuildFailure) {
        // 422, not 500: the source is the problem, and the build log is the
        // payload engenty.app-coder iterates against.
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
      return c.json(
        { error: "invalid_body", issues: parsed.error.issues },
        400
      );
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

  /**
   * The App's source. A write applies files and deletions to the work tree
   * and commits the tree as it then stands; a read answers the whole tree at
   * a commit. Both go through the index link, so the App must have been
   * placed by a write or a deploy first.
   */
  app.put("/internal/apps/:appId/source", async (c) => {
    const appId = c.req.param("appId");
    const parsed = sourceWriteBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "invalid_body", issues: parsed.error.issues },
        400
      );
    }
    try {
      const commit = await store.writeSource(
        appId,
        toPlacement(parsed.data.app),
        {
          delete: parsed.data.delete,
          files: parsed.data.files,
          message: parsed.data.message,
        }
      );
      return c.json({ ok: true, ...commit });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("source write failed", { appId, message });
      return c.json({ error: "source_write_failed", message }, 400);
    }
  });

  app.get("/internal/apps/:appId/source", async (c) => {
    const appId = c.req.param("appId");
    const ref = c.req.query("ref") ?? "HEAD";
    try {
      const tree = await store.readSource(appId, ref);
      return c.json({ ok: true, ...tree });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("source read failed", { appId, message, ref });
      return c.json({ error: "source_read_failed", message }, 404);
    }
  });

  app.delete("/internal/apps/:appId", async (c) => {
    const appId = c.req.param("appId");
    const parsed = destroyBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json(
        { error: "invalid_body", issues: parsed.error.issues },
        400
      );
    }
    try {
      const result = await runtime.destroy(appId, toPlacement(parsed.data.app));
      return c.json({ deployment: result, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("destroy failed", { appId, message });
      return c.json({ error: "destroy_failed", message }, 500);
    }
  });

  return app;
}
