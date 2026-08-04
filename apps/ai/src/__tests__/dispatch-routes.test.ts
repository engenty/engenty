import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerDispatchRoutes } = await import("../api/dispatch-routes.js");

function createScopeResolver(overrides: { isTenantAdmin?: boolean } = {}) {
  return async () => ({
    ok: true as const,
    scope: {
      tenantId: "tenant-1",
      userId: "user-1",
      isSuperAdmin: false,
      isTenantAdmin: overrides.isTenantAdmin ?? true,
      tenantRole:
        (overrides.isTenantAdmin ?? true)
          ? ("admin" as const)
          : ("member" as const),
      credential: { kind: "user" as const, token: "token" },
    },
  });
}

function createApp(
  opts: {
    isTenantAdmin?: boolean;
    queueMetrics?: {
      queue_length: number;
      oldest_msg_age_seconds: number | null;
    };
    queueNull?: boolean;
    dispatchEnabled?: boolean;
  } = {}
) {
  const app = new Hono();

  // Set env before registering routes.
  if (opts.dispatchEnabled === false) {
    vi.stubEnv("ENGENTY_AGENT_TASK_DISPATCH_ENABLED", "false");
  } else {
    vi.stubEnv("ENGENTY_AGENT_TASK_DISPATCH_ENABLED", "true");
  }

  const mockQueue = opts.queueNull
    ? null
    : {
        archive: vi.fn(),
        delete: vi.fn(),
        metrics: vi.fn(
          async () =>
            opts.queueMetrics ?? {
              queue_length: 0,
              oldest_msg_age_seconds: null,
            }
        ),
        pop: vi.fn(),
        read: vi.fn(),
        send: vi.fn(),
        sendBatch: vi.fn(),
      };

  registerDispatchRoutes(app, {
    getQueue: () => mockQueue,
    scopeResolver: createScopeResolver({ isTenantAdmin: opts.isTenantAdmin }),
  });

  return { app, mockQueue };
}

describe("GET /ai/v1/dispatch/status", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 403 for non-admin users", async () => {
    const { app } = createApp({ isTenantAdmin: false });
    const res = await app.request("/ai/v1/dispatch/status");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("dispatch.forbidden");
  });

  it("returns null queue when queue service is unavailable", async () => {
    const { app } = createApp({ queueNull: true });
    const res = await app.request("/ai/v1/dispatch/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.queue).toBeNull();
  });

  it("returns queue metrics when queue is configured", async () => {
    const { app } = createApp({
      queueMetrics: { queue_length: 3, oldest_msg_age_seconds: 42 },
    });
    const res = await app.request("/ai/v1/dispatch/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.queue).toEqual({
      depth: 3,
      oldest_msg_age_seconds: 42,
    });
  });

  it("returns enabled=false when kill-switch is active", async () => {
    const { app } = createApp({
      dispatchEnabled: false,
      queueMetrics: { queue_length: 0, oldest_msg_age_seconds: null },
    });
    const res = await app.request("/ai/v1/dispatch/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.queue).toEqual({
      depth: 0,
      oldest_msg_age_seconds: null,
    });
  });

  it("returns queue metrics with empty queue", async () => {
    const { app } = createApp({
      queueMetrics: { queue_length: 0, oldest_msg_age_seconds: null },
    });
    const res = await app.request("/ai/v1/dispatch/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queue).toEqual({
      depth: 0,
      oldest_msg_age_seconds: null,
    });
  });
});
