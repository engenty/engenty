import { describe, expect, it, vi } from "vitest";
import { createAppHost } from "../app.js";
import type { AppStore } from "../app-store.js";
import type { AppHostConfig } from "../config.js";
import { AppBuildFailure, type AppRuntime, assertAppId } from "../runtime.js";

const PLACEMENT = {
  slug: "demo",
  space_id: "00000000-0000-4000-8000-000000000002",
  tenant_id: "00000000-0000-4000-8000-000000000001",
};

function makeConfig(overrides: Partial<AppHostConfig> = {}): AppHostConfig {
  return {
    hostname: "127.0.0.1",
    internalToken: "test-token",
    maxSourceBytes: 1_000_000,
    perAppNamespace: true,
    port: 8795,
    production: false,
    requestTimeoutMs: 1000,
    spacesDir: "/tmp/app-host-test-spaces",
    scaling: { maxReplicas: 1, minReplicas: 0, targetConcurrency: 8 },
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

function makeStore(overrides: Partial<AppStore> = {}): AppStore {
  return {
    readSource: vi.fn(async () => ({
      files: { "index.html": "<h1>hi</h1>" },
      sha: "a".repeat(40),
    })),
    writeSource: vi.fn(async () => ({ changed: true, sha: "b".repeat(40) })),
    ...overrides,
  } as unknown as AppStore;
}

function host(options: { runtime?: AppRuntime; store?: AppStore } = {}) {
  return createAppHost({
    config: makeConfig(),
    runtime: options.runtime ?? makeRuntime(),
    store: options.store ?? makeStore(),
  });
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
    const app = host();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("rejects internal calls without the shared secret", async () => {
    const app = host();
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ app: PLACEMENT, files: {} }),
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong shared secret", async () => {
    const app = host();
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ app: PLACEMENT, files: {} }),
      headers: { authorization: "Bearer nope" },
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("deploys with a valid token", async () => {
    const runtime = makeRuntime();
    const app = host({ runtime });
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({
        app: PLACEMENT,
        files: { "index.html": "<h1>hi</h1>" },
      }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      deployment: { release: "rel-1" },
      ok: true,
    });
    expect(runtime.deploy).toHaveBeenCalledWith({
      app: {
        slug: "demo",
        spaceId: PLACEMENT.space_id,
        tenantId: PLACEMENT.tenant_id,
      },
      appId: "demo",
      files: { "index.html": "<h1>hi</h1>" },
    });
  });

  it("rejects a deploy that does not say where the App lives", async () => {
    const runtime = makeRuntime();
    const app = host({ runtime });
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ files: { "index.html": "<h1>hi</h1>" } }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(400);
    expect(runtime.deploy).not.toHaveBeenCalled();
  });

  it("writes source through the store and answers with the commit", async () => {
    const store = makeStore();
    const app = host({ store });
    const res = await app.request("/internal/apps/demo/source", {
      body: JSON.stringify({
        app: PLACEMENT,
        delete: ["old.js"],
        files: { "index.html": "<h1>v2</h1>" },
        message: "v2",
      }),
      headers: authorized,
      method: "PUT",
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      changed: true,
      ok: true,
      sha: "b".repeat(40),
    });
    expect(store.writeSource).toHaveBeenCalledWith(
      "demo",
      {
        slug: "demo",
        spaceId: PLACEMENT.space_id,
        tenantId: PLACEMENT.tenant_id,
      },
      {
        delete: ["old.js"],
        files: { "index.html": "<h1>v2</h1>" },
        message: "v2",
      }
    );
  });

  it("reads the tree at a ref", async () => {
    const store = makeStore();
    const app = host({ store });
    const res = await app.request("/internal/apps/demo/source?ref=abc123", {
      headers: authorized,
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      files: { "index.html": "<h1>hi</h1>" },
      sha: "a".repeat(40),
    });
    expect(store.readSource).toHaveBeenCalledWith("demo", "abc123");
  });

  it("answers 404 for a tree it cannot read", async () => {
    const store = makeStore({
      readSource: vi.fn(async () => {
        throw new Error("fatal: bad revision");
      }),
    });
    const res = await host({ store }).request("/internal/apps/demo/source", {
      headers: authorized,
    });
    expect(res.status).toBe(404);
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
    const app = host({ runtime });
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ app: PLACEMENT, files: { "index.js": "oops(" } }),
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
    const app = host();
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({ app: PLACEMENT, files: { "index.html": 42 } }),
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
    const app = host({ runtime });
    const res = await app.request("/internal/apps/demo/deploy", {
      body: JSON.stringify({
        app: PLACEMENT,
        files: { "index.html": "<h1>hi</h1>" },
      }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "deploy_failed" });
  });

  it("rejects a malformed app id with 400, not a downstream failure", async () => {
    const runtime = makeRuntime();
    const app = host({ runtime });
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
    const app = host({ runtime });
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
    const app = host({ runtime });
    const res = await app.request("/internal/apps/demo/request", {
      body: JSON.stringify({ path: "/" }),
      headers: authorized,
      method: "POST",
    });
    expect(res.status).toBe(504);
  });
});
