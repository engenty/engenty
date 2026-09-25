import { RequestContext } from "@mastra/core/request-context";
import { standardSchemaToJSONSchema } from "@mastra/core/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEngentyToolExecuteTool,
  type ToolApprovalSuspendPayload,
} from "../../ai/tools/engenty-tools/engenty-tool-execute-tool.js";
import {
  engentyToolsRunAls,
  type ToolRequestContextCarrier,
} from "../../ai/tools/engenty-tools/lib/run-context.js";

function executeTool(
  tool: ReturnType<typeof createEngentyToolExecuteTool>,
  input: unknown,
  context?: ToolRequestContextCarrier<ToolApprovalSuspendPayload>
) {
  return (
    tool.execute as (
      input: unknown,
      context?: ToolRequestContextCarrier<ToolApprovalSuspendPayload>
    ) => unknown
  )(input, context);
}

function okExecute(operationId: string, data: unknown) {
  return { ok: true, operation_id: operationId, data };
}

function emptyExecute(operationId: string, data: unknown) {
  return { ok: true, operation_id: operationId, data, meta: { empty: true } };
}

describe("createEngentyToolExecuteTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("exposes input as a JSON string so providers cannot strip nested objects to {}", () => {
    const tool = createEngentyToolExecuteTool();
    if (!tool.inputSchema) {
      throw new Error("expected inputSchema");
    }
    const modelSchema = standardSchemaToJSONSchema(tool.inputSchema) as {
      properties?: { input?: { type?: string } };
    };
    expect(modelSchema.properties?.input?.type).toBe("string");
  });

  it("invokes a discovered tool with the current user's authorization", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            auth: {
              requiredCapabilities: [],
              requiredPermissions: [],
              requiredScopes: [],
              requiresApproval: false,
              riskLevel: "low",
            },
            inputSchema: { type: "zod" },
            moduleId: "contacts",
            pluginId: "contacts",
            summary: "Search contacts",
            toolId: "contacts_contact_search",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            items: [{ id: "contact-1" }],
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    const result = await engentyToolsRunAls.run(
      {
        accessToken: "user-token",
      },
      () =>
        executeTool(tool, {
          id: "contacts_contact_search",
          input: { limit: 1, query: "Anwalt", strategy: "lexical" },
        })
    );

    expect(result).toEqual(
      okExecute("contacts_contact_search", {
        items: [{ id: "contact-1" }],
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://api.engenty.localhost/api/tools/contracts/contacts_contact_search"
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
        }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://api.engenty.localhost/api/tools/contacts_contact_search/invoke"
      ),
      expect.objectContaining({
        body: JSON.stringify({
          input: { limit: 1, query: "Anwalt", strategy: "lexical" },
        }),
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
          "Content-Type": "application/json",
        }),
        method: "POST",
      })
    );
  });

  // Only the app_build workflow publishes the preview, so a hand-driven App
  // is invisible to the user.
  describe("app authoring is closed to hand-driving", () => {
    for (const operationId of [
      "app_create",
      "app_file_write",
      "app_release_propose",
    ]) {
      it(`redirects ${operationId} to app_build without calling core`, async () => {
        vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
        const fetchMock = vi.fn().mockResolvedValue(
          Response.json({
            ok: true,
            data: {
              auth: {
                requiredCapabilities: [],
                requiredPermissions: [],
                requiredScopes: [],
                requiresApproval: false,
                riskLevel: "low",
              },
              inputSchema: { type: "zod" },
              moduleId: "engenty-apps",
              pluginId: "engenty-apps",
              summary: "An app authoring step",
              toolId: operationId,
            },
          })
        );
        vi.stubGlobal("fetch", fetchMock);
        const tool = createEngentyToolExecuteTool();

        const result = (await engentyToolsRunAls.run(
          { accessToken: "user-token" },
          () => executeTool(tool, { id: operationId, input: { name: "X" } })
        )) as { error?: string; message?: string; ok?: boolean };

        expect(result.ok).toBe(false);
        expect(result.error).toBe("use_app_build");
        // The redirect must name the way forward, or the model just retries.
        expect(result.message).toContain("app_build");
        // Contract lookup only — the operation itself is never invoked.
        expect(
          fetchMock.mock.calls.some(([url]) => String(url).includes("/invoke"))
        ).toBe(false);
      });
    }

    it("leaves the human's own approval act reachable", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            ok: true,
            data: {
              auth: {
                requiredCapabilities: ["apps.approve"],
                requiredPermissions: [],
                requiredScopes: [],
                requiresApproval: false,
                riskLevel: "high",
              },
              inputSchema: { type: "zod" },
              moduleId: "engenty-apps",
              pluginId: "engenty-apps",
              summary: "Activate a proposed app version",
              toolId: "app_release_approve",
            },
          })
        )
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { version: 1 } })
        );
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();

      const result = (await engentyToolsRunAls.run(
        { accessToken: "user-token" },
        () =>
          executeTool(tool, {
            id: "app_release_approve",
            input: { app_id: "a", version: 1 },
          })
      )) as { error?: string; ok?: boolean };

      expect(result.error).not.toBe("use_app_build");
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("/invoke"))
      ).toBe(true);
    });
  });

  it("uses the Mastra request context auth token for Studio runs", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            auth: {
              requiredCapabilities: [],
              requiredPermissions: [],
              requiredScopes: [],
              requiresApproval: false,
              riskLevel: "low",
            },
            inputSchema: { type: "zod" },
            moduleId: "knowledge-base",
            pluginId: "knowledge-base",
            summary: "Search knowledge base",
            toolId: "knowledge_base_search",
          },
        })
      )
      .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();
    const requestContext: RequestContext<unknown> = new RequestContext([
      ["mastra__authToken", "Bearer studio-token"],
    ]);

    const result = await executeTool(
      tool,
      {
        id: "knowledge_base_search",
        input: { query: "Förderungen" },
      },
      { requestContext }
    );

    expect(result).toMatchObject(
      emptyExecute("knowledge_base_search", { items: [] })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://api.engenty.localhost/api/tools/contracts/knowledge_base_search"
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer studio-token",
        }),
      })
    );
  });

  it("overrides agent_run_id with the ALS run context runId", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            auth: {
              requiredCapabilities: [],
              requiredPermissions: [],
              requiredScopes: [],
              requiresApproval: false,
              riskLevel: "high",
            },
            inputSchema: { type: "zod" },
            moduleId: "tasks",
            pluginId: "tasks",
            summary: "Checkout task",
            toolId: "tasks_checkout",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: { id: "task-uuid", status: "in_progress" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();
    const harnessRunId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const hallucinated = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    await engentyToolsRunAls.run(
      { accessToken: "user-token", runId: harnessRunId },
      () =>
        executeTool(tool, {
          id: "tasks_checkout",
          input: {
            id: "task-uuid",
            agent_run_id: hallucinated,
            agent_id: "tasks.assist",
          },
        })
    );

    const invokeCall = fetchMock.mock.calls[1];
    const body = JSON.parse(invokeCall[1].body as string) as {
      input: Record<string, unknown>;
    };
    expect(body.input.agent_run_id).toBe(harnessRunId);
    expect(body.input.agent_run_id).not.toBe(hallucinated);
  });

  function gatedDescribeResponse() {
    return Response.json({
      ok: true,
      data: {
        auth: {
          requiredCapabilities: [],
          requiredPermissions: [],
          requiredScopes: [],
          requiresApproval: true,
          riskLevel: "critical",
        },
        inputSchema: { type: "zod" },
        moduleId: "contacts",
        pluginId: "contacts",
        summary: "Delete contact",
        toolId: "contacts_contact_delete",
      },
    });
  }

  it("Code Mode sandbox: gates an ungranted write, executes it with a grant, reads pass", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const { executeEngentyTool } = await import(
      "../../ai/tools/engenty-tools/engenty-tool-execute-tool.js"
    );
    const gatedFetch = vi.fn().mockResolvedValueOnce(gatedDescribeResponse());
    vi.stubGlobal("fetch", gatedFetch);
    const denied = (await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeEngentyTool(
          { id: "contacts_contact_delete", input: { id: "c1" } },
          undefined,
          { sandbox: true }
        )
    )) as { error?: string; message?: string; ok?: boolean };
    expect(denied.ok).toBe(false);
    expect(denied.error).toBe("approval_required");
    expect(denied.message).toContain("engenty_tools_preapprove");
    expect(gatedFetch).toHaveBeenCalledTimes(1);

    const grantedFetch = vi
      .fn()
      .mockResolvedValueOnce(gatedDescribeResponse())
      .mockResolvedValueOnce(Response.json({ ok: true, data: { deleted: 1 } }));
    vi.stubGlobal("fetch", grantedFetch);
    const granted = await engentyToolsRunAls.run(
      {
        accessToken: "user-token",
        approvalGrants: ["contacts_contact_delete"],
        approvalPolicy: "suspend",
      },
      () =>
        executeEngentyTool(
          { id: "contacts_contact_delete", input: { id: "c1" } },
          undefined,
          { sandbox: true }
        )
    );
    expect(granted).toEqual(
      okExecute("contacts_contact_delete", { deleted: 1 })
    );

    const readFetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            auth: {
              requiredCapabilities: [],
              requiredPermissions: [],
              requiredScopes: [],
              requiresApproval: false,
              riskLevel: "low",
            },
            inputSchema: { type: "zod" },
            moduleId: "contacts",
            pluginId: "contacts",
            summary: "Search contacts",
            toolId: "contacts_contact_search",
          },
        })
      )
      .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [] } }));
    vi.stubGlobal("fetch", readFetch);
    const result = await engentyToolsRunAls.run(
      { accessToken: "user-token" },
      () =>
        executeEngentyTool(
          { id: "contacts_contact_search", input: { query: "x" } },
          undefined,
          { sandbox: true }
        )
    );
    expect(result).toMatchObject(
      emptyExecute("contacts_contact_search", { items: [] })
    );
  });

  it("Code Mode sandbox: core's 202 backstop maps to approval_required (never suspends)", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const { executeEngentyTool } = await import(
      "../../ai/tools/engenty-tools/engenty-tool-execute-tool.js"
    );
    // A sandbox program cannot suspend; core's gate must fail into it instead.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            auth: {
              requiredCapabilities: [],
              requiredPermissions: [],
              requiredScopes: [],
              requiresApproval: false,
              riskLevel: "medium",
            },
            inputSchema: { type: "zod" },
            moduleId: "contacts",
            pluginId: "contacts",
            summary: "Update contact",
            toolId: "contacts_contact_update",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            ok: false,
            error: {
              code: "approval_required",
              message: "operation requires human approval",
            },
          },
          { status: 202 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeEngentyTool(
          { id: "contacts_contact_update", input: { id: "c1" } },
          undefined,
          { sandbox: true }
        )
    )) as { error?: string; message?: string; ok?: boolean };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("approval_required");
    expect(result.message).toContain("engenty_tools_preapprove");
  });

  it("rejects an EMPTY input for an operation with required fields (never invokes, never gates)", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        ok: true,
        data: {
          auth: {
            requiredCapabilities: [],
            requiredPermissions: [],
            requiredScopes: [],
            requiresApproval: true,
            riskLevel: "medium",
          },
          inputSchema: {
            jsonSchema: {
              type: "object",
              properties: { type: { type: "string" }, email: {} },
              required: ["type"],
            },
            type: "zod",
          },
          moduleId: "contacts",
          pluginId: "contacts",
          summary: "Create contact",
          toolId: "contacts_create",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();
    const suspend = vi.fn(async (_payload?: Record<string, unknown>) => {});

    // Never ask the user to approve a call that cannot succeed.
    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeTool(tool, { id: "contacts_create", input: {} }, {
          agent: { suspend },
        } as never)
    )) as { error?: string };

    expect(result.error).toBe("empty_tool_input");
    expect(suspend).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "fields flattened beside id",
      {
        display_name: "SFG",
        id: "contacts_create",
        type: "organisation",
        website: "https://www.sfg.at/",
      },
    ],
    [
      "input sent as a JSON string",
      {
        id: "contacts_create",
        input:
          '{"type":"organisation","display_name":"SFG","website":"https://www.sfg.at/"}',
      },
    ],
  ])("recovers a create call's arguments from %s", async (_label, args) => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            auth: {
              requiredCapabilities: [],
              requiredPermissions: [],
              requiredScopes: [],
              requiresApproval: false,
              riskLevel: "low",
            },
            inputSchema: {
              jsonSchema: {
                type: "object",
                properties: {
                  display_name: { type: "string" },
                  type: { type: "string" },
                  website: { type: "string" },
                },
                required: ["type"],
              },
              type: "zod",
            },
            moduleId: "contacts",
            pluginId: "contacts",
            summary: "Create contact",
            toolId: "contacts_create",
          },
        })
      )
      .mockResolvedValueOnce(Response.json({ ok: true, data: { id: "c-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await engentyToolsRunAls.run(
      { accessToken: "user-token" },
      () => executeTool(createEngentyToolExecuteTool(), args)
    );

    expect(result).toEqual(okExecute("contacts_create", { id: "c-1" }));
    const [, init] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      input: {
        display_name: "SFG",
        type: "organisation",
        website: "https://www.sfg.at/",
      },
    });
  });

  it("SUSPENDS the run (native HITL) for a requiresApproval op in a conversation run", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi.fn().mockResolvedValueOnce(gatedDescribeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();
    const suspend = vi.fn(async (_payload?: Record<string, unknown>) => {});

    await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeTool(
          tool,
          { id: "contacts_contact_delete", input: { id: "contact-1" } },
          { agent: { suspend } } as never
        )
    );

    expect(suspend.mock.calls[0]?.[0]).toEqual({
      kind: "tool_approval",
      operation_id: "contacts_contact_delete",
      requires_approval: true,
      risk_level: "critical",
      title: "Delete contact",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("invokes after a resume that approved the suspended op", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(gatedDescribeResponse())
      .mockResolvedValueOnce(
        Response.json({ ok: true, data: { deleted: true } })
      );
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    const result = await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeTool(
          tool,
          { id: "contacts_contact_delete", input: { id: "contact-1" } },
          {
            agent: {
              resumeData: { approved: true, choice_id: "approve_once" },
              suspend: vi.fn(),
            },
          } as never
        )
    );

    expect(result).toEqual(
      okExecute("contacts_contact_delete", { deleted: true })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a denial result after a resume that denied the suspended op", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi.fn().mockResolvedValueOnce(gatedDescribeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeTool(
          tool,
          { id: "contacts_contact_delete", input: { id: "contact-1" } },
          {
            agent: {
              resumeData: { approved: false, choice_id: "deny" },
              suspend: vi.fn(),
            },
          } as never
        )
    )) as { error?: string; ok?: boolean };

    expect(result.ok).toBe(false);
    expect(result.error).toBe("approval_denied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("DENIES a requiresApproval op in a leaf run (no interactive channel)", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi.fn().mockResolvedValueOnce(gatedDescribeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    const result = (await engentyToolsRunAls.run(
      { accessToken: "user-token" },
      () =>
        executeTool(tool, {
          id: "contacts_contact_delete",
          input: { id: "contact-1" },
        })
    )) as { error?: string; ok?: boolean };

    expect(result.ok).toBe(false);
    expect(result.error).toBe("approval_required");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still gates an op when only a DIFFERENT op is granted", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi.fn().mockResolvedValueOnce(gatedDescribeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    const result = (await engentyToolsRunAls.run(
      {
        accessToken: "user-token",
        approvalGrants: ["contacts_contact_search"],
      },
      () =>
        executeTool(tool, {
          id: "contacts_contact_delete",
          input: { id: "contact-1" },
        })
    )) as { error?: string; ok?: boolean };

    expect(result.error).toBe("approval_required");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("evidence envelopes", () => {
    const marketingSpace = {
      allConnectorPrefixes: new Set<string>(),
      connectorPrefixes: new Set<string>(),
      moduleIds: new Set(["projects", "contacts"]),
      readOnlyModuleIds: new Set(["contacts"]),
      spaceId: "019fe8ec-0000-0000-0000-000000000001",
    };

    function projectsListDescribe() {
      return Response.json({
        ok: true,
        data: {
          auth: {
            requiredCapabilities: [],
            requiredPermissions: [],
            requiredScopes: [],
            requiresApproval: false,
            riskLevel: "low",
          },
          inputSchema: { type: "zod" },
          moduleId: "projects",
          pluginId: "projects",
          summary: "List projects",
          toolId: "projects_list",
        },
      });
    }

    it("treats a null/undefined invoke body as no_tool_result", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(projectsListDescribe())
        .mockResolvedValueOnce(Response.json({ ok: true, data: null }));
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();

      const result = (await engentyToolsRunAls.run(
        { accessToken: "user-token" },
        () => executeTool(tool, { id: "projects_list", input: {} })
      )) as { error?: string; ok?: boolean };

      expect(result.ok).toBe(false);
      expect(result.error).toBe("no_tool_result");
    });

    it("treats an unreadable core envelope as no_tool_result", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(projectsListDescribe())
        .mockResolvedValueOnce(new Response("", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();

      const result = (await engentyToolsRunAls.run(
        { accessToken: "user-token" },
        () => executeTool(tool, { id: "projects_list", input: {} })
      )) as { error?: string; ok?: boolean };

      expect(result.ok).toBe(false);
      expect(result.error).toBe("no_tool_result");
    });

    it("preserves a real empty projects_list payload as success", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(projectsListDescribe())
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { data: [], total: 0 } })
        );
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();

      const result = await engentyToolsRunAls.run(
        { accessToken: "user-token" },
        () => executeTool(tool, { id: "projects_list", input: {} })
      );

      expect(result).toMatchObject(
        emptyExecute("projects_list", { data: [], total: 0 })
      );
    });

    it("refuses unmounted and read-only ops without retrying", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const tool = createEngentyToolExecuteTool();

      const unmountedFetch = vi.fn().mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            auth: {
              requiredCapabilities: [],
              requiredPermissions: [],
              requiredScopes: [],
              requiresApproval: false,
              riskLevel: "low",
            },
            inputSchema: { type: "zod" },
            moduleId: "offers",
            pluginId: "offers",
            summary: "List offers",
            toolId: "offers_list",
          },
        })
      );
      vi.stubGlobal("fetch", unmountedFetch);
      const unmounted = (await engentyToolsRunAls.run(
        { accessToken: "user-token", space: marketingSpace },
        () => executeTool(tool, { id: "offers_list", input: {} })
      )) as { error?: string; message?: string; ok?: boolean };
      expect(unmounted.ok).toBe(false);
      expect(unmounted.error).toBe("module_not_in_space");
      expect(unmounted.message?.toLowerCase()).toContain("do not retry");
      expect(unmountedFetch).toHaveBeenCalledTimes(1);

      const writeFetch = vi.fn().mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            auth: {
              requiredCapabilities: [],
              requiredPermissions: [],
              requiredScopes: [],
              requiresApproval: false,
              riskLevel: "medium",
            },
            inputSchema: { type: "zod" },
            moduleId: "contacts",
            pluginId: "contacts",
            summary: "Update contact",
            toolId: "contacts_update",
          },
        })
      );
      vi.stubGlobal("fetch", writeFetch);
      const readOnlyWrite = (await engentyToolsRunAls.run(
        { accessToken: "user-token", space: marketingSpace },
        () =>
          executeTool(tool, {
            id: "contacts_update",
            input: { id: "c1" },
          })
      )) as { error?: string; message?: string; ok?: boolean };
      expect(readOnlyWrite.ok).toBe(false);
      expect(readOnlyWrite.error).toBe("space_read_only");
      expect(readOnlyWrite.message?.toLowerCase()).toContain("do not retry");
      expect(writeFetch).toHaveBeenCalledTimes(1);
    });
  });

  // The approval replays the recorded call once; without its arguments the
  // model re-derives the write and can duplicate it.
  describe("the 'request' park records the gated call's arguments", () => {
    it("passes the raw call input through onApprovalRequired", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi.fn().mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: {
            auth: {
              requiredCapabilities: [],
              requiredPermissions: [],
              requiredScopes: [],
              requiresApproval: true,
              riskLevel: "high",
            },
            inputSchema: { type: "zod" },
            moduleId: "tasks",
            pluginId: "tasks",
            summary: "Create task",
            toolId: "tasks_create",
          },
        })
      );
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();
      const onApprovalRequired = vi.fn();

      const result = (await engentyToolsRunAls.run(
        {
          accessToken: "user-token",
          approvalPolicy: "request",
          onApprovalRequired,
        },
        () =>
          executeTool(tool, {
            id: "tasks_create",
            input: { project_id: "p-1", title: "Glossar erstellen" },
          })
      )) as { error?: string; ok?: boolean };

      expect(result.ok).toBe(false);
      expect(result.error).toBe("approval_pending");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onApprovalRequired).toHaveBeenCalledTimes(1);
      expect(onApprovalRequired).toHaveBeenCalledWith({
        input: { project_id: "p-1", title: "Glossar erstellen" },
        operationId: "tasks_create",
        riskLevel: "high",
        title: "Create task",
      });
    });
  });

  describe("the 'defer' policy (auto/pass-all task runs) lets core decide", () => {
    it("translates core's 202 into the same needs-approval park as 'request'", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            ok: true,
            data: {
              auth: {
                requiredCapabilities: [],
                requiredPermissions: [],
                requiredScopes: [],
                requiresApproval: false,
                riskLevel: "high",
              },
              inputSchema: { type: "zod" },
              moduleId: "billing",
              pluginId: "billing",
              summary: "Charge card",
              toolId: "billing_charge",
            },
          })
        )
        .mockResolvedValueOnce(
          Response.json(
            {
              ok: false,
              error: {
                code: "approval_required",
                message: "Approval required",
              },
            },
            { status: 202 }
          )
        );
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();
      const onApprovalRequired = vi.fn();

      const result = (await engentyToolsRunAls.run(
        {
          accessToken: "user-token",
          approvalPolicy: "defer",
          onApprovalRequired,
          tenantId: "0198c0de-0000-7000-8000-000000000002",
        },
        () =>
          executeTool(tool, {
            id: "billing_charge",
            input: { amount: 100 },
          })
      )) as { error?: string; ok?: boolean };

      expect(result.ok).toBe(false);
      expect(result.error).toBe("approval_pending");
      expect(onApprovalRequired).toHaveBeenCalledTimes(1);
      expect(onApprovalRequired).toHaveBeenCalledWith({
        input: { amount: 100 },
        operationId: "billing_charge",
        riskLevel: "high",
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // A grant lets repeats execute silently; only the dedupe map stops a second
  // identical write from creating a second record.
  describe("identical writes execute once per run (invocation dedupe)", () => {
    function gatedCreateContract() {
      return Response.json({
        ok: true,
        data: {
          auth: {
            requiredCapabilities: [],
            requiredPermissions: [],
            requiredScopes: [],
            requiresApproval: true,
            riskLevel: "high",
          },
          inputSchema: { type: "zod" },
          moduleId: "knowledge-base",
          pluginId: "knowledge-base",
          readOnly: false,
          summary: "Create a KB Source",
          toolId: "kb_source_create",
        },
      });
    }

    const sourceInput = {
      adapter_id: "url",
      name: "RIS – Bauordnung für Wien (konsolidierte Fassung)",
      settings: { url: "https://www.ris.bka.gv.at/…/LWI40000225.html" },
    };

    it("refuses the second identical granted write with the first result attached", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(gatedCreateContract())
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { id: "src-1" } })
        )
        .mockResolvedValueOnce(gatedCreateContract());
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();
      const runContext = {
        accessToken: "user-token",
        approvalGrants: ["kb_source_create"],
        approvalPolicy: "request" as const,
        executedWriteCalls: new Map<string, unknown>(),
      };

      const first = await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, { id: "kb_source_create", input: sourceInput })
      );
      // Same call with keys reordered.
      const second = (await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, {
          id: "kb_source_create",
          input: {
            settings: { url: "https://www.ris.bka.gv.at/…/LWI40000225.html" },
            name: "RIS – Bauordnung für Wien (konsolidierte Fassung)",
            adapter_id: "url",
          },
        })
      )) as { error?: string; ok?: boolean; previous_result?: unknown };

      expect(first).toEqual(okExecute("kb_source_create", { id: "src-1" }));
      expect(second.ok).toBe(false);
      expect(second.error).toBe("duplicate_call");
      expect(second.previous_result).toEqual(
        okExecute("kb_source_create", { id: "src-1" })
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
