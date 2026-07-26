import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppCapabilityRegistry } from "../api/app-capabilities.js";
import { registerAppProxyRoutes } from "../api/app-proxy-routes.js";

/**
 * The proxy is the capability wall: an App reaches engenty only through it,
 * and only as far as its manifest declares. These cover the denials, because
 * a wall that lets the wrong thing through silently is worse than no wall.
 */

const invokeTool = vi.hoisted(() => vi.fn());
const requestFn = vi.hoisted(() => vi.fn());

vi.mock("../ai/core-http-client.js", async () => {
  const actual = await vi.importActual<
    typeof import("../ai/core-http-client.js")
  >("../ai/core-http-client.js");
  return {
    ...actual,
    EngentyCoreClient: class {
      invokeTool = invokeTool;
      request = requestFn;
    },
    getEngentyCoreBaseUrlFromEnv: () => "http://core.test",
  };
});

const TENANT = "tenant-1";
const USER = "user-1";
const APP_ID = "11111111-1111-4111-8111-111111111111";

const APP_DETAIL = {
  active_version: {
    manifest: {
      actions: [
        { id: "collect", risk: "low" },
        { id: "finalize", requiresApproval: true, risk: "high" },
      ],
      engenty: { operations: ["inbox_threads_list"] },
      storage: { config: true, data: true },
    },
    version: 1,
  },
  id: APP_ID,
  status: "active",
};

function makeApp(capabilities = new AppCapabilityRegistry()) {
  const app = new Hono();
  registerAppProxyRoutes(app as never, {
    capabilities,
    scopeResolver: async ({ authorization }) => {
      if (!authorization) {
        return { error: "unauthorized", ok: false, status: 401 as const };
      }
      return {
        ok: true as const,
        scope: {
          tenantId: TENANT,
          userAccessToken: "user-jwt",
          userId: USER,
        },
      };
    },
  });
  return { app, capabilities };
}

const authed = {
  authorization: "Bearer user-jwt",
  "content-type": "application/json",
};

function callBody(name: string, args: Record<string, unknown> = {}) {
  return JSON.stringify({ arguments: args, name, session_id: "sess-1" });
}

beforeEach(() => {
  invokeTool.mockReset();
  requestFn.mockReset();
  invokeTool.mockImplementation(async (toolId: string) => {
    if (toolId === "app_get") {
      return APP_DETAIL;
    }
    return { ok: true };
  });
});

describe("POST /ai/apps/:appId/call — authentication", () => {
  it("rejects an unauthenticated caller", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("engenty_call", { operation_id: "inbox_threads_list" }),
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown capability handle", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("engenty_call", { operation_id: "inbox_threads_list" }),
      headers: { "x-engenty-capability": "made-up" },
      method: "POST",
    });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: "apps.capabilityInvalid",
    });
  });

  it("rejects a handle minted for a different app", async () => {
    const capabilities = new AppCapabilityRegistry();
    const handle = capabilities.mint({
      allowedOperations: ["inbox_threads_list"],
      appId: "some-other-app",
      sessionId: "sess-1",
      tenantId: TENANT,
      userAccessToken: "user-jwt",
      userId: USER,
    });
    const { app } = makeApp(capabilities);
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("engenty_call", { operation_id: "inbox_threads_list" }),
      headers: { "x-engenty-capability": handle },
      method: "POST",
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "apps.capabilityWrongApp",
    });
  });
});

