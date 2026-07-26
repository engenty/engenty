import { describe, expect, it, vi } from "vitest";
import { createAppHost } from "../app.js";
import type { AppHostConfig } from "../config.js";
import { AppBuildFailure, type AppRuntime, assertAppId } from "../runtime.js";

function makeConfig(overrides: Partial<AppHostConfig> = {}): AppHostConfig {
  return {
    hostname: "127.0.0.1",
    internalToken: "test-token",
    maxSourceBytes: 1_000_000,
    perAppNamespace: true,
    port: 8795,
    production: false,
    requestTimeoutMs: 1000,
    scaling: { maxReplicas: 4, minReplicas: 0, targetConcurrency: 8 },
    ...overrides,
  };
}

function makeRuntime(overrides: Partial<AppRuntime> = {}): AppRuntime {
  return {
    deploy: vi.fn(async () => ({
      appId: "demo",
      namespace: "default",
      pool: "pool",
      regions: ["default"],
      release: "rel-1",
    })),
    destroy: vi.fn(async () => ({
      appId: "demo",
      namespace: "default",
      pool: "pool",
      regions: ["default"],
      release: "rel-2",
    })),
    request: vi.fn(async () => ({
      body: '{"ok":true}',
      headers: { "content-type": "application/json" },
      status: 200,
    })),
    start: vi.fn(),
    ...overrides,
  } as unknown as AppRuntime;
}

const authorized = { authorization: "Bearer test-token" };

describe("assertAppId", () => {
  it("accepts url-safe ids", () => {
    expect(() => assertAppId("t-0000-app-1")).not.toThrow();
  });

  it.each([
    "../escape",
    "UPPER",
    "has_underscore",
    "",
    "a".repeat(129),
  ])("rejects %j", (id) => {
    expect(() => assertAppId(id)).toThrow(/invalid app id/);
  });
});

describe("createAppHost", () => {
  it("serves health without a token", async () => {
    const app = createAppHost({ config: makeConfig(), runtime: makeRuntime() });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("rejects internal calls without the shared secret", async () => {
    const app = createAppHost({ config: makeConfig(), runtime: makeRuntime() });
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ files: {} }),
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong shared secret", async () => {
    const app = createAppHost({ config: makeConfig(), runtime: makeRuntime() });
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ files: {} }),
      headers: { authorization: "Bearer nope" },
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("deploys with a valid token", async () => {
    const runtime = makeRuntime();
    const app = createAppHost({ config: makeConfig(), runtime });
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ files: { "index.html": "<h1>hi</h1>" } }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      deployment: { release: "rel-1" },
      ok: true,
    });
    expect(runtime.deploy).toHaveBeenCalledWith({
      appId: "demo",
      files: { "index.html": "<h1>hi</h1>" },
    });
  });

  it("returns 422 with the build log so the authoring agent can iterate", async () => {
    const runtime = makeRuntime({
      deploy: vi.fn(async () => {
        throw new AppBuildFailure({
          buildLog: "SyntaxError: Unexpected token",
          code: "agentos_apps_build_failed",
          message: "build failed",
        });
      }),
    });
    const app = createAppHost({ config: makeConfig(), runtime });
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ files: { "index.js": "oops(" } }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      buildLog: "SyntaxError: Unexpected token",
      error: "build_failed",
    });
  });

  it("rejects a malformed deploy body", async () => {
    const app = createAppHost({ config: makeConfig(), runtime: makeRuntime() });
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ files: { "index.html": 42 } }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(400);
  });

  it("surfaces an unknown failure as 500, not as a build error", async () => {
    const runtime = makeRuntime({
      deploy: vi.fn(async () => {
        throw new Error("engine unreachable");
      }),
    });
    const app = createAppHost({ config: makeConfig(), runtime });
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ files: { "index.html": "<h1>hi</h1>" } }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "deploy_failed" });
  });

  it("rejects a malformed app id with 400, not a downstream failure", async () => {
    const runtime = makeRuntime();
    const app = createAppHost({ config: makeConfig(), runtime });
    const res = await app.request("/internal/apps/..%2F..%2Fetc/request", {
      body: JSON.stringify({ path: "/" }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "invalid_app_id",
    });
    expect(runtime.request).not.toHaveBeenCalled();
  });

  it("forwards a guest request and returns its response", async () => {
    const runtime = makeRuntime();
    const app = createAppHost({ config: makeConfig(), runtime });
    const res = await app.request("/internal/apps/demo/request", {
      body: JSON.stringify({ method: "POST", path: "/collect" }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      response: { status: 200 },
    });
  });

  it("maps a guest timeout to 504", async () => {
    const runtime = makeRuntime({
      request: vi.fn(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }),
    });
    const app = createAppHost({ config: makeConfig(), runtime });
    const res = await app.request("/internal/apps/demo/request", {
      body: JSON.stringify({ path: "/" }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(504);
  });
});
