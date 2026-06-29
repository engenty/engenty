import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPluginDevReloadEventsRoutes } from "../api/routes/plugins/plugin-dev-reload-events-routes.js";
import {
  createDevPluginReloadEventHub,
  encodeDevPluginReloadSseEvent,
  reloadResultToDevPluginReloadBrowserEvent,
  shouldEnableDevPluginReloadBrowserEvents,
} from "./dev-reload-events.js";
import type { ReloadPluginExecutionResult } from "./reload-executor.js";

function withEnv(env: { ENV?: string; NODE_ENV?: string }) {
  const previousEnv = process.env.ENV;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.ENV = env.ENV;
  process.env.NODE_ENV = env.NODE_ENV;
  return () => {
    if (previousEnv === undefined) {
      delete process.env.ENV;
    } else {
      process.env.ENV = previousEnv;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  };
}

function reloadResult(
  params: Partial<ReloadPluginExecutionResult> = {}
): ReloadPluginExecutionResult {
  return {
    generationId: 8,
    issues: [],
    pluginId: "contacts",
    preflight: {
      issues: [],
      plannedSteps: [],
      pluginId: "contacts",
      reloadable: true,
      status: "ok",
    },
    serviceStarts: 0,
    status: "reloaded",
    steps: [],
    uiRefresh: {
      generationId: 8,
      invalidationRequired: true,
      pluginId: "contacts",
      reason: "ui_contributions_may_have_changed",
    },
    ...params,
  };
}

describe("dev plugin reload browser events", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is gated to Engenty development outside production", () => {
    let restore = withEnv({ ENV: "development", NODE_ENV: "development" });
    expect(shouldEnableDevPluginReloadBrowserEvents()).toBe(true);
    expect(
      shouldEnableDevPluginReloadBrowserEvents({
        devPluginReloadBrowserEventsEnabled: false,
      })
    ).toBe(false);
    restore();

    restore = withEnv({ ENV: "development", NODE_ENV: "production" });
    expect(shouldEnableDevPluginReloadBrowserEvents()).toBe(false);
    restore();

    restore = withEnv({ NODE_ENV: "development" });
    expect(shouldEnableDevPluginReloadBrowserEvents()).toBe(false);
    restore();
  });

  it("serializes reload results with UI refresh markers as SSE events", () => {
    const event = reloadResultToDevPluginReloadBrowserEvent(reloadResult());

    expect(event).toMatchObject({
      generationId: 8,
      issues: [],
      pluginId: "contacts",
      steps: [],
      status: "reloaded",
      type: "plugin_reload",
      uiRefresh: {
        generationId: 8,
        invalidationRequired: true,
        pluginId: "contacts",
      },
    });
    expect(encodeDevPluginReloadSseEvent(event!)).toContain(
      "event: plugin-reload\n"
    );
  });

  it("publishes reload results without UI refresh markers for diagnostics", () => {
    const hub = createDevPluginReloadEventHub();
    const listener = vi.fn();
    hub.subscribe(listener);

    hub.publishReloadResult(reloadResult({ uiRefresh: undefined }));

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "contacts",
        status: "reloaded",
        uiRefresh: undefined,
      })
    );
  });

  it("streams published watcher reload markers to browser subscribers", async () => {
    const restore = withEnv({ ENV: "development", NODE_ENV: "development" });
    const app = new OpenAPIHono();
    const hub = createDevPluginReloadEventHub();
    registerPluginDevReloadEventsRoutes({ app, config: {}, hub });

    const response = await app.request("/api/plugins/dev-reload-events");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const ready = await reader.read();
    expect(decoder.decode(ready.value)).toBe(": ready\n\n");

    hub.publishReloadResult(reloadResult());
    const next = await reader.read();
    const chunk = decoder.decode(next.value);

    expect(chunk).toContain("event: plugin-reload\n");
    expect(chunk).toContain('"pluginId":"contacts"');
    await reader.cancel();
    restore();
  });

  it("registers dev-reload-events before /api/plugins/:id so SSE is not handled as a plugin id", async () => {
    const restore = withEnv({ ENV: "development", NODE_ENV: "development" });
    const app = new OpenAPIHono();
    const hub = createDevPluginReloadEventHub();
    registerPluginDevReloadEventsRoutes({ app, config: {}, hub });
    app.get("/api/plugins/:id", (c) =>
      c.json({ shadowedAsId: c.req.param("id") }, 401)
    );

    const response = await app.request("/api/plugins/dev-reload-events");

    expect(response.status).toBe(200);
    restore();
  });

  it("is shadowed by GET /api/plugins/:id when that route is registered first", async () => {
    const restore = withEnv({ ENV: "development", NODE_ENV: "development" });
    const app = new OpenAPIHono();
    const hub = createDevPluginReloadEventHub();
    app.get("/api/plugins/:id", (c) =>
      c.json({ shadowedAsId: c.req.param("id") }, 401)
    );
    registerPluginDevReloadEventsRoutes({ app, config: {}, hub });

    const response = await app.request("/api/plugins/dev-reload-events");

    expect(response.status).toBe(401);
    const body = (await response.json()) as { shadowedAsId?: string };
    expect(body.shadowedAsId).toBe("dev-reload-events");
    restore();
  });
});
