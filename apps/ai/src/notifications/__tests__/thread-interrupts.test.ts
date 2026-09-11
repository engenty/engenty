import { beforeEach, describe, expect, it, vi } from "vitest";

const emitInboxNotification = vi.fn(async (_input: unknown) => null);
const resolveNotifications = vi.fn(async (_input: unknown) => 1);
vi.mock("../inbox.js", () => ({
  emitInboxNotification: (input: unknown) => emitInboxNotification(input),
  resolveNotifications: (input: unknown) => resolveNotifications(input),
}));

const { notifyThreadInterrupt, resolveThreadInterruptNotifications } =
  await import("../thread-interrupts.js");

const TENANT = "t1";

function storeWith(
  thread: Record<string, unknown> | null,
  people: string[] = []
) {
  return {
    getThread: vi.fn(async () => thread as never),
    listUserParticipants: vi.fn(async () =>
      people.map((user_id) => ({ role: "member" as const, user_id }))
    ),
  };
}

function lastEmit() {
  return emitInboxNotification.mock.calls.at(-1)?.[0] as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  emitInboxNotification.mockClear();
  resolveNotifications.mockClear();
});

describe("notifyThreadInterrupt", () => {
  it("addresses a shared agent's space thread to the space, pre-seen for the person whose turn parked", async () => {
    await notifyThreadInterrupt({
      getAgentConfig: async () => ({ agentScope: "shared" }),
      interruptId: "int-1",
      kind: "agent_question",
      runId: "run-1",
      scope: { tenantId: TENANT, userId: "alice" },
      store: storeWith({
        agent_id: "tim",
        created_by_user_id: "bob",
        space_id: "space-1",
        visibility: "space",
      }),
      threadId: "thr-1",
      title: "Which supplier?",
    });
    expect(lastEmit()).toMatchObject({
      dedupeKey: "thread_interrupt:int-1",
      kind: "agent_question",
      metadata: { interrupt_id: "int-1", run_id: "run-1", thread_id: "thr-1" },
      preSeenUserIds: ["alice"],
      spaceId: "space-1",
      subject: { id: "int-1", type: "thread_interrupt" },
      subscribers: ["bob", "alice"],
      summary: "Which supplier?",
    });
    expect(lastEmit().participantUserIds).toBeUndefined();
  });

  it("fans a private room out to its people", async () => {
    await notifyThreadInterrupt({
      getAgentConfig: async () => ({ agentScope: "shared" }),
      interruptId: "int-2",
      kind: "tool_approval",
      scope: { tenantId: TENANT, userId: "alice" },
      store: storeWith(
        {
          agent_id: "tim",
          created_by_user_id: "alice",
          space_id: "space-1",
          visibility: "private",
        },
        ["carol", "alice"]
      ),
      threadId: "thr-2",
      title: "Send the mail?",
    });
    expect(lastEmit()).toMatchObject({
      participantUserIds: ["alice", "carol"],
      spaceId: "space-1",
    });
  });

  it("keeps a personal agent's thread with its owner even inside a space", async () => {
    await notifyThreadInterrupt({
      getAgentConfig: async () => ({ agentScope: "personal" }),
      interruptId: "int-3",
      kind: "agent_question",
      scope: { tenantId: TENANT, userId: "alice" },
      store: storeWith({
        agent_id: "copilot",
        created_by_user_id: "alice",
        space_id: "space-1",
        visibility: "space",
      }),
      threadId: "thr-3",
      title: "?",
    });
    expect(lastEmit()).toMatchObject({ participantUserIds: ["alice"] });
  });

  it("writes nothing for a thread it cannot find, and never throws", async () => {
    await notifyThreadInterrupt({
      interruptId: "int-4",
      kind: "agent_question",
      scope: { tenantId: TENANT, userId: "alice" },
      store: storeWith(null),
      threadId: "thr-4",
      title: "?",
    });
    expect(emitInboxNotification).not.toHaveBeenCalled();
  });
});

describe("resolveThreadInterruptNotifications", () => {
  it("closes the subject's rows for everyone, and skips when there is no id", async () => {
    await resolveThreadInterruptNotifications({
      interruptId: "int-1",
      outcome: "resumed",
      tenantId: TENANT,
    });
    expect(resolveNotifications).toHaveBeenCalledWith({
      outcome: "resumed",
      subjectId: "int-1",
      subjectType: "thread_interrupt",
      tenantId: TENANT,
    });
    await resolveThreadInterruptNotifications({
      interruptId: null,
      outcome: "abandoned",
      tenantId: TENANT,
    });
    expect(resolveNotifications).toHaveBeenCalledTimes(1);
  });
});
