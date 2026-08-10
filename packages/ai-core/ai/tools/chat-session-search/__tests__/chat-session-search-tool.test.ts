import { describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "../../context/types.js";
import {
  buildChatSessionSearchTool,
  buildMastraChatSessionSearchTool,
  CHAT_SESSION_SEARCH_TOOL_ID,
  type ChatSessionSearchToolDefinition,
} from "../chat-session-search-tool.js";

const execOptions = {
  context: undefined,
  messages: [],
  toolCallId: "call-1",
};

describe("buildChatSessionSearchTool", () => {
  it("calls index health at most once per cache key for repeated searches", async () => {
    const healthSpy = vi.fn().mockResolvedValue({
      index: {},
      index_health: "ok" as const,
      ok: true,
    });
    const searchSpy = vi.fn().mockResolvedValue({
      matches: [],
      total: 0,
    });
    const call = vi.fn(async (method: string, input: unknown) => {
      if (method === "ai_chat_sessions_index_health") {
        return healthSpy();
      }
      if (method === "ai_chat_sessions_search") {
        return searchSpy(input);
      }
      throw new Error(`unexpected ${method}`);
    });

    const ctx: ToolExecutionContext = {
      action: "test",
      callGatewayMethod: call,
      moduleId: "test",
      orchestratorThreadId: "sess-1",
      scope: null,
      scopeId: null,
      tenantId: "t1",
      userId: "u1",
    };

    const tool = buildChatSessionSearchTool(ctx);
    const exec = tool.execute;
    if (!exec) {
      throw new Error("expected execute");
    }

    await exec({ query: "hello" }, execOptions);
    await exec({ query: "again" }, execOptions);

    expect(healthSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenCalled();
  });

  it("returns index_notice when index is degraded but search has matches", async () => {
    const call = vi.fn(async (method: string, input: unknown) => {
      if (method === "ai_chat_sessions_index_health") {
        return {
          hint: "Rebuild in settings.",
          index: { missing_session_count: 2 },
          index_health: "degraded" as const,
          ok: false,
        };
      }
      if (method === "ai_chat_sessions_search") {
        void input;
        return { matches: [{ id: "a" }], total: 3 };
      }
      throw new Error(`unexpected ${method}`);
    });

    const ctx: ToolExecutionContext = {
      action: "test",
      callGatewayMethod: call,
      moduleId: "test",
      orchestratorThreadId: "sess-2",
      scope: null,
      scopeId: null,
      tenantId: "t1",
      userId: "u1",
    };

    const tool = buildChatSessionSearchTool(ctx);
    const exec = tool.execute;
    if (!exec) {
      throw new Error("expected execute");
    }

    const out = await exec({ query: "x" }, execOptions);
    expect(out).toMatchObject({
      index_health: "degraded",
      index_ok: false,
      total: 3,
    });
    expect(typeof (out as { index_notice?: string }).index_notice).toBe(
      "string"
    );
    expect((out as { index_notice: string }).index_notice).toContain("3 match");
  });

  it("builds a Mastra-compatible tool with the shared execution path", async () => {
    const call = vi.fn(async (method: string, input: unknown) => {
      if (method === "ai_chat_sessions_index_health") {
        return {
          index: { document_count: 1 },
          index_health: "ok" as const,
          ok: true,
        };
      }
      if (method === "ai_chat_sessions_search") {
        return { matches: [{ id: "chat-1", input }], total: 1 };
      }
      throw new Error(`unexpected ${method}`);
    });
    const createTool = vi.fn((definition: ChatSessionSearchToolDefinition) => ({
      ...definition,
    }));
    const ctx: ToolExecutionContext = {
      action: "test",
      callGatewayMethod: call,
      moduleId: "test",
      orchestratorThreadId: "sess-mastra",
      scope: null,
      scopeId: null,
      tenantId: "t1",
      userId: "u1",
    };

    const tool = buildMastraChatSessionSearchTool(createTool, ctx);

    expect(createTool).toHaveBeenCalledWith(
      expect.objectContaining({
        id: CHAT_SESSION_SEARCH_TOOL_ID,
        inputSchema: expect.any(Object),
      })
    );
    await expect(
      tool.execute({ query: "previous plan" })
    ).resolves.toMatchObject({
      index_health: "ok",
      matches: [{ id: "chat-1" }],
      total: 1,
    });
    expect(call).toHaveBeenCalledWith("ai_chat_sessions_search", {
      query: "previous plan",
    });
  });
});
