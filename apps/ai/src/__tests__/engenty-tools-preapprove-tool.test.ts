import { afterEach, describe, expect, it, vi } from "vitest";
import {
  engentyToolsPreapproveTool,
  type ToolApprovalSuspendPayload,
} from "../../ai/tools/engenty-tools/index.js";
import {
  engentyToolsRunAls,
  type ToolRequestContextCarrier,
} from "../../ai/tools/engenty-tools/lib/run-context.js";

function executeTool(
  input: unknown,
  context?: ToolRequestContextCarrier<ToolApprovalSuspendPayload>
) {
  return (
    engentyToolsPreapproveTool.execute as (
      input: unknown,
      context?: ToolRequestContextCarrier<ToolApprovalSuspendPayload>
    ) => unknown
  )(input, context);
}

function describeResponse(
  toolId: string,
  auth: { requiresApproval: boolean; riskLevel: string },
  summary = toolId
) {
  return Response.json({
    ok: true,
    data: {
      auth: {
        requiredCapabilities: [],
        requiredPermissions: [],
        requiredScopes: [],
        ...auth,
      },
      inputSchema: { type: "zod" },
      moduleId: "time-tracking",
      pluginId: "time-tracking",
      summary,
      toolId,
    },
  });
}

describe("engentyToolsPreapproveTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("suspends ONE card covering every gated op, with the plan as body", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        describeResponse("log_time_entry", {
          requiresApproval: false,
          riskLevel: "high",
        })
      )
      .mockResolvedValueOnce(
        describeResponse("update_time_entry", {
          requiresApproval: false,
          riskLevel: "critical",
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const suspend = vi.fn(async (_payload?: Record<string, unknown>) => {});

    await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeTool(
          {
            operation_ids: ["log_time_entry", "update_time_entry"],
            reason: "Create 200 dummy time entries for testing",
            estimated_calls: 200,
          },
          { agent: { suspend } } as never
        )
    );

    expect(suspend).toHaveBeenCalledTimes(1);
    const payload = suspend.mock.calls[0]?.[0] as ToolApprovalSuspendPayload;
    expect(payload.kind).toBe("tool_approval");
    expect(payload.operation_id).toBe("log_time_entry");
    expect(payload.operation_ids).toEqual([
      "log_time_entry",
      "update_time_entry",
    ]);
    expect(payload.risk_level).toBe("critical");
    expect(payload.requires_approval).toBe(true);
    expect(payload.body).toContain("dummy time entries");
    expect(payload.body).toContain("~200");
  });

  it("skips already-granted and ungated ops; nothing left → no card", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        describeResponse("load_time_entries", {
          requiresApproval: false,
          riskLevel: "low",
        })
      )
      .mockResolvedValueOnce(
        describeResponse("log_time_entry", {
          requiresApproval: false,
          riskLevel: "high",
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const suspend = vi.fn(async (_payload?: Record<string, unknown>) => {});

    const result = (await engentyToolsRunAls.run(
      {
        accessToken: "user-token",
        approvalGrants: ["log_time_entry"],
        approvalPolicy: "suspend",
      },
      () =>
        executeTool(
          {
            operation_ids: ["load_time_entries", "log_time_entry"],
            reason: "bulk import",
          },
          { agent: { suspend } } as never
        )
    )) as { granted_operation_ids?: string[]; ok?: boolean };

    expect(result.ok).toBe(true);
    expect(result.granted_operation_ids).toEqual(["log_time_entry"]);
    expect(suspend).not.toHaveBeenCalled();
  });

  it("rejects unknown operation ids without showing a card", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        describeResponse("log_time_entry", {
          requiresApproval: false,
          riskLevel: "high",
        })
      )
      .mockResolvedValueOnce(
        Response.json(
          { ok: false, error: { code: "not_found", message: "unknown tool" } },
          { status: 404 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const suspend = vi.fn(async (_payload?: Record<string, unknown>) => {});

    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeTool(
          {
            operation_ids: ["log_time_entry", "totally_made_up_op"],
            reason: "bulk import",
          },
          { agent: { suspend } } as never
        )
    )) as {
      error?: string;
      ok?: boolean;
      unknown_operation_ids?: string[];
    };

    expect(result.ok).toBe(false);
    expect(result.error).toBe("unknown_operations");
    expect(result.unknown_operation_ids).toEqual(["totally_made_up_op"]);
    expect(suspend).not.toHaveBeenCalled();
  });

  it("artifact policy (interactive start lane): returns the bulk decision card", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        describeResponse("log_time_entry", {
          requiresApproval: false,
          riskLevel: "high",
        })
      )
      .mockResolvedValueOnce(
        describeResponse("update_time_entry", {
          requiresApproval: false,
          riskLevel: "high",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "artifact", accessToken: "user-token" },
      () =>
        executeTool({
          operation_ids: ["log_time_entry", "update_time_entry"],
          reason: "Create dummy entries",
        })
    )) as {
      artifact_type?: string;
      body?: string;
      choices?: { label: string }[];
    };

    expect(result.artifact_type).toBe("decision");
    expect(result.body).toContain("Create dummy entries");
    expect(result.body).toContain("log_time_entry, update_time_entry");
    expect(result.choices?.map((c) => c.label)).toEqual([
      "Approve for this run",
      "Approve for this chat",
      "Deny",
    ]);
  });

  it("returns a clear unavailable result in a leaf run (no suspend channel)", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi.fn().mockResolvedValueOnce(
      describeResponse("log_time_entry", {
        requiresApproval: false,
        riskLevel: "high",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "deny", accessToken: "user-token" },
      () =>
        executeTool({
          operation_ids: ["log_time_entry"],
          reason: "bulk import",
        })
    )) as { error?: string; message?: string; ok?: boolean };

    expect(result.ok).toBe(false);
    expect(result.error).toBe("approval_required");
    expect(result.message).toContain("log_time_entry");
  });

  it("resume: approved-for-chat returns the granted set with chat scope", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    vi.stubGlobal("fetch", vi.fn());

    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeTool(
          {
            operation_ids: ["log_time_entry", "update_time_entry"],
            reason: "bulk import",
          },
          {
            agent: {
              resumeData: { approved: true, choice_id: "approve_always" },
              suspend: vi.fn(),
            },
          } as never
        )
    )) as {
      granted_operation_ids?: string[];
      ok?: boolean;
      scope?: string;
    };

    expect(result.ok).toBe(true);
    expect(result.scope).toBe("chat");
    expect(result.granted_operation_ids).toEqual([
      "log_time_entry",
      "update_time_entry",
    ]);
  });

  it("resume: denial tells the model to stop without retrying", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    vi.stubGlobal("fetch", vi.fn());

    const result = (await engentyToolsRunAls.run(
      { approvalPolicy: "suspend", accessToken: "user-token" },
      () =>
        executeTool(
          { operation_ids: ["log_time_entry"], reason: "bulk import" },
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
  });
});
