import { afterEach, describe, expect, it, vi } from "vitest";
import { isToolVisibleInSpace } from "../../../../ai/tools/engenty-tools/lib/space-gate.js";
import { createStaticAiScopeResolver } from "../../../api/http.js";
import { resolveRealtimeToolSpace } from "../../../api/realtime-tool-routes.js";
import { createApp } from "../../../app.js";
import type { RunSpace } from "../../sessions/run-space.js";
import { resetRunSpaceCachesForTests } from "../../sessions/run-space.js";
import { formatSpaceRuntimeBlock } from "../../sessions/runtime-space-block.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const spaceId = "019fe8ec-0000-0000-0000-000000000001";

const marketing = {
  allConnectorPrefixes: new Set<string>(),
  connectorPrefixes: new Set<string>(),
  moduleIds: new Set(["projects", "contacts"]),
  readOnlyModuleIds: new Set(["contacts"]),
  spaceId,
};

const invoicesContract = {
  auth: { requiresApproval: false, riskLevel: "low" as const },
  description: "List invoices",
  moduleId: "invoices",
  operationId: "invoices_list",
  pluginId: "invoices",
  readOnly: true,
  summary: "List invoices",
  toolId: "invoices_list",
};

const projectsContract = {
  ...invoicesContract,
  description: "List projects",
  moduleId: "projects",
  operationId: "projects_list",
  pluginId: "projects",
  summary: "List projects",
  toolId: "projects_list",
};

describe("realtime voice space policy", () => {
  afterEach(() => {
    resetRunSpaceCachesForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("resolves the thread Space into the same ALS shape as text", async () => {
    const getThread = vi.fn(async () => ({
      space_id: spaceId,
      route_context: {},
    }));
    const space = await resolveRealtimeToolSpace({
      getSessionStore: () => ({ getThread }) as never,
      scope: { tenantId, userId },
      threadId,
    });
    expect(getThread).toHaveBeenCalledWith({ tenantId, threadId });
    // Without a live core surface this is unresolved or resolved — never a
    // silent conversion of the claim into global (`null`).
    expect(space === null).toBe(false);
  });

  it("hides unmounted catalog ops and refuses execute on the voice lane", async () => {
    expect(
      isToolVisibleInSpace(
        { moduleId: "invoices", operationId: "invoices_list" },
        marketing
      )
    ).toBe(false);

    const coreFetch = vi.fn(async (url: URL | RequestInfo) => {
      const href = String(url);
      if (href.endsWith("/api/tools/contracts")) {
        return Response.json({
          ok: true,
          data: [invoicesContract, projectsContract],
        });
      }
      if (href.includes("/api/spaces/")) {
        return Response.json({
          ok: true,
          data: {
            agents: [],
            capabilities: [],
            connections: [],
            modules: [
              {
                agentAccess: "write",
                isRequired: false,
                moduleId: "projects",
                recordScope: "space",
              },
              {
                agentAccess: "read",
                isRequired: false,
                moduleId: "contacts",
                recordScope: "all",
              },
            ],
            skills: [],
            spaceId,
          },
        });
      }
      if (href.endsWith("/api/tools/contracts/invoices_list")) {
        return Response.json({ ok: true, data: invoicesContract });
      }
      return Response.json(
        { ok: false, error: { code: "not_found" } },
        { status: 404 }
      );
    });

    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://core.example.test");
    vi.stubGlobal("fetch", coreFetch);

    const app = await createApp({
      agentRunStore: null,
      coreBaseUrl: "https://core.example.test",
      coreFetch,
      disableGatewayModelScheduler: true,
      realtimeVoiceConfigResolver: null,
      registryStore: null,
      scopeResolver: createStaticAiScopeResolver({ tenantId, userId }),
      threadStore: {
        getThread: async () => ({
          id: threadId,
          metadata: {},
          route_context: {},
          space_id: spaceId,
          tenant_id: tenantId,
        }),
      } as never,
      usageStore: null,
    });

    const search = await app.request(
      "http://localhost/ai/v1/realtime/tools/execute",
      {
        body: JSON.stringify({
          arguments: { query: "list" },
          name: "engenty_tools_search",
          thread_id: threadId,
        }),
        headers: {
          Authorization: "Bearer user-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
    expect(search.status).toBe(200);
    const searchBody = (await search.json()) as {
      result: { matches?: Array<{ name?: string }> };
    };
    const names = (searchBody.result.matches ?? []).map((match) => match.name);
    expect(names).not.toContain("invoices_list");

    const execute = await app.request(
      "http://localhost/ai/v1/realtime/tools/execute",
      {
        body: JSON.stringify({
          arguments: { id: "invoices_list", input: {} },
          name: "engenty_tool_execute",
          thread_id: threadId,
        }),
        headers: {
          Authorization: "Bearer user-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
    expect(execute.status).toBe(200);
    expect(await execute.json()).toMatchObject({
      result: { error: "module_not_in_space", ok: false },
    });
  });

  it("voice runtime context includes space_key identity and mounted modules", () => {
    const space: RunSpace = {
      agentIds: new Set(["engenty.copilot"]),
      allConnectorPrefixes: new Set(),
      browser: { autostart: false, unattended: false },
      connectorPrefixes: new Set(),
      moduleIds: new Set(["projects", "contacts"]),
      readOnlyModuleIds: new Set(["contacts"]),
      spaceId,
      topLevelAgentIds: new Set(),
      surface: {
        agents: ["engenty.copilot"],
        capabilities: [],
        connections: [],
        modules: [
          {
            agentAccess: "write",
            isRequired: false,
            moduleId: "projects",
            recordScope: "space",
          },
          {
            agentAccess: "read",
            isRequired: false,
            moduleId: "contacts",
            recordScope: "all",
          },
        ],
        skills: [],
        spaceId,
      },
    };
    const lines = formatSpaceRuntimeBlock({
      resolution: { kind: "resolved", space },
      spaceIdentity: {
        id: spaceId,
        key: "marketing",
        name: "Marketing",
      },
    });
    const text = lines.join("\n");
    expect(text).toContain("current_space: Marketing (marketing,");
    expect(text).toContain("- space_mounted_modules:");
    expect(text).toContain("projects: access=write, records=space");
    expect(text).toContain("contacts: access=read, records=tenant_shared");
  });
});
