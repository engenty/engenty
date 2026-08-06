import { describe, expect, it, vi } from "vitest";
import { repairDanglingToolCallsInHistory } from "../repair-dangling-tool-calls.js";
import { buildUnresolvedToolCallResult } from "../unresolved-tool-call.js";

const scope = {
  tenantId: "tenant-1",
  userId: "user-1",
} as never;

function storeWith(rows: unknown[]) {
  const updateMessageParts = vi.fn(async () => {
    // no-op persist
  });
  return {
    listMessagesOrdered: vi.fn(async () => rows),
    updateMessageParts,
  } as never as {
    listMessagesOrdered: ReturnType<typeof vi.fn>;
    updateMessageParts: ReturnType<typeof vi.fn>;
  };
}

function toolPart(toolCallId: string, toolName: string, state: string) {
  return {
    toolInvocation: { args: {}, state, toolCallId, toolName },
    type: "tool-invocation",
  };
}

describe("repairDanglingToolCallsInHistory", () => {
  it("answers a hallucinated tool call with an unknown_tool error", async () => {
    const store = storeWith([
      { id: "m1", parts: [toolPart("call_1", "ask_user", "call")] },
    ]);

    const repaired = await repairDanglingToolCallsInHistory({
      knownToolNames: ["requestDecision", "navigate"],
      scope,
      store: store as never,
      threadId: "t1",
    });

    expect(repaired).toEqual([{ toolCallId: "call_1", toolName: "ask_user" }]);
    const written = store.updateMessageParts.mock.calls[0]?.[0] as {
      parts: { toolInvocation: { result: unknown; state: string } }[];
    };
    expect(written.parts[0]?.toolInvocation.state).toBe("result");
    expect(written.parts[0]?.toolInvocation.result).toMatchObject({
      code: "unknown_tool",
      ok: false,
      tool_name: "ask_user",
    });
  });

  it("leaves resolved calls and the open interrupt's call untouched", async () => {
    const store = storeWith([
      {
        id: "m1",
        parts: [
          toolPart("done", "engenty_tools_search", "result"),
          toolPart("parked", "navigate", "call"),
        ],
      },
    ]);

    const repaired = await repairDanglingToolCallsInHistory({
      knownToolNames: ["navigate"],
      scope,
      skipToolCallIds: ["parked"],
      store: store as never,
      threadId: "t1",
    });

    expect(repaired).toEqual([]);
    expect(store.updateMessageParts).not.toHaveBeenCalled();
  });

  it("never throws when the store fails — the turn must still run", async () => {
    const store = {
      listMessagesOrdered: vi.fn(async () => {
        throw new Error("db down");
      }),
      updateMessageParts: vi.fn(),
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      // silence expected log
    });

    await expect(
      repairDanglingToolCallsInHistory({
        scope,
        store: store as never,
        threadId: "t1",
      })
    ).resolves.toEqual([]);
    error.mockRestore();
  });
});

describe("buildUnresolvedToolCallResult", () => {
  it("names close matches first so the model can pick a real tool", () => {
    const result = buildUnresolvedToolCallResult({
      knownToolNames: ["show_objects", "askUserSomething", "requestDecision"],
      toolName: "ask_user",
    });

    expect(result.code).toBe("unknown_tool");
    expect(result.available_tools?.[0]).toBe("askUserSomething");
    expect(result.error).toContain("requestDecision");
  });

  it("reports a REAL tool that produced no result as incomplete, not missing", () => {
    expect(
      buildUnresolvedToolCallResult({
        knownToolNames: ["navigate"],
        toolName: "navigate",
      })
    ).toMatchObject({ code: "tool_did_not_complete" });
  });

  it("does not claim a tool is missing when the tool list is unknown", () => {
    // An empty known-set means enumeration failed; asserting "no such tool"
    // there would be a lie the model then reasons from.
    expect(
      buildUnresolvedToolCallResult({
        knownToolNames: [],
        toolName: "navigate",
      })
    ).toMatchObject({ code: "tool_did_not_complete" });
  });
});
