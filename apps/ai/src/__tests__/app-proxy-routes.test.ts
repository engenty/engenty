import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EngentyCoreHttpError } from "../ai/core-http-client.js";
import { AppCapabilityRegistry } from "../api/app-capabilities.js";
import {
  type AppProxyOptions,
  registerAppProxyRoutes,
} from "../api/app-proxy-routes.js";

// The proxy is the capability wall: an App reaches engenty only through it,
// and only as far as its manifest declares.

const invokeTool = vi.hoisted(() => vi.fn());
const describeTool = vi.hoisted(() =>
  vi.fn(async (toolId: string) => ({
    moduleId: toolId.startsWith("gmail_") ? "connections" : "tasks",
    operationId: toolId,
    summary: `summary of ${toolId}`,
  }))
);
const requestFn = vi.hoisted(() => vi.fn());

vi.mock("../ai/core-http-client.js", async () => {
  const actual = await vi.importActual<
    typeof import("../ai/core-http-client.js")
  >("../ai/core-http-client.js");
  return {
    ...actual,
    EngentyCoreClient: class {
      describeTool = describeTool;
      invokeTool = invokeTool;
      request = requestFn;
    },
    getEngentyCoreBaseUrlFromEnv: () => "http://core.test",
  };
});

const TENANT = "tenant-1";
const USER = "user-1";
const APP_ID = "11111111-1111-4111-8111-111111111111";
const TABLE_ID = "22222222-2222-4222-8222-222222222222";
const ROW_ID = "33333333-3333-4333-8333-333333333333";

const APP_DETAIL = {
  active_version: {
    manifest: {
      actions: [
        { id: "collect", risk: "low" },
        { id: "finalize", requiresApproval: true, risk: "high" },
      ],
      engenty: { operations: ["inbox_threads_list"], tables: [TABLE_ID] },
      storage: { config: true, data: true },
    },
    version: 1,
  },
  id: APP_ID,
  status: "active",
};

/** A one-column Space table; enough to see coercion and the allow-list act. */
function makeTables() {
  const rows = new Map<string, Record<string, unknown>>([
    [ROW_ID, { turn: "x" }],
  ]);
  const table = {
    columns: [{ id: "turn", name: "Turn", type: "text" as const }],
    id: TABLE_ID,
    space_id: "space-1",
    tenant_id: TENANT,
    title: "Games",
  };
  return {
    deleteRows: vi.fn(async ({ rowIds }: { rowIds: string[] }) => {
      for (const id of rowIds) {
        rows.delete(id);
      }
      return rowIds.length;
    }),
    getRow: vi.fn(async ({ rowId }: { rowId: string }) =>
      rows.has(rowId) ? { cells: rows.get(rowId), id: rowId } : null
    ),
    getTable: vi.fn(async ({ tableId }: { tableId: string }) =>
      tableId === TABLE_ID ? table : null
    ),
    insertRows: vi.fn(
      async ({ rows: next }: { rows: Record<string, unknown>[] }) =>
        next.map((cells, index) => {
          const id = `new-${index}`;
          rows.set(id, cells);
          return { cells, id };
        })
    ),
    listRows: vi.fn(async () =>
      [...rows.entries()].map(([id, cells]) => ({ cells, id }))
    ),
    updateRow: vi.fn(
      async ({
        cells,
        rowId,
      }: {
        cells: Record<string, unknown>;
        rowId: string;
      }) => {
        rows.set(rowId, cells);
        return { cells, id: rowId };
      }
    ),
  } as unknown as NonNullable<AppProxyOptions["tables"]>;
}

function makeApp(
  capabilities = new AppCapabilityRegistry(),
  tables: AppProxyOptions["tables"] = null
) {
  const app = new Hono();
  registerAppProxyRoutes(app as never, {
    capabilities,
    tables,
    scopeResolver: async ({ authorization }) => {
      if (!authorization) {
        return { error: "unauthorized", ok: false, status: 401 as const };
      }
      return {
        ok: true as const,
        scope: {
          tenantId: TENANT,
          credential: { kind: "user" as const, token: "user-jwt" },
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
      accessToken: "user-jwt",
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
    // The origin marker lets core tell an App from a chat turn.
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
      accessToken: "user-jwt",
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

  // An App rides the viewing user's token, so a connector write must park for
  // approval rather than send.
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
      sha: "b".repeat(40),
      status: "proposed",
      version: 2,
    },
    {
      manifest: {
        actions: [],
        engenty: { operations: ["tasks_list"] },
        storage: { data: true },
      },
      sha: "a".repeat(40),
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
        // Each id names the module or connector it belongs to, so an
        // approver can tell a mailbox send from a contacts read.
        operations: [
          {
            id: "tasks_list",
            module: "tasks",
            summary: "summary of tasks_list",
          },
          {
            id: "gmail_send",
            module: "connections",
            summary: "summary of gmail_send",
          },
        ],
        sha: "b".repeat(40),
        status: "proposed",
        version: 2,
      },
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

describe("POST /ai/apps/:appId/call — Space tables", () => {
  it("refuses a table the manifest never declared, before touching the store", async () => {
    const tables = makeTables();
    const { app } = makeApp(undefined, tables);
    const other = "44444444-4444-4444-8444-444444444444";
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("table_read", { table_id: other }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "apps.tableNotDeclared",
      table_id: other,
    });
    expect(tables.getTable).not.toHaveBeenCalled();
  });

  it("writes rows through the column definition and answers the written ids", async () => {
    const tables = makeTables();
    const { app } = makeApp(undefined, tables);
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("table_write", {
        insert: [{ turn: "o" }],
        table_id: TABLE_ID,
        update: [{ row_id: ROW_ID, values: { turn: "o" } }],
      }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      result: {
        deleted: 0,
        inserted: ["new-0"],
        table_id: TABLE_ID,
        updated: [ROW_ID],
      },
    });
    expect(tables.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({ cells: { turn: "o" }, tenantId: TENANT })
    );
  });

  it("rejects a cell for a column the table does not have instead of storing it", async () => {
    const tables = makeTables();
    const { app } = makeApp(undefined, tables);
    const res = await app.request(`/ai/apps/${APP_ID}/call`, {
      body: callBody("table_write", {
        insert: [{ turn: "o", winner: "nobody" }],
        table_id: TABLE_ID,
      }),
      headers: authed,
      method: "POST",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "apps.invalidRowValues",
    });
    expect(tables.insertRows).not.toHaveBeenCalled();
  });
});
