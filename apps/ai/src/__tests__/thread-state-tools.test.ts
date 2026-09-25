import { beforeEach, describe, expect, it } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import {
  createThreadStateTools,
  THREAD_STATE_SET_TOOL_ID,
} from "../../ai/tools/thread-state-tools.js";
import { buildThreadStateInstructions } from "../ai/sessions/runtime-instructions.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { testToolContext } from "./helpers/tool-context.js";

const THREAD_ID = "019fe8ec-0000-0000-0000-0000000000c1";
const scope: AiSessionScope = {
  tenantId: "tenant-1",
  userId: "user-1",
  credential: { kind: "user", token: "token-thread-state" },
  isSuperAdmin: false,
  isTenantAdmin: false,
  tenantRole: "member",
};

/** In-memory stand-in for the thread row the state channel merges into. */
const rows = new Map<string, Record<string, unknown>>();
let ownerUserId = "user-1";

const getStore = () => ({
  getThread: async ({ threadId }: { threadId: string }) => ({
    metadata: rows.get(threadId) ?? {},
  }),
  mergeThreadMetadataForUser: async ({
    patch,
    threadId,
    userId,
  }: {
    patch?: Record<string, unknown>;
    threadId: string;
    userId: string;
  }) => {
    if (userId !== ownerUserId) {
      return { thread: null };
    }
    rows.set(threadId, { ...(rows.get(threadId) ?? {}), ...patch });
    return { thread: { id: threadId } };
  },
});

function setState(
  input: { key: string; value: unknown },
  threadId = THREAD_ID
) {
  const tool = createThreadStateTools(getStore)[THREAD_STATE_SET_TOOL_ID];
  return engentyToolsRunAls.run(
    {
      orchestratorThreadId: threadId,
      tenantId: scope.tenantId,
      userFacingThreadId: "someone-elses-thread",
      userId: scope.userId,
    },
    () =>
      tool.execute?.(input, testToolContext()) as Promise<
        Record<string, unknown>
      >
  );
}

describe("thread_state_set", () => {
  beforeEach(() => {
    rows.clear();
    ownerUserId = "user-1";
  });

  it("keeps state on the run's OWN thread, and merges key by key", async () => {
    await setState({ key: "current_tense", value: "Perfekt" });
    const second = await setState({ key: "wrong_attempts", value: 1 });

    expect(second.ok).toBe(true);
    expect(rows.get(THREAD_ID)?.agent_state).toEqual({
      current_tense: "Perfekt",
      wrong_attempts: 1,
    });
    expect(rows.has("someone-elses-thread")).toBe(false);
  });

  it("fails loudly on a thread the user does not own", async () => {
    ownerUserId = "someone-else";
    await expect(
      setState({ key: "current_tense", value: "Perfekt" })
    ).rejects.toThrow(/not owned/);
  });
});

describe("thread state in the runtime instructions", () => {
  beforeEach(() => {
    rows.clear();
    ownerUserId = "user-1";
  });

  it("shows the next turn what the agent stored", async () => {
    await setState({ key: "current_tense", value: "Perfekt" });
    await setState({ key: "covered", value: ["Präsens"] });

    const block = await buildThreadStateInstructions({
      getStore,
      scope,
      threadId: THREAD_ID,
    });
    expect(block).toContain("Perfekt");
    expect(block).toContain("Präsens");
  });
});