describe("POST /ai/apps/:appId/call — the manifest allow-list", () => {
  it("invokes a declared operation with the caller's own token", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("engenty_call", {
        input: { limit: 5 },
        operation_id: "inbox_threads_list",
      }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(invokeTool).toHaveBeenCalledWith("inbox_threads_list", { limit: 5 });
  });

  it("refuses an operation the manifest does not declare", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("engenty_call", { operation_id: "contacts_delete" }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "apps.operationNotDeclared",
    });
    // Never forwarded — the denial happens before core is asked.
    expect(invokeTool).not.toHaveBeenCalledWith("contacts_delete", undefined);
  });

  it("narrows further when the caller presents a capability handle", async () => {
    const capabilities = new AppCapabilityRegistry();
    const handle = capabilities.mint({
      // Minted with a strictly smaller set than the manifest allows.
      allowedOperations: [],
      appId: APP_ID,
      sessionId: "sess-1",
      tenantId: TENANT,
      userAccessToken: "user-jwt",
      userId: USER,
    });
    const { app } = makeApp(capabilities);
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("engenty_call", { operation_id: "inbox_threads_list" }),
      headers: { "x-engenty-capability": handle },
      method: "POST",
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "apps.operationNotInCapability",
    });
  });

  it("rejects a bridge tool that does not exist", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("shell_exec", {}),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "apps.unknownBridgeTool",
    });
  });

  it("refuses to call an app that is not active", async () => {
    invokeTool.mockImplementation(async (toolId: string) =>
      toolId === "app_get" ? { ...APP_DETAIL, status: "draft" } : { ok: true }
    );
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("engenty_call", { operation_id: "inbox_threads_list" }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /ai/apps/:appId/call — actions", () => {
  it("routes a low-risk action to the unprivileged operation", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("app_action", {
        action: "collect",
        input: { amount: 35 },
      }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(200);
    const call = invokeTool.mock.calls.find(([id]) => id === "app_call");
    expect(call).toBeDefined();
    expect(
      invokeTool.mock.calls.some(([id]) => id === "app_call_privileged")
    ).toBe(false);
  });

  it("routes a high-risk action to the approval-gated operation", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("app_action", { action: "finalize" }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(
      invokeTool.mock.calls.some(([id]) => id === "app_call_privileged")
    ).toBe(true);
  });

  it("refuses an action the manifest does not declare", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("app_action", { action: "wipe" }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "apps.actionNotDeclared",
    });
  });

  it("hands the backend a capability, never a token, and revokes it after", async () => {
    const capabilities = new AppCapabilityRegistry();
    const { app } = makeApp(capabilities);
    let seenCapability: string | undefined;
    invokeTool.mockImplementation(
      async (toolId: string, input: { capability?: string }) => {
        if (toolId === "app_get") {
          return APP_DETAIL;
        }
        seenCapability = input?.capability;
        return { ok: true };
      }
    );

    await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("app_action", { action: "collect" }),
      headers: authed,
      method: "POST",
    });

    expect(seenCapability).toBeTruthy();
    expect(seenCapability).not.toBe("user-jwt");
    // One handle per invocation: dead the moment the action returns.
    expect(capabilities.resolve(seenCapability as string)).toBeNull();
  });
});

describe("POST /ai/apps/:appId/call — working store", () => {
  it("scopes data operations to the proxy's session, not the guest's claim", async () => {
    const { app } = makeApp();
    await app.request(`/ai/apps/${APP_ID}/call`, {
      body: JSON.stringify({
        arguments: { key: "draft", session_id: "somebody-elses", value: 1 },
        name: "data_set",
        session_id: "sess-1",
      }),
      headers: authed,
      method: "POST",
    });
    const call = invokeTool.mock.calls.find(([id]) => id === "app_data_set");
    expect(call?.[1]).toMatchObject({ app_id: APP_ID, session_id: "sess-1" });
  });

  it("maps each data bridge tool to its operation", async () => {
    const { app } = makeApp();
    for (const [name, operationId] of [
      ["data_get", "app_data_get"],
      ["data_list", "app_data_list"],
      ["data_set", "app_data_set"],
      ["data_delete", "app_data_delete"],
    ]) {
      invokeTool.mockClear();
      invokeTool.mockImplementation(async (toolId: string) =>
        toolId === "app_get" ? APP_DETAIL : { ok: true }
      );
      await app.request(`/ai/apps/${APP_ID}/call`, {
        body: callBody(name, { key: "k" }),
        headers: authed,
        method: "POST",
      });
      expect(invokeTool.mock.calls.some(([id]) => id === operationId)).toBe(
        true
      );
    }
  });
});

