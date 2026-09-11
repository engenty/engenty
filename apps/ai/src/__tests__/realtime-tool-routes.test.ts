import { describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import { type CreateAppOptions, createApp } from "../app.js";

const scopeResolver = createStaticAiScopeResolver({
  tenantId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
});

const contactListContract = {
  auth: {
    requiresApproval: false,
    riskLevel: "low" as const,
  },
  description: "List contacts",
  inputSchema: {
    jsonSchema: {
      properties: { query: { type: "string" } },
      type: "object",
    },
  },
  moduleId: "contacts",
  operationId: "contacts_list",
  pluginId: "contacts",
  readOnly: true,
  summary: "List contacts",
  toolId: "contacts_list",
};

function createIsolatedApp(options: CreateAppOptions = {}) {
  return createApp({
    agentRunStore: null,
    threadStore: null,
    disableGatewayModelScheduler: true,
    registryStore: null,
    realtimeVoiceConfigResolver: null,
    usageStore: null,
    ...options,
  });
}

describe("realtime tool routes", () => {
  it("requires authenticated AI scope", async () => {
    const app = await createIsolatedApp({
      scopeResolver: async () => ({
        error: "agent_threads.unauthorized",
        ok: false,
        status: 401,
      }),
    });

    const res = await app.request(
      "http://localhost/ai/v1/realtime/tools/execute",
      { method: "POST" }
    );

    expect(res.status).toBe(401);
  });

  it("executes realtime Engenty tool search through the core catalog", async () => {
    const coreFetch = vi.fn(async (url: URL | RequestInfo) => {
      expect(String(url)).toBe("https://core.example.test/api/tools/contracts");
      return Response.json({
        ok: true,
        data: [contactListContract],
      });
    });
    const app = await createIsolatedApp({
      coreBaseUrl: "https://core.example.test",
      coreFetch,
      scopeResolver,
    });

    const res = await app.request(
      "http://localhost/ai/v1/realtime/tools/execute",
      {
        body: JSON.stringify({
          arguments: { moduleId: "contacts", query: "list" },
          call_id: "call_1",
          name: "engenty_tools_search",
        }),
        headers: {
          Authorization: "Bearer user-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      result: {
        ok: true,
        matches: [{ name: "contacts_list" }],
      },
    });
    expect(coreFetch).toHaveBeenCalledWith(
      new URL("https://core.example.test/api/tools/contracts"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
        }),
      })
    );
  });

  it("executes selected realtime Engenty tools through core", async () => {
    const coreFetch = vi.fn(
      async (url: URL | RequestInfo, init?: RequestInit) => {
        const href = String(url);
        if (href.endsWith("/api/tools/contracts/contacts_list")) {
          return Response.json({ ok: true, data: contactListContract });
        }
        if (href.endsWith("/api/tools/contacts_list/invoke")) {
          expect(init?.body).toBe(JSON.stringify({ input: { query: "Ada" } }));
          return Response.json({
            ok: true,
            data: { items: [{ name: "Ada Lovelace" }] },
          });
        }
        return Response.json(
          { ok: false, error: { code: "not_found" } },
          {
            status: 404,
          }
        );
      }
    );
    const app = await createIsolatedApp({
      coreBaseUrl: "https://core.example.test",
      coreFetch,
      scopeResolver,
    });

    const res = await app.request(
      "http://localhost/ai/v1/realtime/tools/execute",
      {
        body: JSON.stringify({
          arguments: {
            id: "contacts_list",
            input: { query: "Ada" },
          },
          name: "engenty_tool_execute",
          thread_id: "00000000-0000-4000-8000-000000000003",
        }),
        headers: {
          Authorization: "Bearer user-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      result: {
        data: { items: [{ name: "Ada Lovelace" }] },
        ok: true,
        operation_id: "contacts_list",
      },
    });
  });
});
