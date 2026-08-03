import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EngentyCoreHttpError } from "../ai/core-http-client.js";
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
    // The origin marker rides along so core can tell an App from a chat turn
    // (CON-01) — see the connector-write cases below.
    expect(invokeTool).toHaveBeenCalledWith(
      "inbox_threads_list",
      { limit: 5 },
      { origin: "app" }
    );
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

  // CON-01. An App declaring a write-group connector action used to have
  // nothing between it and the send: it rides the viewing user's token, so
  // core's connections gate deferred to a chat pre-gate that is not running
  // outside chat. The proxy now marks its calls, core escalates, and the 202
  // becomes the `pending_approval` result the engenty-bridge skill has been
  // promising app authors all along.
  describe("connector writes fail closed", () => {
    const CONNECTOR_APP = {
      ...APP_DETAIL,
      active_version: {
        ...APP_DETAIL.active_version,
        manifest: {
          ...APP_DETAIL.active_version.manifest,
          engenty: { operations: ["gmail_send_message"] },
        },
      },
    };

    function mockCoreEscalating() {
      invokeTool.mockImplementation(async (toolId: string) => {
        if (toolId === "app_get") {
          return CONNECTOR_APP;
        }
        if (toolId === "gmail_send_message") {
          // What core answers once the connections gate escalates.
          throw new EngentyCoreHttpError(
            "a human must approve this action",
            202,
            "approval_required",
            { approvalRequestId: "areq-1", expiresAt: "2026-08-04T00:00:00Z" }
          );
        }
        return { ok: true };
      });
    }

    it("marks the call as app-origin so core can escalate it", async () => {
      mockCoreEscalating();
      const { app } = makeApp();
      await app.request(`/ai/apps/${APP_ID}/call`, {
        body: callBody("engenty_call", {
          input: { to: "someone@example.com" },
          operation_id: "gmail_send_message",
        }),
        headers: authed,
        method: "POST",
      });
      expect(invokeTool).toHaveBeenCalledWith(
        "gmail_send_message",
        { to: "someone@example.com" },
        { origin: "app" }
      );
    });

    it("returns pending_approval instead of a success", async () => {
      mockCoreEscalating();
      const { app } = makeApp();
      const res = await app.request(`/ai/apps/${APP_ID}/call`, {
        body: callBody("engenty_call", {
          input: { to: "someone@example.com" },
          operation_id: "gmail_send_message",
        }),
        headers: authed,
        method: "POST",
      });
      expect(res.status).toBe(202);
      await expect(res.json()).resolves.toMatchObject({
        ok: true,
        result: {
          approval_request_id: "areq-1",
          expires_at: "2026-08-04T00:00:00Z",
          status: "pending_approval",
        },
      });
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

describe("POST /ai/apps/:appId/call — approval-gated operations", () => {
  it("maps core's approval_required to the documented pending_approval result", async () => {
    invokeTool.mockImplementation(async (toolId: string) => {
      if (toolId === "app_get") {
        return APP_DETAIL;
      }
      // What EngentyCoreClient throws for core's 202 approval_required
      // envelope. The guest must receive a RESULT (the skill's contract),
      // never an error — a parked call is the product working.
      throw new EngentyCoreHttpError(
        "Approval required",
        202,
        "approval_required",
        {
          approvalRequestId: "apr-1",
          expiresAt: "2026-08-03T00:00:00Z",
        }
      );
    });
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("engenty_call", { operation_id: "inbox_threads_list" }),
      headers: authed,
      method: "POST",
    });
    // 2xx so BridgedFrame's call() resolves instead of throwing.
    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      result: {
        approval_request_id: "apr-1",
        expires_at: "2026-08-03T00:00:00Z",
        status: "pending_approval",
      },
    });
  });
});

const VERSIONS = {
  versions: [
    {
      manifest: {
        actions: [{ id: "email_summary", risk: "high" }],
        egress: { connect: [] },
        engenty: { operations: ["tasks_list", "gmail_send"] },
        storage: { config: false, data: true },
      },
      status: "proposed",
      version: 2,
    },
    {
      manifest: {
        actions: [],
        engenty: { operations: ["tasks_list"] },
        storage: { data: true },
      },
      status: "active",
      version: 1,
    },
  ],
};

describe("GET /ai/apps/:appId/review", () => {
  beforeEach(() => {
    invokeTool.mockImplementation(async (toolId: string) =>
      toolId === "app_versions_list" ? VERSIONS : { ok: true }
    );
  });

  it("surfaces the proposed version's declared surface to an approver", async () => {
    requestFn.mockResolvedValue({ capabilities: ["apps.approve"] });
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/review`, {
      headers: authed,
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      can_approve: true,
      review: {
        operations: ["tasks_list", "gmail_send"],
        status: "proposed",
        version: 2,
      },
    });
  });

  it("answers can_approve with the same matcher core enforces with", async () => {
    // tenant.member holds module.*, which does NOT cover apps.approve.
    requestFn.mockResolvedValue({ capabilities: ["module.*"] });
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/review`, {
      headers: authed,
    });
    await expect(res.json()).resolves.toMatchObject({ can_approve: false });
  });

  it("returns a null review when nothing awaits a decision", async () => {
    invokeTool.mockImplementation(async (toolId: string) =>
      toolId === "app_versions_list"
        ? { versions: [VERSIONS.versions[1]] }
        : { ok: true }
    );
    requestFn.mockResolvedValue({ capabilities: ["apps.approve"] });
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/review`, {
      headers: authed,
    });
    await expect(res.json()).resolves.toMatchObject({
      can_approve: true,
      review: null,
    });
  });

  it("reviews the pinned version when the artifact names one", async () => {
    requestFn.mockResolvedValue({ capabilities: [] });
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/review?version=1`, {
      headers: authed,
    });
    await expect(res.json()).resolves.toMatchObject({
      review: { status: "active", version: 1 },
    });
  });

  it("rejects an unauthenticated caller", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/review`);
    expect(res.status).toBe(401);
  });
});

describe("POST /ai/apps/:appId/review", () => {
  it("forwards an approval with the caller's own token", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/review`, {
      body: JSON.stringify({ decision: "approve", version: 2 }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(invokeTool).toHaveBeenCalledWith("app_release_approve", {
      app_id: APP_ID,
      version: 2,
    });
  });

  it("forwards a rejection with its reason", async () => {
    const { app } = makeApp();
    await app.request(`/ai/apps/${APP_ID}/review`, {
      body: JSON.stringify({
        decision: "reject",
        reason: "asks for gmail_send it never uses",
        version: 2,
      }),
      headers: authed,
      method: "POST",
    });
    expect(invokeTool).toHaveBeenCalledWith("app_release_reject", {
      app_id: APP_ID,
      reason: "asks for gmail_send it never uses",
      version: 2,
    });
  });

  it("passes core's capability denial through unchanged", async () => {
    invokeTool.mockImplementation(async () => {
      throw new EngentyCoreHttpError(
        "missing capability: apps.approve",
        403,
        "forbidden"
      );
    });
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/review`, {
      body: JSON.stringify({ decision: "approve", version: 2 }),
      headers: authed,
      method: "POST",
    });
    // The proxy adds no authority — core's verdict IS the answer.
    expect(res.status).toBe(403);
  });

  it("rejects a malformed decision body", async () => {
    const { app } = makeApp();
    const res = await app.request(`/ai/apps/${APP_ID}/review`, {
      body: JSON.stringify({ decision: "activate", version: 2 }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(400);
    expect(invokeTool).not.toHaveBeenCalled();
  });
});
