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

// Mirrors what the tool actually reads off its execution context — the
// request-context carrier — so tests can hand it a two-field object instead of
// standing up a full Mastra ToolExecutionContext.
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
  return {
    ok: true,
    operation_id: operationId,
    data,
    meta: {
      source: "engenty_tool_execute",
      empty: true,
      message:
        "The operation succeeded and returned no records. Report an empty result; do not invent rows.",
    },
  };
}

function operationResponse(input: {
  moduleId: string;
  operationId: string;
  readOnly: boolean;
}) {
  return Response.json({
    data: {
      auth: {
        requiredCapabilities: [],
        requiredPermissions: [],
        requiredScopes: [],
        requiresApproval: false,
        riskLevel: "low",
      },
      inputSchema: { type: "zod" },
      moduleId: input.moduleId,
      pluginId: input.moduleId,
      readOnly: input.readOnly,
      toolId: input.operationId,
    },
    ok: true,
  });
}

describe("createEngentyToolExecuteTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("documents how to run selected tools after discovery", () => {
    const tool = createEngentyToolExecuteTool();

    expect(tool.description).toContain("selected Engenty tool");
    expect(tool.description).toContain("JSON STRING");
  });

  it("exposes input as a JSON string so providers cannot strip nested objects to {}", () => {
    const tool = createEngentyToolExecuteTool();
    if (!tool.inputSchema) {
      throw new Error("expected inputSchema");
    }
    const modelSchema = standardSchemaToJSONSchema(tool.inputSchema) as {
      additionalProperties?: boolean;
      properties?: { input?: { type?: string } };
      required?: string[];
    };
    expect(modelSchema.properties?.input?.type).toBe("string");
    expect(modelSchema.required).toEqual(["id", "input"]);
    expect(modelSchema.additionalProperties).toBe(false);
  });

  it("executes Tasks-owned operations", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        operationResponse({
          moduleId: "tasks",
          operationId: "tasks_list",
          readOnly: true,
        })
      )
      .mockResolvedValueOnce(Response.json({ data: { data: [] }, ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await engentyToolsRunAls.run(
      {
        accessToken: "token",
      },
      () =>
        executeTool(createEngentyToolExecuteTool(), {
          id: "tasks_list",
          input: "{}",
        })
    );
    expect(result).toEqual(emptyExecute("tasks_list", { data: [] }));
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

  /**
   * A live run showed the copilot ignoring the AGENTS.md rule and driving
   * app_create → app_file_write by hand, one approval prompt at a time. Only
   * the app_build workflow publishes the preview artifact, so an App assembled
   * that way is invisible to the user however well it compiles. Prose did not
   * hold; this is the enforcement.
   */
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
    // Annotated: the array form infers a keyed generic, but the executor takes
    // the unparameterised `RequestContext<unknown>`.
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

    expect(result).toEqual(
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

  it("does not attach catalog describe metadata to successful results", async () => {
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
            toolId: "kb_search",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: { error: "No knowledge base found" },
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
          id: "kb_search",
          input: { limit: 10, query: "Förderungen" },
        })
    );

    expect(result).toEqual(
      okExecute("kb_search", { error: "No knowledge base found" })
    );
    expect(result).not.toHaveProperty("tool");
  });

  it("returns a structured error when no tool run context is active", async () => {
    const tool = createEngentyToolExecuteTool();

    await expect(
      executeTool(tool, {
        id: "contacts_contact_search",
        input: { limit: 1 },
      })
    ).resolves.toEqual({
      ok: false,
      code: "unauthorized",
      message:
        "Core-backed Engenty tools are unavailable because this run does not include an end-user bearer token.",
    });
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

  it("injects agent_run_id from run context when the LLM omits it", async () => {
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
    const harnessRunId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    await engentyToolsRunAls.run(
      { accessToken: "user-token", runId: harnessRunId },
      () =>
        executeTool(tool, {
          id: "tasks_checkout",
          input: {
            id: "task-uuid",
            agent_run_id: "irrelevant",
            agent_id: "tasks.assist",
          },
        })
    );

    const invokeCall = fetchMock.mock.calls[1];
    const body = JSON.parse(invokeCall[1].body as string) as {
      input: Record<string, unknown>;
    };
    expect(body.input.agent_run_id).toBe(harnessRunId);
  });

  it("does not inject agent_run_id for operations that do not expose it", async () => {
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
            moduleId: "tasks",
            pluginId: "tasks",
            summary: "List tasks",
            toolId: "tasks_list",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({ ok: true, data: { items: [], total: 0 } })
      );
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    await engentyToolsRunAls.run(
      {
        accessToken: "user-token",
        runId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
      () =>
        executeTool(tool, {
          id: "tasks_list",
          input: {},
        })
    );

    const invokeCall = fetchMock.mock.calls[1];
    const body = JSON.parse(invokeCall[1].body as string) as {
      input: Record<string, unknown>;
    };
    expect(body.input).not.toHaveProperty("agent_run_id");
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
    // Gated op (requiresApproval, critical) with NO covering grant — fails into
    // the program with the pre-approval recovery path, before any invoke.
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

    // Same gated op WITH a covering grant (user pre-approved) — invokes.
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

    // Read-only op (low risk, no approval) — executes without any grant.
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
    expect(result).toEqual(
      emptyExecute("contacts_contact_search", { items: [] })
    );
  });

  it("Code Mode sandbox: core's 202 backstop maps to approval_required (never suspends)", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const { executeEngentyTool } = await import(
      "../../ai/tools/engenty-tools/engenty-tool-execute-tool.js"
    );
    // Contract says medium/no-approval (passes the local sandbox gate), but
    // core still 202s — the authoritative decision fails into the program.
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

    // Weaker models drop function-call arguments entirely; the guard must fire
    // BEFORE the approval gate (no Approve/Deny card for a doomed call) and
    // instruct the model to retry once, then surface the model limitation.
    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeTool(tool, { id: "contacts_create", input: {} }, {
          agent: { suspend },
        } as never)
    )) as { error?: string; message?: string; ok?: boolean };

    expect(result.ok).toBe(false);
    expect(result.error).toBe("empty_tool_input");
    expect(result.message).toContain("type");
    expect(result.message).toContain("JSON string");
    expect(suspend).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers contacts_create fields flattened beside id (empty_tool_input miss)", async () => {
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
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: { id: "contact-sfg" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    const result = await engentyToolsRunAls.run(
      { accessToken: "user-token" },
      () =>
        executeTool(tool, {
          display_name: "SFG",
          id: "contacts_create",
          type: "organisation",
          website: "https://www.sfg.at/",
        })
    );

    expect(result).toEqual(okExecute("contacts_create", { id: "contact-sfg" }));
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.engenty.localhost/api/tools/contacts_create/invoke"),
      expect.objectContaining({
        body: JSON.stringify({
          input: {
            display_name: "SFG",
            type: "organisation",
            website: "https://www.sfg.at/",
          },
        }),
      })
    );
  });

  it("recovers contacts_create arguments from a JSON string input (empty_tool_input miss)", async () => {
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
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: { id: "contact-sfg" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    const result = await engentyToolsRunAls.run(
      { accessToken: "user-token" },
      () =>
        executeTool(tool, {
          id: "contacts_create",
          input:
            '{"type":"organisation","display_name":"SFG","website":"https://www.sfg.at/"}',
        })
    );

    expect(result).toEqual(okExecute("contacts_create", { id: "contact-sfg" }));
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.engenty.localhost/api/tools/contacts_create/invoke"),
      expect.objectContaining({
        body: JSON.stringify({
          input: {
            type: "organisation",
            display_name: "SFG",
            website: "https://www.sfg.at/",
          },
        }),
      })
    );
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
    // describeTool was called, but invoke was NOT (the gate stopped it).
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
      // No approvalPolicy — headless contexts default to deny.
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

  it("returns the Approve/Deny artifact for the voice path (artifact policy)", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi.fn().mockResolvedValueOnce(gatedDescribeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "artifact", accessToken: "user-token" },
      () =>
        executeTool(tool, {
          id: "contacts_contact_delete",
          input: { id: "contact-1" },
        })
    )) as { artifact_id?: string; artifact_type?: string };

    expect(result.artifact_type).toBe("decision");
    expect(result.artifact_id).toContain("tool-approval|");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("invokes a requiresApproval op once the user granted it for the chat", async () => {
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
              requiresApproval: true,
              riskLevel: "critical",
            },
            inputSchema: { type: "zod" },
            moduleId: "contacts",
            pluginId: "contacts",
            summary: "Delete contact",
            toolId: "contacts_contact_delete",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({ ok: true, data: { deleted: true } })
      );
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    const result = await engentyToolsRunAls.run(
      {
        accessToken: "user-token",
        approvalGrants: ["contacts_contact_delete"],
      },
      () =>
        executeTool(tool, {
          id: "contacts_contact_delete",
          input: { id: "contact-1" },
        })
    );

    expect(result).toEqual(
      okExecute("contacts_contact_delete", { deleted: true })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces core's 202 approval_required via the approval policy (backstop)", async () => {
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
            error: { code: "approval_required", message: "Approval required" },
          },
          { status: 202 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();

    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "artifact", accessToken: "user-token" },
      () => executeTool(tool, { id: "billing_charge", input: {} })
    )) as { artifact_id?: string; artifact_type?: string };

    expect(result.artifact_type).toBe("decision");
    expect(result.artifact_id).toBe("tool-approval|billing_charge");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe("projects-chat evidence envelopes", () => {
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
      )) as { error?: string; message?: string; ok?: boolean };

      expect(result.ok).toBe(false);
      expect(result.error).toBe("no_tool_result");
      expect(result.message).toContain(
        "Do not guess; report retrieval failure or retry once."
      );
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

      expect(result).toEqual(
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

  // Regression (2026-08-22): the "request" park must record the exact gated
  // call — operation AND arguments — so the approval can replay it once on
  // resume instead of the re-briefed model re-deriving (and duplicating) it.
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
      // The gate must NOT have invoked the operation — only described it.
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
    it("skips the pre-gate for a requiresApproval op and invokes when core allows", async () => {
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
                requiresApproval: true,
                riskLevel: "medium",
              },
              inputSchema: { type: "zod" },
              moduleId: "tasks",
              pluginId: "tasks",
              summary: "Create task",
              toolId: "tasks_create",
            },
          })
        )
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { id: "t-1" } })
        );
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();
      const onApprovalRequired = vi.fn();

      const result = await engentyToolsRunAls.run(
        {
          accessToken: "user-token",
          approvalPolicy: "defer",
          onApprovalRequired,
        },
        () =>
          executeTool(tool, {
            id: "tasks_create",
            input: { title: "Medium-risk write" },
          })
      );

      // No grant, requiresApproval — but under defer core is authoritative,
      // and core said yes (auto mode + space write mount): the op RAN with
      // no human prompt and nothing was parked.
      expect(result).toEqual(okExecute("tasks_create", { id: "t-1" }));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onApprovalRequired).not.toHaveBeenCalled();
    });

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

      // High risk still gates under auto: core 202'd, and the run parks on
      // this op with the exact call recorded — identical to a "request" park.
      expect(result.ok).toBe(false);
      expect(result.error).toBe("approval_pending");
      expect(onApprovalRequired).toHaveBeenCalledTimes(1);
      expect(onApprovalRequired).toHaveBeenCalledWith({
        input: { amount: 100 },
        operationId: "billing_charge",
        riskLevel: "high",
      });
      // describe + invoke only — no inbox ping when a task collector exists.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // Regression for 2026-08-22: a resumed knowledge-base task executed an
  // approved `kb_source_create` twice with byte-identical arguments
  // (module_kb.kb_sources 01a029dd-3985… + 01a029dd-c4ce…). The park had gone
  // through the BULK pre-approval path (no recorded args → nothing replayed),
  // and once the task-scope grant existed nothing stopped the re-briefed model
  // from creating the source and then creating it again. The dedupe map makes
  // the second identical write return the first result instead of a new row.
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
        // Second attempt: describe runs again, but no second invoke follows.
        .mockResolvedValueOnce(gatedCreateContract());
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();
      // One ALS context object for the whole run, as delegate-run builds it —
      // the grant covers the op (task scope), so both calls pass the gate.
      const runContext = {
        accessToken: "user-token",
        approvalGrants: ["kb_source_create"],
        approvalPolicy: "request" as const,
        executedWriteCalls: new Map<string, unknown>(),
      };

      const first = await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, { id: "kb_source_create", input: sourceInput })
      );
      // Same call again, with the keys in a different order: canonicalization
      // must still recognize it as the same invocation.
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
      // 3 fetches: describe + invoke, then describe only — no second insert.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('lets a deliberate repeat through via `"_repeat": true` and strips the flag', async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(gatedCreateContract())
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { id: "src-1" } })
        )
        .mockResolvedValueOnce(gatedCreateContract())
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { id: "src-2" } })
        );
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();
      const runContext = {
        accessToken: "user-token",
        approvalGrants: ["kb_source_create"],
        approvalPolicy: "request" as const,
        executedWriteCalls: new Map<string, unknown>(),
      };

      await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, { id: "kb_source_create", input: sourceInput })
      );
      const second = await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, {
          id: "kb_source_create",
          input: { ...sourceInput, _repeat: true },
        })
      );

      expect(second).toEqual(okExecute("kb_source_create", { id: "src-2" }));
      expect(fetchMock).toHaveBeenCalledTimes(4);
      // The reserved flag never reaches core.
      const secondInvokeBody = JSON.parse(
        (fetchMock.mock.calls[3] as [unknown, { body: string }])[1]
          .body as string
      ) as Record<string, unknown>;
      expect(secondInvokeBody).not.toHaveProperty("_repeat");
    });

    it("never dedupes read-only operations", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          operationResponse({
            moduleId: "tasks",
            operationId: "tasks_list",
            readOnly: true,
          })
        )
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { data: [{ id: "t-1" }] } })
        )
        .mockResolvedValueOnce(
          operationResponse({
            moduleId: "tasks",
            operationId: "tasks_list",
            readOnly: true,
          })
        )
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { data: [{ id: "t-1" }] } })
        );
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();
      const runContext = {
        accessToken: "user-token",
        executedWriteCalls: new Map<string, unknown>(),
      };

      const first = await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, { id: "tasks_list", input: "{}" })
      );
      const second = await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, { id: "tasks_list", input: "{}" })
      );

      expect(first).toEqual(second);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("does not register a failed write, so a genuine retry still runs", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(gatedCreateContract())
        .mockResolvedValueOnce(
          Response.json(
            { error: { code: "internal_error", message: "boom" }, ok: false },
            { status: 500 }
          )
        )
        .mockResolvedValueOnce(gatedCreateContract())
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { id: "src-1" } })
        );
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();
      const runContext = {
        accessToken: "user-token",
        approvalGrants: ["kb_source_create"],
        approvalPolicy: "request" as const,
        executedWriteCalls: new Map<string, unknown>(),
      };

      const first = (await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, { id: "kb_source_create", input: sourceInput })
      )) as { ok?: boolean };
      const second = await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, { id: "kb_source_create", input: sourceInput })
      );

      expect(first.ok).toBe(false);
      expect(second).toEqual(okExecute("kb_source_create", { id: "src-1" }));
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("keeps the old behavior for lanes that seed no dedupe map", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(gatedCreateContract())
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { id: "src-1" } })
        )
        .mockResolvedValueOnce(gatedCreateContract())
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { id: "src-2" } })
        );
      vi.stubGlobal("fetch", fetchMock);
      const tool = createEngentyToolExecuteTool();
      const runContext = {
        accessToken: "user-token",
        approvalGrants: ["kb_source_create"],
        approvalPolicy: "request" as const,
      };

      await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, { id: "kb_source_create", input: sourceInput })
      );
      const second = await engentyToolsRunAls.run(runContext, () =>
        executeTool(tool, { id: "kb_source_create", input: sourceInput })
      );

      expect(second).toEqual(okExecute("kb_source_create", { id: "src-2" }));
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });
});