describe("POST /ai/apps/:appId/call — undeclared storage", () => {
  function withStorage(storage: Record<string, boolean>) {
    invokeTool.mockImplementation(async (toolId: string) =>
      toolId === "app_get"
        ? {
            ...APP_DETAIL,
            active_version: {
              ...APP_DETAIL.active_version,
              manifest: { ...APP_DETAIL.active_version.manifest, storage },
            },
          }
        : { ok: true }
    );
  }

  it("refuses data access an App never declared", async () => {
    withStorage({ config: true, data: false });
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("data_get", { key: "k" }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "apps.storageNotDeclared",
      store: "data",
    });
    expect(invokeTool.mock.calls.some(([id]) => id === "app_data_get")).toBe(
      false
    );
  });

  it("refuses config access an App never declared", async () => {
    withStorage({ config: false, data: true });
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("config_get", { key: "k" }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "apps.storageNotDeclared",
      store: "config",
    });
    expect(invokeTool.mock.calls.some(([id]) => id === "app_config_get")).toBe(
      false
    );
  });

  it("treats a manifest with no storage block as declaring neither", async () => {
    invokeTool.mockImplementation(async (toolId: string) =>
      toolId === "app_get"
        ? {
            ...APP_DETAIL,
            active_version: {
              ...APP_DETAIL.active_version,
              manifest: { engenty: { operations: [] } },
            },
          }
        : { ok: true }
    );
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("data_get", { key: "k" }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /ai/apps/:appId/call — config", () => {
  it("stamps the caller's user id, ignoring any the guest supplies", async () => {
    const { app } = makeApp();
    await app.request(`/ai/apps/${APP_ID}/call`, {
      body: JSON.stringify({
        arguments: { key: "theme", user_id: "somebody-else", value: "dark" },
        name: "config_set",
        session_id: "sess-1",
      }),
      headers: authed,
      method: "POST",
    });
    const call = invokeTool.mock.calls.find(([id]) => id === "app_config_set");
    expect(call?.[1]).toMatchObject({ app_id: APP_ID, user_id: USER });
  });

  it("never lets an App write the tenant-wide default", async () => {
    const { app } = makeApp();
    await app.request(`/ai/apps/${APP_ID}/call`, {
      body: JSON.stringify({
        arguments: { key: "theme", user_id: null, value: "dark" },
        name: "config_set",
        session_id: "sess-1",
      }),
      headers: authed,
      method: "POST",
    });
    const call = invokeTool.mock.calls.find(([id]) => id === "app_config_set");
    // A null user_id would mean "the default for everyone". The proxy always
    // substitutes the caller, so the App cannot reach that level at all.
    expect(call?.[1]).toMatchObject({ user_id: USER });
  });

  it("carries no session id — config is not session state", async () => {
    const { app } = makeApp();
    await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("config_get", { key: "theme" }),
      headers: authed,
      method: "POST",
    });
    const call = invokeTool.mock.calls.find(([id]) => id === "app_config_get");
    expect(call?.[1]).not.toHaveProperty("session_id");
  });

  it("maps each config bridge tool to its operation", async () => {
    const { app } = makeApp();
    for (const [name, operationId] of [
      ["config_get", "app_config_get"],
      ["config_list", "app_config_list"],
      ["config_set", "app_config_set"],
      ["config_delete", "app_config_delete"],
    ]) {
      invokeTool.mockClear();
      invokeTool.mockImplementation(async (toolId: string) =>
        toolId === "app_get" ? APP_DETAIL : { ok: true }
      );
      await app.request(`/ai/apps/${APP_ID}/call`, {
        body: callBody(name, { key: "k" }),
        headers: authed,
        method: "POST",
      });
      expect(invokeTool.mock.calls.some(([id]) => id === operationId)).toBe(
        true
      );
    }
  });
});
