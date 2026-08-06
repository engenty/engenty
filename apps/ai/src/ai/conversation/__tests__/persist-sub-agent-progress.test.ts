import { describe, expect, it, vi } from "vitest";
import type { ThreadStore } from "../../../dal/threads/index.js";
import { persistSubAgentProgress } from "../persist-sub-agent-progress.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";

function makeStore(rows: unknown[]): ThreadStore {
  return {
    listMessagesOrdered: vi.fn(async () => rows),
    updateMessageParts: vi.fn(async (input: { parts: unknown }) => ({
      message: { parts: input.parts },
    })),
  } as unknown as ThreadStore;
}

describe("persistSubAgentProgress", () => {
  const baseInput = (store: ThreadStore, progress: [string, string[]][]) => ({
    progressByToolCallId: new Map(progress),
    scope: { tenantId, userId },
    store,
    threadId,
  });

  it("folds accumulated lines onto the matching agent-* delegation part", async () => {
    const store = makeStore([
      {
        id: "m1",
        parts: [
          { text: "ok", type: "text" },
          {
            type: "tool-invocation",
            toolInvocation: {
              state: "result",
              toolCallId: "deleg1",
              toolName: "agent-engenty_cli",
            },
          },
        ],
      },
    ]);

    await persistSubAgentProgress(
      baseInput(store, [["deleg1", ["Running ls", "Done"]]])
    );

    expect(store.updateMessageParts).toHaveBeenCalledTimes(1);
    const written = (store.updateMessageParts as ReturnType<typeof vi.fn>).mock
      .calls[0][0].parts as Array<{ progressLines?: string[] }>;
    expect(written[1]?.progressLines).toEqual(["Running ls", "Done"]);
  });

  it("ignores non-delegation tools and is a no-op with no progress", async () => {
    const store = makeStore([
      {
        id: "m1",
        parts: [
          {
            type: "tool-invocation",
            toolInvocation: { toolCallId: "t1", toolName: "list_tasks" },
          },
        ],
      },
    ]);

    // A normal tool with a (mismatched) progress entry → no write.
    await persistSubAgentProgress(baseInput(store, [["t1", ["x"]]]));
    expect(store.updateMessageParts).not.toHaveBeenCalled();

    // Empty progress map → never even reads.
    const store2 = makeStore([]);
    await persistSubAgentProgress(baseInput(store2, []));
    expect(store2.listMessagesOrdered).not.toHaveBeenCalled();
  });

  it("does not overwrite a part that already carries progressLines", async () => {
    const store = makeStore([
      {
        id: "m1",
        parts: [
          {
            progressLines: ["already here"],
            type: "tool-invocation",
            toolInvocation: {
              toolCallId: "deleg1",
              toolName: "agent-engenty_cli",
            },
          },
        ],
      },
    ]);

    await persistSubAgentProgress(baseInput(store, [["deleg1", ["new"]]]));
    expect(store.updateMessageParts).not.toHaveBeenCalled();
  });
});
