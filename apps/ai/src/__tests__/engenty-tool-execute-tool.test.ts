import { RequestContext } from "@mastra/core/request-context";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngentyToolExecuteTool } from "../../ai/tools/engenty-tools/engenty-tool-execute-tool.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";

function executeTool(
  tool: ReturnType<typeof createEngentyToolExecuteTool>,
  input: unknown,
  context?: ToolExecutionContext
) {
  return (
    tool.execute as (input: unknown, context?: ToolExecutionContext) => unknown
  )(input, context);
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
    expect(tool.description).toContain("empty input object");
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

    expect(result).toEqual({
      ok: true,
      data: {
        items: [{ id: "contact-1" }],
      },
    });
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
    const requestContext = new RequestContext([
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

    expect(result).toEqual({
      ok: true,
      data: { items: [] },
    });
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

    expect(result).toEqual({
      ok: true,
      data: { error: "No knowledge base found" },
    });
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

  it("Code Mode read-only: rejects a non-read-only op, executes a read-only one", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const { executeEngentyTool } = await import(
      "../../ai/tools/engenty-tools/engenty-tool-execute-tool.js"
    );
    // Gated op (requiresApproval, critical) — denied before any gate/invoke.
    const gatedFetch = vi.fn().mockResolvedValueOnce(gatedDescribeResponse());
    vi.stubGlobal("fetch", gatedFetch);
    const denied = (await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeEngentyTool(
          { id: "contacts_contact_delete", input: { id: "c1" } },
          undefined,
          { enforceReadOnly: true }
        )
    )) as { error?: string; ok?: boolean };
    expect(denied.ok).toBe(false);
    expect(denied.error).toBe("code_mode_read_only");
    expect(gatedFetch).toHaveBeenCalledTimes(1);

    // Read-only op (low risk, no approval) — executes normally.
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
          { enforceReadOnly: true }
        )
    );
    expect(result).toEqual({ ok: true, data: { items: [] } });
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
    const suspend = vi.fn(async () => {});

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
    expect(result.message).toContain("different model");
    expect(suspend).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("SUSPENDS the run (native HITL) for a requiresApproval op in a conversation run", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi.fn().mockResolvedValueOnce(gatedDescribeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const tool = createEngentyToolExecuteTool();
    const suspend = vi.fn(async () => {});

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

    expect(result).toEqual({ ok: true, data: { deleted: true } });
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

    expect(result).toEqual({ ok: true, data: { deleted: true } });
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
});
