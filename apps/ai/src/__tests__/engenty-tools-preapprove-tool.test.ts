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

  it("suspends ONE card covering every gated op at the highest risk", async () => {
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
            reason: "bulk import",
          },
          { agent: { suspend } } as never
        )
    );

    expect(suspend).toHaveBeenCalledTimes(1);
    const payload = suspend.mock.calls[0]?.[0] as ToolApprovalSuspendPayload;
    expect(payload.operation_ids).toEqual([
      "log_time_entry",
      "update_time_entry",
    ]);
    expect(payload.risk_level).toBe("critical");
  });

  it("skips already-granted and ungated ops; nothing left → no card", async () => {
    // An approved turn re-runs into this call; asking again would loop.
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
});
